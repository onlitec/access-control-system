import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { RecordingScheduler } from '../RecordingScheduler';
import { VMS_BACKEND_API_URL, VMS_INTERNAL_TOKEN, VMS_RECORDINGS_DIR } from '../config';
import type { Detection } from './Detector';
import { DETECTOR_INPUT } from './Detector';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
/** Snapshots ao lado das gravações; servidos pelo backend (rota vca-snapshots). */
export const VCA_SNAPSHOT_DIR = path.join(path.dirname(VMS_RECORDINGS_DIR), 'vca-snapshots');

export interface VcaHit {
  channelId: string;
  channelName: string;
  deviceName: string | null;
  ruleName: string;
  ruleType: string;      // motion_zone | line_cross | intrusion
  actions: string[];     // record | alert | notify | snapshot
  postEventSec: number;
  notifyTargets?: { emails?: string[]; phones?: string[] };
  det: Detection;
  frameRgb: Buffer;      // frame 640x640 que disparou (para o snapshot)
}

/**
 * Executa as ações de um disparo VCA. Reaproveita o que já existe: `noteMotion`
 * (mesma flag que a gravação por movimento usa) e o endpoint interno de eventos
 * (mesmo caminho SSE do feed do operador).
 */
export class Actions {
  constructor(private scheduler: RecordingScheduler) {}

  async fire(hit: VcaHit): Promise<void> {
    // 1. gravar (arma a mesma janela temporal da gravação por movimento)
    if (hit.actions.includes('record')) {
      this.scheduler.noteMotion(hit.channelId, hit.postEventSec);
    }

    // 2. snapshot do frame do evento (também usado como thumbnail do alerta)
    let snapshotUrl: string | null = null;
    if (hit.actions.includes('snapshot') || hit.actions.includes('alert') || hit.actions.includes('notify')) {
      snapshotUrl = await this.saveSnapshot(hit).catch((e) => {
        console.error('[VCA] snapshot falhou:', e.message); return null;
      });
    }

    // 3. alerta no feed do operador (SSE via backend-api)
    if (hit.actions.includes('alert')) {
      await this.emit(hit, snapshotUrl).catch((e) => console.error('[VCA] emit falhou:', e.message));
    }

    // 4. notificação externa (e-mail/WhatsApp) — Fase 5
    if (hit.actions.includes('notify') && hit.notifyTargets) {
      await this.notify(hit, snapshotUrl).catch((e) => console.error('[VCA] notify falhou:', e.message));
    }
  }

  /** Codifica o frame RGB640 em JPEG (via ffmpeg) e grava em disco; devolve a URL. */
  private async saveSnapshot(hit: VcaHit): Promise<string> {
    const dir = path.join(VCA_SNAPSHOT_DIR, hit.channelId);
    await fs.mkdir(dir, { recursive: true });
    const name = `${Date.now()}.jpg`;
    const file = path.join(dir, name);
    await new Promise<void>((resolve, reject) => {
      const ff = spawn(FFMPEG, [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${DETECTOR_INPUT}x${DETECTOR_INPUT}`, '-i', 'pipe:0',
        '-frames:v', '1', '-q:v', '4', '-y', file,
      ], { windowsHide: true });
      ff.on('error', reject);
      ff.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg saiu ${code}`)));
      ff.stdin.write(hit.frameRgb);
      ff.stdin.end();
    });
    return `/api/vms/vca-snapshots/${hit.channelId}/${name}`;
  }

  private async emit(hit: VcaHit, snapshotUrl: string | null): Promise<void> {
    const label = `${labelFor(hit.ruleType)}: ${hit.det.className} (${hit.ruleName})`;
    await fetch(`${VMS_BACKEND_API_URL}/api/vms/internal/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-vms-token': VMS_INTERNAL_TOKEN },
      body: JSON.stringify({
        type: hit.ruleType,
        label,
        channelId: hit.channelId,
        channelName: hit.channelName,
        deviceName: hit.deviceName,
        snapshotUrl,
        score: Number(hit.det.score.toFixed(2)),
      }),
    });
  }

  private async notify(hit: VcaHit, snapshotUrl: string | null): Promise<void> {
    // Fase 5: e-mail (SMTP do sistema) com o snapshot anexo; WhatsApp/SMS opcional.
    await fetch(`${VMS_BACKEND_API_URL}/api/vms/internal/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-vms-token': VMS_INTERNAL_TOKEN },
      body: JSON.stringify({
        channelName: hit.channelName, ruleName: hit.ruleName, ruleType: hit.ruleType,
        className: hit.det.className, snapshotUrl, targets: hit.notifyTargets,
      }),
    }).catch(() => { /* rota de notify pode não existir ainda (Fase 5) */ });
  }
}

function labelFor(ruleType: string): string {
  switch (ruleType) {
    case 'line_cross': return 'Cruzamento de linha';
    case 'intrusion': return 'Intrusão de área';
    case 'motion_zone': return 'Movimento na zona';
    default: return 'Detecção';
  }
}
