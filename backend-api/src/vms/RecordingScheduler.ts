import { prisma } from '../database';
import { MediaMtxClient } from './MediaMtxClient';
import { subPathName } from './rtsp';
import { isDiskCritical } from './disk';
import { VMS_ALWAYS_ON } from './config';

export type RecordTrigger = 'continuous' | 'schedule' | 'motion' | 'manual';

/** Gravação manual sem parada explícita é encerrada sozinha (evita encher o disco). */
const MANUAL_MAX_MINUTES = 60;

interface ScheduleWindow {
  dow: number[]; // 0=domingo .. 6=sábado
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Janela com start > end atravessa a meia-noite (ex.: 22:00–06:00). */
export function inSchedule(schedule: unknown, now: Date): boolean {
  if (!Array.isArray(schedule)) return false;
  const dow = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (const w of schedule as ScheduleWindow[]) {
    if (!w || !Array.isArray(w.dow) || !w.start || !w.end) continue;
    const start = toMinutes(w.start);
    const end = toMinutes(w.end);
    if (start <= end) {
      if (w.dow.includes(dow) && minutes >= start && minutes < end) return true;
    } else {
      // atravessa a meia-noite: [start, 24h) no dia listado, [0, end) no dia seguinte
      if (w.dow.includes(dow) && minutes >= start) return true;
      const prevDow = (dow + 6) % 7;
      if (w.dow.includes(prevDow) && minutes < end) return true;
    }
  }
  return false;
}

/**
 * Decide, a cada tick, se cada canal deve estar gravando e aplica no MediaMTX
 * (PATCH record/sourceOnDemand no path). Mantém o último estado aplicado em
 * memória para só chamar a API quando algo muda.
 */
export class RecordingScheduler {
  private applied = new Map<string, boolean>();          // pathName -> record aplicado
  private pathTrigger = new Map<string, RecordTrigger>(); // pathName -> motivo da gravação ativa
  private motionUntil = new Map<string, number>();        // channelId -> epoch ms
  private manualUntil = new Map<string, number>();        // channelId -> epoch ms (gravação manual)
  private manualStartedAt = new Map<string, Date>();      // channelId -> início da gravação manual
  private diskWarned = false;                            // evita spam de log do disco cheio

  constructor(private mtx: MediaMtxClient) {}

  /** Chamado pelo MotionWatcher a cada evento de movimento do canal. */
  noteMotion(channelId: string, postEventSec: number): void {
    this.motionUntil.set(channelId, Date.now() + Math.max(postEventSec, 5) * 1000);
  }

  /**
   * Gravação manual (botão REC do operador). Vale independentemente do modo
   * configurado — inclusive em canais com gravação desligada. Expira sozinha
   * após MANUAL_MAX_MINUTES, para um clique esquecido não lotar o disco.
   */
  setManual(channelId: string, active: boolean): void {
    if (active) {
      this.manualUntil.set(channelId, Date.now() + MANUAL_MAX_MINUTES * 60_000);
      this.manualStartedAt.set(channelId, new Date());
    } else {
      this.manualUntil.delete(channelId);
    }
  }

  /** Início da última gravação manual do canal (usado para achar o clipe gerado). */
  manualStart(channelId: string): Date | undefined {
    return this.manualStartedAt.get(channelId);
  }

  isManual(channelId: string): boolean {
    return (this.manualUntil.get(channelId) ?? 0) > Date.now();
  }

  /** Canais gravando manualmente agora (para a UI acender o botão REC). */
  manualChannels(): string[] {
    const now = Date.now();
    return [...this.manualUntil.entries()].filter(([, until]) => until > now).map(([id]) => id);
  }

  /** Motivo da gravação em curso num path — usado pelo SegmentIndexer. */
  triggerForPath(pathName: string): RecordTrigger {
    return this.pathTrigger.get(pathName) ?? 'continuous';
  }

  /** Descarta estado aplicado (força re-aplicação no próximo tick). */
  reset(): void {
    this.applied.clear();
  }

  async tick(): Promise<void> {
    // inclui canais SEM config de gravação: eles podem estar gravando manualmente
    const channels = await prisma.videoChannel.findMany({
      where: { enabled: true, device: { enabled: true } },
      include: { recording: true },
    });

    // Disco no limite: pausa TODA a gravação. Escrever até encher trava o
    // MediaMTX (e ameaça o PostgreSQL) — melhor perder gravação que o sistema.
    const diskCritical = await isDiskCritical();
    if (diskCritical && !this.diskWarned) {
      console.error('[VMS] Disco quase cheio — gravação PAUSADA até haver espaço livre');
      this.diskWarned = true;
    } else if (!diskCritical && this.diskWarned) {
      console.log('[VMS] Espaço em disco restabelecido — gravação retomada');
      this.diskWarned = false;
    }

    const now = new Date();
    for (const channel of channels) {
      const cfg = channel.recording;
      let shouldRecord = false;
      let trigger: RecordTrigger = 'continuous';

      switch (cfg?.mode) {
        case 'continuous':
          shouldRecord = true;
          trigger = 'continuous';
          break;
        case 'scheduled':
          shouldRecord = inSchedule(cfg.schedule, now);
          trigger = 'schedule';
          break;
        case 'motion':
          shouldRecord = (this.motionUntil.get(channel.id) ?? 0) > Date.now();
          trigger = 'motion';
          break;
        default:
          shouldRecord = false;
      }

      // o botão REC do operador vence a configuração (grava mesmo com modo "off")
      if (this.isManual(channel.id)) {
        shouldRecord = true;
        trigger = 'manual';
      }

      if (diskCritical) shouldRecord = false;

      const pathName = cfg?.useSubStream ? subPathName(channel.streamPath) : channel.streamPath;
      if (this.applied.get(pathName) === shouldRecord) continue;

      try {
        // Com VMS_ALWAYS_ON a fonte fica sempre conectada (abrir o app não
        // espera o RTSP subir); sem ele, só se mantém conectada enquanto grava.
        await this.mtx.patchPath(pathName, {
          record: shouldRecord,
          ...(VMS_ALWAYS_ON ? {} : { sourceOnDemand: !shouldRecord }),
        });
        this.applied.set(pathName, shouldRecord);
        if (shouldRecord) {
          this.pathTrigger.set(pathName, trigger);
          console.log(`[VMS] Gravação LIGADA em ${pathName} (${trigger})`);
        } else {
          console.log(`[VMS] Gravação desligada em ${pathName}`);
        }
      } catch (err: any) {
        console.error(`[VMS] Falha ao alternar gravação em ${pathName}: ${err.message}`);
      }
    }
  }
}
