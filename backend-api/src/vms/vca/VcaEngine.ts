import { execFile } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../../database';
import { MediaMtxClient } from '../MediaMtxClient';
import { RecordingScheduler } from '../RecordingScheduler';
import { Detector } from './Detector';
import { Actions } from './Actions';
import { CameraPipeline, VcaChannelConfig, VcaRule } from './CameraPipeline';
import { subPathName } from '../rtsp';
import { VMS_RTSP_LOOPBACK, VCA_MODEL_PATH, VCA_ENABLED, VMS_INTERNAL_TOKEN } from '../config';

const execFileAsync = promisify(execFile);
const FFPROBE = process.env.FFPROBE_PATH
  || (process.env.FFMPEG_PATH ? process.env.FFMPEG_PATH.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1') : 'ffprobe');

/**
 * Motor de VCA por software. Espelha o padrão do PathReconciler: a cada
 * reconcile, sobe um CameraPipeline para cada canal com `vca.enabled` e derruba
 * os que não interessam mais. Uma única sessão ONNX (Detector.shared) é
 * compartilhada por todas as câmeras.
 */
export class VcaEngine {
  private detector: Detector | null = null;
  private actions: Actions;
  private pipelines = new Map<string, CameraPipeline>(); // channelId → pipeline
  private sizeCache = new Map<string, { w: number; h: number }>();
  private disabledReason = '';

  constructor(private mtx: MediaMtxClient, scheduler: RecordingScheduler) {
    this.actions = new Actions(scheduler);
  }

  async reconcile(): Promise<void> {
    if (!VCA_ENABLED) return;
    if (!VCA_MODEL_PATH) { this.warnOnce('VCA_MODEL_PATH não definido — VCA inativo'); return; }
    if (!this.detector) {
      this.detector = await Detector.shared(VCA_MODEL_PATH);
      if (!this.detector) { this.warnOnce('detector indisponível (modelo/onnxruntime) — VCA inativo'); return; }
      console.log('[VCA] motor de análise carregado.');
    }

    const channels = await prisma.videoChannel.findMany({
      where: { enabled: true, vca: { is: { enabled: true } }, device: { enabled: true } },
      include: { device: true, vca: true, recording: true },
    });

    const desired = new Map<string, VcaChannelConfig>();
    for (const ch of channels) {
      const rules = normalizeRules((ch.vca!.rules as any) || []);
      if (rules.length === 0) continue; // sem regra, nada a analisar
      const rtspUrl = await this.pickRtsp(ch.streamPath);
      const size = await this.probeSize(rtspUrl);
      desired.set(ch.id, {
        channelId: ch.id,
        channelName: ch.name,
        deviceName: ch.device.name,
        rtspUrl,
        origW: size.w, origH: size.h,
        classes: (ch.vca!.classes as any) || null,
        maxFps: ch.vca!.maxFps,
        minScore: ch.vca!.minScore,
        cooldownSec: ch.vca!.cooldownSec,
        postEventSec: ch.recording?.postEventSec ?? 15,
        rules,
      });
    }

    // derruba pipelines que saíram ou mudaram
    for (const [id, pipe] of this.pipelines) {
      const cfg = desired.get(id);
      if (!cfg || !pipe.sameAs(cfg)) {
        pipe.stop();
        this.pipelines.delete(id);
      }
    }
    // sobe os que faltam
    for (const [id, cfg] of desired) {
      if (this.pipelines.has(id)) continue;
      const pipe = new CameraPipeline(cfg, this.detector, this.actions);
      pipe.start();
      this.pipelines.set(id, pipe);
      console.log(`[VCA] analisando '${cfg.channelName}' (${cfg.rules.length} regra(s), ${cfg.origW}x${cfg.origH})`);
    }
  }

  stopAll(): void {
    for (const p of this.pipelines.values()) p.stop();
    this.pipelines.clear();
  }

  /**
   * Prefere o sub-stream (menos CPU); cai para o main se não houver sub.
   * O MediaMTX exige autenticação até no loopback (authMethod http → stream-auth):
   * o token interno do VMS é aceito como `?jwt=`.
   */
  private async pickRtsp(streamPath: string): Promise<string> {
    const auth = VMS_INTERNAL_TOKEN ? `?jwt=${encodeURIComponent(VMS_INTERNAL_TOKEN)}` : '';
    const sub = subPathName(streamPath);
    try {
      const paths = await this.mtx.listConfigPaths();
      if (paths.some((p) => p.name === sub)) return `${VMS_RTSP_LOOPBACK}/${sub}${auth}`;
    } catch { /* usa o main */ }
    return `${VMS_RTSP_LOOPBACK}/${streamPath}${auth}`;
  }

  /** Resolução real do stream (para reverter o letterbox); cacheada. */
  private async probeSize(rtspUrl: string): Promise<{ w: number; h: number }> {
    const cached = this.sizeCache.get(rtspUrl);
    if (cached) return cached;
    let size = { w: 1280, h: 720 }; // fallback 16:9
    try {
      const { stdout } = await execFileAsync(FFPROBE, [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height', '-of', 'csv=p=0', rtspUrl,
      ], { timeout: 15000 });
      const [w, h] = stdout.trim().split(',').map(Number);
      if (w > 0 && h > 0) size = { w, h };
    } catch { /* mantém o fallback */ }
    this.sizeCache.set(rtspUrl, size);
    return size;
  }

  private warnOnce(reason: string): void {
    if (this.disabledReason === reason) return;
    this.disabledReason = reason;
    console.warn(`[VCA] ${reason}`);
  }
}

/** Valida/limpa as regras vindas do JSON (defesa contra config malformada). */
function normalizeRules(raw: any[]): VcaRule[] {
  const types = new Set(['motion_zone', 'line_cross', 'intrusion']);
  const out: VcaRule[] = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r || !types.has(r.type)) continue;
    const points = Array.isArray(r?.geometry?.points) ? r.geometry.points : [];
    if (r.type === 'line_cross' ? points.length < 2 : points.length < 3) continue;
    out.push({
      id: String(r.id || Math.random().toString(36).slice(2)),
      name: String(r.name || 'Regra'),
      type: r.type,
      geometry: { points: points.map((p: any[]) => [Number(p[0]), Number(p[1])]) },
      direction: ['in', 'out', 'both'].includes(r.direction) ? r.direction : 'both',
      schedule: Array.isArray(r.schedule) ? r.schedule : undefined,
      actions: Array.isArray(r.actions) && r.actions.length ? r.actions : ['record', 'alert', 'snapshot'],
      notifyTargets: r.notifyTargets || undefined,
    });
  }
  return out;
}
