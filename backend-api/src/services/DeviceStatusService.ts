import net from 'net';
import { PrismaClient } from '@prisma/client';
import { VideoDoorbellService } from './VideoDoorbellService';
import { NiceGuaritaProtocol } from './NiceGuaritaProtocol';
import { HikCentralService } from './HikCentralService';
import { FacialAccessService } from './FacialAccessService';
import { digestFetch } from '../utils/digest-fetch.utils';

const prisma = new PrismaClient();

/** Checagem de conectividade dos dispositivos de vídeo do VMS (câmeras/NVRs/DVRs). */
const VmsDeviceStatus = {
  async testConnection(d: { protocol: string; ip: string; httpPort: number; rtspPort: number; username: string; password: string }): Promise<boolean> {
    if (d.protocol === 'hikvision_isapi') {
      try {
        const res = await digestFetch(`http://${d.ip}:${d.httpPort}/ISAPI/System/deviceInfo`, d.username, d.password);
        return res.ok || res.status === 401;
      } catch {
        return false;
      }
    }
    // onvif/rtsp genérico: alcance TCP na porta RTSP
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
      socket.setTimeout(4000);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(d.rtspPort, d.ip);
    });
  },
};

export interface DeviceStatusEntry {
  id: string;
  name: string;
  status: 'online' | 'offline';
  ip?: string;
  type?: string;
  location?: string | null;
}

/**
 * Agrega o status de TODOS os dispositivos que a plataforma conhece:
 *   - videoporteiros locais (doorbell_devices, checagem ISAPI direta)
 *   - módulos Guarita MG3000 locais (guarita_devices, ping do protocolo Nice)
 *   - controladores do HikCentral (apenas quando a integração está configurada)
 * No modo standalone (sem HikCentral) os dispositivos locais continuam sendo
 * verificados — antes o endpoint dependia só do HikCentral e tudo aparecia
 * offline/vazio mesmo com os equipamentos respondendo na rede.
 */
export class DeviceStatusService {

  // ── Cache com atualização em segundo plano ─────────────────────────────────
  // As sondas de conectividade custam caro quando há equipamento fora do ar
  // (até 5s de timeout cada; pings de Guarita ao MESMO módulo são serializados
  // na conexão compartilhada — 4 portões inalcançáveis = ~20s). O dashboard e a
  // página de status leem o cache; a varredura real roda em background.
  private static cache: DeviceStatusEntry[] = [];
  private static lastRefresh = 0;
  private static refreshing: Promise<DeviceStatusEntry[]> | null = null;
  private static readonly MAX_AGE_MS = 90_000;

  /** Status agregado — responde na hora com o último resultado conhecido. */
  static async getAll(): Promise<DeviceStatusEntry[]> {
    const age = Date.now() - this.lastRefresh;
    if (this.lastRefresh > 0 && age < this.MAX_AGE_MS) {
      if (age > 30_000) void this.refresh().catch(() => {}); // renova em background
      return this.cache;
    }
    return this.refresh(); // boot/cache expirado: varredura síncrona única
  }

  /** Varredura real (coalescida: chamadas concorrentes compartilham a mesma). */
  static async refresh(): Promise<DeviceStatusEntry[]> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      try {
        const [local, hik] = await Promise.all([
          this.getLocalDevices(),
          this.getHikCentralDevices(),
        ]);
        this.cache = [...local, ...hik];
        this.lastRefresh = Date.now();
        return this.cache;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** Mantém o cache quente — chamado uma vez no boot (server.ts). */
  static startBackgroundRefresh(intervalMs = 30_000): void {
    void this.refresh().catch(() => {});
    setInterval(() => { void this.refresh().catch(() => {}); }, intervalMs);
  }

  private static async getLocalDevices(): Promise<DeviceStatusEntry[]> {
    const [doorbells, guaritas, facialDevices, videoDevices] = await Promise.all([
      prisma.doorbellDevice.findMany({ where: { enabled: true } }),
      prisma.guaritaDevice.findMany({ where: { enabled: true } }),
      prisma.facialAccessDevice.findMany({ where: { enabled: true } }),
      prisma.videoDevice.findMany({ where: { enabled: true } }),
    ]);

    // Vários "portões" lógicos do Guarita compartilham o mesmo módulo físico
    // (ip:porta) — pinga cada módulo uma vez e reaproveita o resultado.
    const guaritaPings = new Map<string, Promise<boolean>>();
    const pingGuarita = (ip: string, port: number) => {
      const key = `${ip}:${port}`;
      if (!guaritaPings.has(key)) guaritaPings.set(key, NiceGuaritaProtocol.ping(ip, port));
      return guaritaPings.get(key)!;
    };

    const checks: Promise<DeviceStatusEntry>[] = [
      ...doorbells.map(async (d): Promise<DeviceStatusEntry> => ({
        id: d.id,
        name: d.name,
        ip: d.ip,
        type: 'Videoporteiro',
        location: d.location,
        status: (await VideoDoorbellService.testConnection(d.ip, d.port, d.username, d.password))
          ? 'online' : 'offline',
      })),
      ...guaritas.map(async (d): Promise<DeviceStatusEntry> => ({
        id: d.id,
        name: d.name,
        ip: d.ip,
        type: 'Guarita IP (MG3000)',
        location: d.location,
        status: (await pingGuarita(d.ip, d.port)) ? 'online' : 'offline',
      })),
      ...facialDevices.map(async (d): Promise<DeviceStatusEntry> => ({
        id: d.id,
        name: d.name,
        ip: d.ip,
        type: d.role === 'controller' ? 'Controladora Facial' : 'Leitor Facial',
        location: d.location,
        status: (await FacialAccessService.testConnection(d.ip, d.port, d.username, d.password))
          ? 'online' : 'offline',
      })),
      ...videoDevices.map(async (d): Promise<DeviceStatusEntry> => ({
        id: d.id,
        name: d.name,
        ip: d.ip,
        type: d.kind === 'nvr' ? 'NVR' : d.kind === 'dvr' ? 'DVR' : 'Câmera IP',
        location: d.location,
        status: (await VmsDeviceStatus.testConnection(d)) ? 'online' : 'offline',
      })),
    ];

    return Promise.all(checks);
  }

  private static async getHikCentralDevices(): Promise<DeviceStatusEntry[]> {
    try {
      // Standalone: sem HikCentral configurado, nem tenta a chamada
      if (!(await HikCentralService.isConfigured())) return [];
      const deviceResult: any = await HikCentralService.getAcsDeviceList(1, 100);
      const devices = deviceResult?.data?.list || [];
      return devices.map((d: any): DeviceStatusEntry => ({
        id: d.acsDevIndexCode || d.acsDeviceIndexCode,
        name: d.acsDevName || d.acsDeviceName,
        status: d.status === 1 ? 'online' : 'offline',
        ip: d.acsDevIp || d.acsDeviceIp,
        type: d.treatyType || d.acsDeviceType,
      }));
    } catch {
      // Standalone: HikCentral não configurado — só dispositivos locais
      return [];
    }
  }
}
