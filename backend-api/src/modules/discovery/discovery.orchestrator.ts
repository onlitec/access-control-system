/**
 * discovery.orchestrator.ts
 * Orquestrador central de descoberta de dispositivos de rede.
 * Coordena as 4 camadas (ONVIF, SADP, mDNS, ARP) em paralelo,
 * deduplica por MAC/IP e emite resultados via SSE para os clientes conectados.
 */

import { Response } from 'express';
import { onvifScan } from './onvifDiscovery.service';
import { sadpScan } from './sadpDiscovery.service';
import { mdnsScan } from './mdnsDiscovery.service';
import { arpScan } from './arpScan.service';
import { digestFetch } from '../../utils/digest-fetch.utils';
import { inferDeviceType } from './device-fingerprint.util';

/** Representação de um dispositivo encontrado durante o discovery. */
export interface DiscoveredDevice {
  tempId:          string;
  ipAddress:       string;
  macAddress:      string | null;
  protocolType:    'onvif' | 'sadp' | 'mdns' | 'arp' | 'manual';
  manufacturer:    string | null;
  model:           string | null;
  serialNumber:    string | null;
  firmwareVersion: string | null;
  deviceType:      'camera' | 'nvr' | 'dvr' | 'facial' | 'intercom' | 'controller' | 'unknown';
  httpPort:        number;
  sdkPort:         number;
  subnetMask:      string | null;
  gateway:         string | null;
  dhcpEnabled:     boolean;
  isActivated:     boolean;
  isAdded:         boolean;
  /** Preenchido quando o IP já pertence a uma integração ativa (ex.: "Terminal Facial · Facial Portaria"). */
  knownAs?:        string | null;
}

/** Equipamento já cadastrado numa integração do sistema (facial, VMS, videoporteiro, guarita). */
export interface KnownDevice {
  label:    string;             // "Terminal Facial · Facial Portaria"
  kind:     DiscoveredDevice['deviceType'];
  port?:    number;
  username?: string;
  password?: string;
}

// ── SSE Registry ──────────────────────────────────────────────────────────────
const scanClients = new Map<string, Response>();

export function registerScanClient(res: Response): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  scanClients.set(id, res);
  return id;
}

export function unregisterScanClient(id: string): void {
  scanClients.delete(id);
}

function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, res] of scanClients) {
    try {
      res.write(payload);
    } catch {
      scanClients.delete(id);
    }
  }
}

// ── Deduplicação ──────────────────────────────────────────────────────────────

/** Mapa em memória dos dispositivos encontrados na última varredura. */
let lastScanDevices = new Map<string, DiscoveredDevice>();
let scanRunning = false;

function deduplicationKey(d: DiscoveredDevice): string {
  return d.macAddress?.toLowerCase() ?? d.ipAddress;
}

/**
 * O mesmo equipamento chega por várias camadas, e nem todas trazem MAC (só o ARP
 * traz) — deduplicar apenas pela chave MAC-ou-IP fazia o dispositivo aparecer
 * duas vezes (uma indexada pelo MAC, outra pelo IP). Aqui a busca é por MAC
 * **ou** IP, então as camadas convergem para um único registro.
 */
function findExistingKey(d: DiscoveredDevice): string | undefined {
  const mac = d.macAddress?.toLowerCase();
  if (mac && lastScanDevices.has(mac)) return mac;
  for (const [key, existing] of lastScanDevices) {
    if (existing.ipAddress === d.ipAddress) return key;
  }
  return undefined;
}

function handleDiscovered(device: DiscoveredDevice, isAdded: boolean): void {
  device.isAdded = isAdded;
  const existingKey = findExistingKey(device);

  if (existingKey) {
    // Já emitido — outra camada pode ter trazido MAC/modelo/serial que faltavam
    const enriched = mergeDevice(lastScanDevices.get(existingKey)!, device);
    lastScanDevices.delete(existingKey);
    lastScanDevices.set(deduplicationKey(enriched), enriched);
    broadcast('device-found', enriched); // o frontend faz merge por IP
    return;
  }

  lastScanDevices.set(deduplicationKey(device), device);
  broadcast('device-found', device);
}

