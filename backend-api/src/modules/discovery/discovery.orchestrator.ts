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

function handleDiscovered(device: DiscoveredDevice, isAdded: boolean): void {
  device.isAdded = isAdded;
  const key = deduplicationKey(device);

  if (lastScanDevices.has(key)) {
    // Já emitido — pode enriquecer se nova camada trouxe mais info
    const existing = lastScanDevices.get(key)!;
    const enriched = mergeDevice(existing, device);
    lastScanDevices.set(key, enriched);
    // Não re-emite para não duplicar no frontend
    return;
  }

  lastScanDevices.set(key, device);
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

  const { addedIps = new Set(), addedMacs = new Set(), arpEnabled = true } = options;

  const onDevice = (d: DiscoveredDevice) => {
    const alreadyAdded =
      addedIps.has(d.ipAddress) ||
      (d.macAddress ? addedMacs.has(d.macAddress.toLowerCase()) : false);
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
