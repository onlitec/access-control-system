import { FrameSource, Frame } from './FrameSource';
import { MotionGate } from './MotionGate';
import { Detector, Detection } from './Detector';
import { Actions, VcaHit } from './Actions';
import { CentroidTracker, pointInPolygon, segmentsIntersect, sideOfLine, Point } from './Geometry';
import { classNamesToIds } from './coco';

export interface VcaRule {
  id: string;
  name: string;
  type: 'motion_zone' | 'line_cross' | 'intrusion';
  geometry: { points: Point[] };      // normalizado 0–1
  direction?: 'in' | 'out' | 'both';  // line_cross
  schedule?: Array<{ dow: number[]; start: string; end: string }>;
  actions: string[];                  // record | alert | notify | snapshot
  notifyTargets?: { emails?: string[]; phones?: string[] };
}

export interface VcaChannelConfig {
  channelId: string;
  channelName: string;
  deviceName: string | null;
  rtspUrl: string;
  origW: number;
  origH: number;
  classes: string[] | null;
  maxFps: number;
  minScore: number;
  cooldownSec: number;
  postEventSec: number;
  rules: VcaRule[];
}

/**
 * Pipeline de uma câmera: ffmpeg → gate de movimento → (só se houver movimento)
 * detector YOLO → avaliação das regras (zona/linha/área) → ações com cooldown.
 */
export class CameraPipeline {
  private source: FrameSource;
  private gate = new MotionGate();
  private tracker = new CentroidTracker();
  private wantIds: Set<number>;
  private lastFired = new Map<string, number>(); // ruleId → epoch ms
  private busy = false;

  constructor(
    public cfg: VcaChannelConfig,
    private detector: Detector,
    private actions: Actions,
  ) {
    this.wantIds = classNamesToIds(cfg.classes);
    this.source = new FrameSource(cfg.rtspUrl, cfg.origW, cfg.origH, cfg.maxFps, (f) => this.onFrame(f));
  }

  start(): void { this.source.start(); }
  stop(): void { this.source.stop(); }

  /** true se a config mudou o bastante para justificar recriar o pipeline. */
  sameAs(cfg: VcaChannelConfig): boolean {
    return JSON.stringify(cfg) === JSON.stringify(this.cfg);
  }

  private onFrame(f: Frame): void {
    // descarta frames enquanto uma inferência está em curso (não enfileira CPU)
    if (this.busy) return;
    if (!this.gate.hasMotion(f.rgb)) return;
    this.busy = true;
    void this.analyze(f).finally(() => { this.busy = false; });
  }

  private async analyze(f: Frame): Promise<void> {
    const dets = await this.detector.detect(f.rgb, f.letterbox, this.cfg.minScore, this.wantIds);
    if (dets.length === 0) return;
    const now = Date.now();
    const tracks = this.tracker.update(dets.map((d) => ({ cx: d.cx, cy: d.cy, cls: d.cls })), now);

    for (const rule of this.cfg.rules) {
      if (!this.inSchedule(rule, now)) continue;
      if (now - (this.lastFired.get(rule.id) || 0) < this.cfg.cooldownSec * 1000) continue;
      const det = this.evaluate(rule, dets, tracks);
      if (!det) continue;
      this.lastFired.set(rule.id, now);
      const hit: VcaHit = {
        channelId: this.cfg.channelId, channelName: this.cfg.channelName, deviceName: this.cfg.deviceName,
        ruleName: rule.name, ruleType: rule.type, actions: rule.actions,
        postEventSec: this.cfg.postEventSec, notifyTargets: rule.notifyTargets,
        det, frameRgb: f.rgb,
      };
      void this.actions.fire(hit).catch((e) => console.error('[VCA] ação falhou:', e.message));
    }
  }

  /** Devolve a detecção que dispara a regra, ou null. */
  private evaluate(rule: VcaRule, dets: Detection[], tracks: ReturnType<CentroidTracker['update']>): Detection | null {
    const pts = rule.geometry.points;
    if (rule.type === 'motion_zone' || rule.type === 'intrusion') {
      // objeto de interesse com o centroide (pé/base) dentro do polígono
      for (const d of dets) {
        // usa a base da caixa (mais estável para pessoas/veículos que o centro)
        const foot: Point = [d.cx, d.y2];
        if (pointInPolygon(foot, pts) || pointInPolygon([d.cx, d.cy], pts)) return d;
      }
      return null;
    }
    if (rule.type === 'line_cross') {
      const a = pts[0], b = pts[1];
      for (const t of tracks) {
        const prev: Point = [t.prevCx, t.prevCy], cur: Point = [t.cx, t.cy];
        if (!segmentsIntersect(prev, cur, a, b)) continue;
        if (rule.direction && rule.direction !== 'both') {
          // "in" = cruzou da direita (lado <0) para a esquerda (lado >0) de A→B
          const s0 = sideOfLine(a, b, prev), s1 = sideOfLine(a, b, cur);
          const crossedIn = s0 < 0 && s1 > 0;
          if (rule.direction === 'in' && !crossedIn) continue;
          if (rule.direction === 'out' && crossedIn) continue;
        }
        const d = dets.find((x) => x.cls === t.cls && Math.hypot(x.cx - t.cx, x.cy - t.cy) < 0.05);
        if (d) return d;
      }
      return null;
    }
    return null;
  }

  private inSchedule(rule: VcaRule, now: number): boolean {
    if (!rule.schedule || rule.schedule.length === 0) return true;
    const d = new Date(now);
    const dow = d.getDay(); // 0=dom
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    for (const w of rule.schedule) {
      if (!w.dow.includes(dow)) continue;
      // janela que cruza a meia-noite (start > end) também é suportada
      if (w.start <= w.end ? (hhmm >= w.start && hhmm <= w.end) : (hhmm >= w.start || hhmm <= w.end)) return true;
    }
    return false;
  }
}
