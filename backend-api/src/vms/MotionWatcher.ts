import fetch from 'node-fetch';
import { prisma } from '../database';
import { digestFetch } from '../utils/digest-fetch.utils';
import { RecordingScheduler } from './RecordingScheduler';
import { VMS_BACKEND_API_URL, VMS_INTERNAL_TOKEN } from './config';

const RETRY_DELAY_MS = 10_000;
const EVENT_THROTTLE_MS = 30_000; // no máx. 1 evento SSE por canal/tipo a cada 30s

/**
 * Eventos ISAPI (alertStream) que podem disparar gravação. Chave = eventType
 * normalizado (minúsculo); valor = rótulo exibido no feed de eventos.
 * VMD é a detecção de movimento básica; os demais são eventos VCA/Smart
 * (exigem que as linhas/áreas estejam desenhadas na interface da câmera).
 */
export const VCA_EVENT_LABELS: Record<string, string> = {
  vmd: 'Movimento',
  motiondetection: 'Movimento',
  linedetection: 'Cruzamento de linha',
  fielddetection: 'Intrusão em área',
  regionentrance: 'Entrada em região',
  regionexiting: 'Saída de região',
  loitering: 'Permanência suspeita',
  unattendedbaggage: 'Objeto abandonado',
  attendedbaggage: 'Objeto removido',
  facedetection: 'Rosto detectado',
  audioexception: 'Exceção de áudio',
  scenechangedetection: 'Câmera deslocada/coberta',
};

/** "motiondetection" conta como "vmd" na configuração do canal. */
function normalizeEventType(eventType: string): string {
  const t = eventType.toLowerCase();
  return t === 'motiondetection' ? 'vmd' : t;
}

interface WatchedDevice {
  id: string;
  name: string;
  ip: string;
  httpPort: number;
  username: string;
  password: string;
}

/**
 * Mantém um long-poll ISAPI `/ISAPI/Event/notification/alertStream` por
 * dispositivo Hikvision que tenha algum canal em modo de gravação "motion"
 * (por evento). Cada evento compatível com os eventTypes configurados no canal
 * ativa a flag de gravação no RecordingScheduler e é repassado ao backend-api
 * para o feed SSE.
 */
export class MotionWatcher {
  private active = new Map<string, { stop: boolean }>(); // deviceId -> handle
  private lastEventAt = new Map<string, number>();       // channelId:tipo -> epoch ms

  constructor(private scheduler: RecordingScheduler) {}

  /** Reconcilia os watchers com o banco (chamado no boot, no reload e a cada 60s). */
  async sync(): Promise<void> {
    const devices = await prisma.videoDevice.findMany({
      where: {
        enabled: true,
        protocol: 'hikvision_isapi',
        channels: { some: { enabled: true, recording: { is: { mode: 'motion' } } } },
      },
    });

    const wanted = new Set(devices.map((d) => d.id));
    for (const [deviceId, handle] of this.active) {
      if (!wanted.has(deviceId)) {
        handle.stop = true;
        this.active.delete(deviceId);
      }
    }
    for (const device of devices) {
      if (!this.active.has(device.id)) {
        const handle = { stop: false };
        this.active.set(device.id, handle);
        void this.watchLoop(device, handle);
      }
    }
  }

  private async watchLoop(device: WatchedDevice, handle: { stop: boolean }): Promise<void> {
    const url = `http://${device.ip}:${device.httpPort}/ISAPI/Event/notification/alertStream`;
    console.log(`[VMS] Event watcher iniciado: ${device.name} (${device.ip})`);

    while (!handle.stop) {
      try {
        const res = await digestFetch(url, device.username, device.password, 'GET', undefined, undefined, { timeoutMs: 0 });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        let buffer = '';
        for await (const chunk of res.body) {
          if (handle.stop) break;
          buffer += chunk.toString('utf-8');
          // blocos XML chegam separados por boundary multipart; processa e descarta
          let idx: number;
          while ((idx = buffer.indexOf('</EventNotificationAlert>')) !== -1) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + '</EventNotificationAlert>'.length);
            await this.handleEventBlock(device, block);
          }
          if (buffer.length > 65536) buffer = buffer.slice(-16384); // proteção contra lixo sem fechamento
        }
      } catch (err: any) {
        if (!handle.stop) {
          console.warn(`[VMS] alertStream de ${device.name} caiu (${err.message}) — reconectando em ${RETRY_DELAY_MS / 1000}s`);
        }
      }
      if (!handle.stop) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
    console.log(`[VMS] Event watcher encerrado: ${device.name}`);
  }

  private async handleEventBlock(device: WatchedDevice, xml: string): Promise<void> {
    const rawType = xml.match(/<eventType>([^<]+)<\/eventType>/i)?.[1]?.trim().toLowerCase();
    const eventState = xml.match(/<eventState>([^<]+)<\/eventState>/i)?.[1]?.trim().toLowerCase();
    if (!rawType || eventState !== 'active') return;

    const label = VCA_EVENT_LABELS[rawType];
    if (!label) return; // videoloss/heartbeat e afins

    const eventType = normalizeEventType(rawType);
    const channelNo = Number(
      xml.match(/<channelID>(\d+)<\/channelID>/i)?.[1]
      ?? xml.match(/<dynChannelID>(\d+)<\/dynChannelID>/i)?.[1]
      ?? '1',
    );

    const channel = await prisma.videoChannel.findFirst({
      where: { deviceId: device.id, channelNo, enabled: true, recording: { is: { mode: 'motion' } } },
      include: { recording: true },
    });
    if (!channel) return;

    // eventTypes configurados no canal (null/vazio = só movimento)
    const configured = Array.isArray(channel.recording?.eventTypes)
      ? (channel.recording!.eventTypes as string[]).map((t) => normalizeEventType(String(t)))
      : ['vmd'];
    if (!configured.includes(eventType)) return;

    this.scheduler.noteMotion(channel.id, channel.recording?.postEventSec ?? 30);

    const throttleKey = `${channel.id}:${eventType}`;
    const last = this.lastEventAt.get(throttleKey) ?? 0;
    if (Date.now() - last < EVENT_THROTTLE_MS) return;
    this.lastEventAt.set(throttleKey, Date.now());

    try {
      await fetch(`${VMS_BACKEND_API_URL}/api/vms/internal/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-vms-token': VMS_INTERNAL_TOKEN },
        body: JSON.stringify({
          type: eventType,
          label,
          channelId: channel.id,
          channelName: channel.name,
          deviceName: device.name,
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: any) {
      console.warn(`[VMS] Falha ao notificar evento ao backend: ${err.message}`);
    }
  }
}
