"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CameraPipeline = void 0;
const FrameSource_1 = require("./FrameSource");
const MotionGate_1 = require("./MotionGate");
const Geometry_1 = require("./Geometry");
const coco_1 = require("./coco");
// campos que exigem recriar o FrameSource/RTSP e o tracker do zero; o resto
// (minScore/classes/cooldown/rules/gate/tracker) é aplicado "a quente" por
// updateConfig() sem derrubar a conexão da câmera.
const STRUCTURAL_FIELDS = ['rtspUrl', 'origW', 'origH', 'maxFps', 'videoChannelId'];
/**
 * Pipeline de uma câmera: ffmpeg → gate de movimento → (só se houver movimento)
 * detector YOLO → avaliação das regras (zona/linha/área) → ações com cooldown.
 */
class CameraPipeline {
    constructor(cfg, detector, actions) {
        this.cfg = cfg;
        this.detector = detector;
        this.actions = actions;
        this.gate = new MotionGate_1.MotionGate(cfg.motionMinRatio, cfg.motionPixelThr, cfg.motionDownsample);
        this.tracker = new Geometry_1.CentroidTracker(cfg.trackerMaxDist, cfg.trackerTtlMs);
        this.lastFired = new Map(); // ruleId → epoch ms
        this.dwellSince = new Map(); // `${ruleId}:${trackId}` → epoch ms de quando entrou na área
        this.busy = false;
        const { names, thresholds } = (0, coco_1.parseClassConfig)(cfg.classes);
        this.wantIds = (0, coco_1.classNamesToIds)(names);
        this.classThresholds = new Map();
        for (const [name, score] of thresholds) {
            const id = coco_1.COCO_CLASSES.indexOf(name);
            if (id >= 0)
                this.classThresholds.set(id, score);
        }
        this.source = new FrameSource_1.FrameSource(cfg.rtspUrl, cfg.origW, cfg.origH, cfg.maxFps, (f) => this.onFrame(f));
    }
    start() { this.source.start(); }
    stop() { this.source.stop(); }
    /** true se a config é idêntica (nada a fazer). */
    sameAs(cfg) {
        return JSON.stringify(cfg) === JSON.stringify(this.cfg);
    }
    /** true se algum campo ESTRUTURAL mudou (exige recriar FrameSource/RTSP). */
    needsRestart(cfg) {
        return STRUCTURAL_FIELDS.some((k) => this.cfg[k] !== cfg[k]);
    }
    /**
     * Aplica config "leve" (minScore/classes/cooldown/rules/gate/tracker) SEM
     * parar o FrameSource nem recriar o CentroidTracker — preserva as trilhas
     * em curso (importante pro line_cross não perder o histórico à toa).
     */
    updateConfig(cfg) {
        this.cfg = cfg;
        const { names, thresholds } = (0, coco_1.parseClassConfig)(cfg.classes);
        this.wantIds = (0, coco_1.classNamesToIds)(names);
        this.classThresholds = new Map();
        for (const [name, score] of thresholds) {
            const id = coco_1.COCO_CLASSES.indexOf(name);
            if (id >= 0)
                this.classThresholds.set(id, score);
        }
        this.gate = new MotionGate_1.MotionGate(cfg.motionMinRatio, cfg.motionPixelThr, cfg.motionDownsample);
        this.tracker.maxDist = cfg.trackerMaxDist ?? 0.12;
        this.tracker.ttlMs = cfg.trackerTtlMs ?? 2000;
        const ruleIds = new Set(cfg.rules.map((r) => r.id));
        for (const id of this.lastFired.keys())
            if (!ruleIds.has(id))
                this.lastFired.delete(id);
        for (const key of this.dwellSince.keys())
            if (!ruleIds.has(key.slice(0, key.indexOf(':'))))
                this.dwellSince.delete(key);
    }
    onFrame(f) {
        // descarta frames enquanto uma inferência está em curso (não enfileira CPU)
        if (this.busy)
            return;
        if (!this.gate.hasMotion(f.rgb))
            return;
        this.busy = true;
        void this.analyze(f).finally(() => { this.busy = false; });
    }
    async analyze(f) {
        const dets = await this.detector.detect(f.rgb, f.letterbox, this.cfg.minScore, this.wantIds, this.classThresholds);
        if (dets.length === 0)
            return;
        const now = Date.now();
        const tracks = this.tracker.update(dets.map((d) => ({ cx: d.cx, cy: d.cy, cls: d.cls })), now);
        if (this.dwellSince.size) {
            const liveIds = new Set(tracks.map((t) => String(t.id)));
            for (const key of this.dwellSince.keys()) {
                const trackId = key.slice(key.indexOf(':') + 1);
                if (trackId !== 'notrack' && !liveIds.has(trackId))
                    this.dwellSince.delete(key);
            }
        }
        for (const rule of this.cfg.rules) {
            if (!this.inSchedule(rule, now))
                continue;
            const cooldownMs = (rule.cooldownSec ?? this.cfg.cooldownSec) * 1000;
            if (now - (this.lastFired.get(rule.id) || 0) < cooldownMs)
                continue;
            const det = rule.type === 'intrusion' ? this.evaluateIntrusion(rule, dets, tracks, now) : this.evaluate(rule, dets, tracks);
            if (!det)
                continue;
            this.lastFired.set(rule.id, now);
            const hit = {
                channelId: this.cfg.channelId, channelName: this.cfg.channelName, deviceName: this.cfg.deviceName,
                ruleName: rule.name, ruleType: rule.type, actions: rule.actions,
                postEventSec: this.cfg.postEventSec, notifyTargets: rule.notifyTargets,
                recordSeconds: this.cfg.recordSeconds, popup: this.cfg.popup,
                videoChannelId: this.cfg.videoChannelId, videoStreamPath: this.cfg.videoStreamPath,
                videoChannelName: this.cfg.videoChannelName,
                det, frameRgb: f.rgb,
            };
            void this.actions.fire(hit).catch((e) => console.error('[VCA] ação falhou:', e.message));
        }
    }
    /** Devolve a detecção que dispara a regra, ou null. */
    evaluate(rule, dets, tracks) {
        const pts = rule.geometry.points;
        if (rule.type === 'motion_zone' || rule.type === 'intrusion') {
            // objeto de interesse com o centroide (pé/base) dentro do polígono
            for (const d of dets) {
                // usa a base da caixa (mais estável para pessoas/veículos que o centro)
                const foot = [d.cx, d.y2];
                if ((0, Geometry_1.pointInPolygon)(foot, pts) || (0, Geometry_1.pointInPolygon)([d.cx, d.cy], pts))
                    return d;
            }
            return null;
        }
        if (rule.type === 'line_cross') {
            const a = pts[0], b = pts[1];
            for (const t of tracks) {
                const prev = [t.prevCx, t.prevCy], cur = [t.cx, t.cy];
                if (!(0, Geometry_1.segmentsIntersect)(prev, cur, a, b))
                    continue;
                if (rule.direction && rule.direction !== 'both') {
                    // "in" = cruzou da direita (lado <0) para a esquerda (lado >0) de A→B
                    const s0 = (0, Geometry_1.sideOfLine)(a, b, prev), s1 = (0, Geometry_1.sideOfLine)(a, b, cur);
                    const crossedIn = s0 < 0 && s1 > 0;
                    if (rule.direction === 'in' && !crossedIn)
                        continue;
                    if (rule.direction === 'out' && crossedIn)
                        continue;
                }
                const d = dets.find((x) => x.cls === t.cls && Math.hypot(x.cx - t.cx, x.cy - t.cy) < 0.05);
                if (d)
                    return d;
            }
            return null;
        }
        return null;
    }
    /** Como evaluate() para 'intrusion', mas exige permanência mínima (dwellMs) na área antes de disparar. */
    evaluateIntrusion(rule, dets, tracks, now) {
        const pts = rule.geometry.points;
        for (const d of dets) {
            const foot = [d.cx, d.y2];
            const inside = (0, Geometry_1.pointInPolygon)(foot, pts) || (0, Geometry_1.pointInPolygon)([d.cx, d.cy], pts);
            if (!inside)
                continue;
            const dwellMs = rule.dwellMs || 0;
            if (dwellMs <= 0)
                return d; // comportamento atual: dispara na hora (default compatível)
            const track = tracks.find((t) => t.cls === d.cls && Math.hypot(t.cx - d.cx, t.cy - d.cy) < 0.05);
            const key = `${rule.id}:${track ? track.id : 'notrack'}`;
            const since = this.dwellSince.get(key);
            if (since == null) {
                this.dwellSince.set(key, now);
                continue; // ainda não completou o tempo mínimo de permanência
            }
            if (now - since >= dwellMs) {
                this.dwellSince.delete(key); // reinicia a contagem pra próxima entrada na área
                return d;
            }
        }
        return null;
    }
    inSchedule(rule, now) {
        if (!rule.schedule || rule.schedule.length === 0)
            return true;
        const d = new Date(now);
        const dow = d.getDay(); // 0=dom
        const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        for (const w of rule.schedule) {
            if (!w.dow.includes(dow))
                continue;
            // janela que cruza a meia-noite (start > end) também é suportada
            if (w.start <= w.end ? (hhmm >= w.start && hhmm <= w.end) : (hhmm >= w.start || hhmm <= w.end))
                return true;
        }
        return false;
    }
}
exports.CameraPipeline = CameraPipeline;