/** Mescla informações de dois registros do mesmo dispositivo (diferentes protocolos). */
function mergeDevice(base: DiscoveredDevice, incoming: DiscoveredDevice): DiscoveredDevice {
  return {
    ...base,
    macAddress:      base.macAddress ?? incoming.macAddress,
    manufacturer:    base.manufacturer ?? incoming.manufacturer,
    model:           base.model ?? incoming.model,
    serialNumber:    base.serialNumber ?? incoming.serialNumber,
    firmwareVersion: base.firmwareVersion ?? incoming.firmwareVersion,
    subnetMask:      base.subnetMask ?? incoming.subnetMask,
    gateway:         base.gateway ?? incoming.gateway,
    knownAs:         base.knownAs ?? incoming.knownAs,
    isAdded:         base.isAdded || incoming.isAdded,
    // Protocolo de maior prioridade: onvif > sadp > mdns > arp
    protocolType:    priorityProtocol(base.protocolType, incoming.protocolType),
    deviceType:      base.deviceType !== 'unknown' ? base.deviceType : incoming.deviceType,
  };
}

const PROTOCOL_PRIORITY = ['onvif', 'sadp', 'mdns', 'arp', 'manual'];
function priorityProtocol(
  a: DiscoveredDevice['protocolType'],
  b: DiscoveredDevice['protocolType'],
): DiscoveredDevice['protocolType'] {
  return PROTOCOL_PRIORITY.indexOf(a) <= PROTOCOL_PRIORITY.indexOf(b) ? a : b;
}

/**
 * Consulta o equipamento com as credenciais que já temos no cadastro para obter
 * modelo/serial/firmware verdadeiros. Sem credencial, o melhor que a varredura
 * consegue é o realm do Digest — que na Hikvision é um código interno, não o
 * modelo. Best-effort: falhou, mantém o que já tinha.
 */
async function enrichFromDevice(device: DiscoveredDevice, known: KnownDevice): Promise<void> {
  if (!known.username || !known.password) return;
  try {
    const port = known.port ?? device.httpPort;
    const res = await digestFetch(
      `http://${device.ipAddress}:${port}/ISAPI/System/deviceInfo`,
      known.username, known.password, 'GET', undefined, undefined, { timeoutMs: 4000 },
    );
    if (!res.ok) return;
    const xml = await res.text();
    const tag = (n: string) => xml.match(new RegExp(`<${n}>([^<]+)</${n}>`, 'i'))?.[1]?.trim() ?? null;

    const model = tag('model');
    const key = deduplicationKey(device);
    const current = lastScanDevices.get(key);
    if (!current) return;

    const manufacturer = tag('manufacturer') ?? current.manufacturer ?? 'Hikvision';
    // Com o modelo real em mãos o tipo pode ser reclassificado (ex.: DS-K1T673
    // é terminal facial, não "câmera" só porque expõe stream). O tipo vindo do
    // cadastro (known.kind) tem a palavra final quando conhecido.
    const inferred = inferDeviceType([], model, manufacturer);

    const updated: DiscoveredDevice = {
      ...current,
      manufacturer,
      model:           model ?? current.model,
      serialNumber:    tag('serialNumber') ?? current.serialNumber,
      firmwareVersion: tag('firmwareVersion') ?? current.firmwareVersion,
      deviceType:      known.kind !== 'unknown' ? known.kind
                      : inferred !== 'unknown' ? inferred
                      : current.deviceType,
    };
    lastScanDevices.set(key, updated);
    // Reemite: o frontend faz merge por IP, então o card se atualiza sozinho
    broadcast('device-found', updated);
  } catch { /* equipamento offline ou credencial mudou — ignora */ }
}

// ── Orquestração ──────────────────────────────────────────────────────────────

export interface ScanOptions {
  /** Prefixo de sub-rede para o ARP scan (ex: "192.168.1"). Se omitido, detecta automaticamente. */
  subnetPrefix?: string;
  /** Timeout total da varredura rápida (ONVIF+SADP+mDNS). Default: 6s. */
  fastTimeoutMs?: number;
  /** Executa o ARP scan em background (mais lento). Default: true. */
  arpEnabled?: boolean;
  /** IDs dos dispositivos já cadastrados para marcar isAdded corretamente. */
  addedIps?: Set<string>;
  addedMacs?: Set<string>;
  /** Equipamentos já integrados (facial/VMS/videoporteiro/guarita), por IP. */
  knownByIp?: Map<string, KnownDevice>;
}

/**
 * Inicia uma varredura completa de rede.
 * Retorna imediatamente; os resultados chegam via SSE (broadcast).
 */
export async function startScan(options: ScanOptions = {}): Promise<{ count: number }> {
  if (scanRunning) {
    return { count: lastScanDevices.size };
  }

  scanRunning = true;
  lastScanDevices = new Map();
  broadcast('scan-started', { timestamp: new Date().toISOString() });

  const { addedIps = new Set(), addedMacs = new Set(), arpEnabled = true, knownByIp = new Map() } = options;

  const onDevice = (d: DiscoveredDevice) => {
    const alreadyAdded =
      addedIps.has(d.ipAddress) ||
      (d.macAddress ? addedMacs.has(d.macAddress.toLowerCase()) : false);

    // Equipamento que já é gerenciado por uma integração (facial, câmera do VMS,
    // videoporteiro, guarita): sabemos exatamente o que ele é, então o rótulo e o
    // tipo vêm do cadastro em vez de heurística de OUI/porta.
    const known = knownByIp.get(d.ipAddress);
    if (known) {
      d.knownAs = known.label;
      if (d.deviceType === 'unknown') d.deviceType = known.kind;
      void enrichFromDevice(d, known); // busca modelo/serial reais em segundo plano
    }

    handleDiscovered(d, alreadyAdded);
  };

  try {
    // Fase 1: ONVIF + SADP + mDNS em paralelo (mais rápidos, protocolos ativos)
    await Promise.allSettled([
      onvifScan(onDevice).catch((e) => console.warn('[Discovery/ONVIF]', e?.message)),
      sadpScan(onDevice).catch((e) => console.warn('[Discovery/SADP]', e?.message)),
      mdnsScan(onDevice).catch((e) => console.warn('[Discovery/mDNS]', e?.message)),
    ]);

    broadcast('fast-scan-complete', {
      count: lastScanDevices.size,
      timestamp: new Date().toISOString(),
    });

    // Fase 2: ARP scan em background (não bloqueia a resposta HTTP)
    if (arpEnabled) {
      arpScan(onDevice, { subnetPrefix: options.subnetPrefix })
        .catch((e) => console.warn('[Discovery/ARP]', e?.message))
        .finally(() => {
          broadcast('scan-complete', {
            count: lastScanDevices.size,
            timestamp: new Date().toISOString(),
          });
          scanRunning = false;
        });
    } else {
      broadcast('scan-complete', {
        count: lastScanDevices.size,
        timestamp: new Date().toISOString(),
      });
      scanRunning = false;
    }
  } catch (e) {
    broadcast('scan-error', { message: String(e) });
    scanRunning = false;
  }

  return { count: lastScanDevices.size };
}

/** Retorna os dispositivos encontrados na última varredura (em memória). */
export function getLastScanDevices(): DiscoveredDevice[] {
  return Array.from(lastScanDevices.values());
}

/** Retorna um dispositivo temporário pelo tempId (para o endpoint de registro). */
export function getDeviceByTempId(tempId: string): DiscoveredDevice | undefined {
  for (const d of lastScanDevices.values()) {
    if (d.tempId === tempId) return d;
  }
  return undefined;
}
