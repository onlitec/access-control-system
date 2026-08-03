"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VcaEngine = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const database_1 = require("../../database");
const Detector_1 = require("./Detector");
const Actions_1 = require("./Actions");
const CameraPipeline_1 = require("./CameraPipeline");
const rtsp_1 = require("../rtsp");
const config_1 = require("../config");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const FFPROBE = process.env.FFPROBE_PATH
    || (process.env.FFMPEG_PATH ? process.env.FFMPEG_PATH.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1') : 'ffprobe');
/**
 * Motor de VCA por software. Espelha o padrão do PathReconciler: a cada
 * reconcile, sobe um CameraPipeline para cada canal com `vca.enabled` e derruba
 * os que não interessam mais. Uma única sessão ONNX (Detector.shared) é
 * compartilhada por todas as câmeras.
 */
class VcaEngine {
    constructor(mtx, scheduler) {
        this.mtx = mtx;
        this.detector = null;
        this.pipelines = new Map(); // channelId → pipeline
        this.sizeCache = new Map();
        this.rtspChoiceCache = new Map(); // streamPath → sub-stream existe?
        this.disabledReason = '';
        this.actions = new Actions_1.Actions(scheduler);
    }
    async reconcile() {
        if (!config_1.VCA_ENABLED)
            return;
        if (!config_1.VCA_MODEL_PATH) {
            this.warnOnce('VCA_MODEL_PATH não definido — VCA inativo');
            return;
        }
        if (!this.detector) {
            this.detector = await Detector_1.Detector.shared(config_1.VCA_MODEL_PATH);
            if (!this.detector) {
                this.warnOnce('detector indisponível (modelo/onnxruntime) — VCA inativo');
                return;
            }
            console.log('[VCA] motor de análise carregado.');
        }
        const channels = await database_1.prisma.videoChannel.findMany({
            where: { enabled: true, vca: { is: { enabled: true } }, device: { enabled: true } },
            include: { device: true, vca: true, recording: true },
        });
        // resolve o canal cujo vídeo representa o evento (o próprio ou o vinculado)
        const linkedIds = channels.map((c) => c.vca.linkedCameraId).filter(Boolean);
        const linked = linkedIds.length
            ? await database_1.prisma.videoChannel.findMany({ where: { id: { in: linkedIds } }, select: { id: true, name: true, streamPath: true } })
            : [];
        const linkedById = new Map(linked.map((l) => [l.id, l]));
        const desired = new Map();
        for (const ch of channels) {
            const rules = normalizeRules(ch.vca.rules || []);
            if (rules.length === 0)
                continue; // sem regra, nada a analisar
            const rtspUrl = await this.pickRtsp(ch.streamPath);
            const size = await this.probeSize(rtspUrl);
            // câmera de vídeo: a vinculada (se existir e válida) ou a própria
            const linkedCam = ch.vca.linkedCameraId ? linkedById.get(ch.vca.linkedCameraId) : undefined;
            desired.set(ch.id, {
                channelId: ch.id,
                channelName: ch.name,
                deviceName: ch.device.name,
                rtspUrl,
                origW: size.w, origH: size.h,
                classes: ch.vca.classes || null,
                maxFps: ch.vca.maxFps,
                minScore: ch.vca.minScore,
                cooldownSec: ch.vca.cooldownSec,
                postEventSec: ch.recording?.postEventSec ?? 15,
                recordSeconds: ch.vca.recordSeconds ?? 20,
                popup: ch.vca.popupOnOperator ?? false,
                videoChannelId: linkedCam?.id ?? ch.id,
                videoStreamPath: linkedCam?.streamPath ?? ch.streamPath,
                videoChannelName: linkedCam?.name ?? ch.name,
                rules,
                motionMinRatio: ch.vca.motionMinRatio ?? undefined,
                motionPixelThr: ch.vca.motionPixelThr ?? undefined,
                motionDownsample: ch.vca.motionDownsample ?? undefined,
                trackerMaxDist: ch.vca.trackerMaxDist ?? undefined,
                trackerTtlMs: ch.vca.trackerTtlMs ?? undefined,
            });
        }
        // derruba pipelines que saíram ou mudaram (só recria de verdade se o
        // campo alterado for estrutural; mudança leve aplica via updateConfig)
        for (const [id, pipe] of this.pipelines) {
            const cfg = desired.get(id);
            if (!cfg) {
                pipe.stop();
                this.pipelines.delete(id);
                continue;
            }
            if (pipe.sameAs(cfg))
                continue;
            if (pipe.needsRestart(cfg)) {
                pipe.stop();
                this.pipelines.delete(id);
            }
            else {
                pipe.updateConfig(cfg);
                console.log(`[VCA] config leve atualizada em '${cfg.channelName}' (sem reconectar RTSP)`);
            }
        }
        // sobe os que faltam
        for (const [id, cfg] of desired) {
            if (this.pipelines.has(id))
                continue;
            const pipe = new CameraPipeline_1.CameraPipeline(cfg, this.detector, this.actions);
            pipe.start();
            this.pipelines.set(id, pipe);
            console.log(`[VCA] analisando '${cfg.channelName}' (${cfg.rules.length} regra(s), ${cfg.origW}x${cfg.origH})`);
        }
    }
    stopAll() {
        for (const p of this.pipelines.values())
            p.stop();
        this.pipelines.clear();
    }
    /**
     * Prefere o sub-stream (menos CPU); cai para o main se não houver sub.
     * O MediaMTX exige autenticação até no loopback (authMethod http → stream-auth):
     * o token interno do VMS é aceito como `?jwt=`.
     */
    async pickRtsp(streamPath) {
        const auth = config_1.VMS_INTERNAL_TOKEN ? `?jwt=${encodeURIComponent(config_1.VMS_INTERNAL_TOKEN)}` : '';
        const sub = (0, rtsp_1.subPathName)(streamPath);
        let hasSub = this.rtspChoiceCache.get(streamPath) ?? false;
        try {
            const paths = await this.mtx.listConfigPaths();
            hasSub = paths.some((p) => p.name === sub);
            this.rtspChoiceCache.set(streamPath, hasSub);
        }
        catch {
            // API do MediaMTX falhou nesse ciclo — mantém a última escolha
            // conhecida em vez de cair pro main e derrubar a pipeline à toa.
        }
        return hasSub
            ? `${config_1.VMS_RTSP_LOOPBACK}/${sub}${auth}`
            : `${config_1.VMS_RTSP_LOOPBACK}/${streamPath}${auth}`;
    }
    /** Resolução real do stream (para reverter o letterbox); cacheada. */
    async probeSize(rtspUrl) {
        const cached = this.sizeCache.get(rtspUrl);
        if (cached)
            return cached;
        let size = { w: 1280, h: 720 }; // fallback 16:9
        try {
            const { stdout } = await execFileAsync(FFPROBE, [
                '-v', 'error', '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height', '-of', 'csv=p=0', rtspUrl,
            ], { timeout: 15000 });
            const [w, h] = stdout.trim().split(',').map(Number);
            if (w > 0 && h > 0)
                size = { w, h };
        }
        catch { /* mantém o fallback */ }
        this.sizeCache.set(rtspUrl, size);
        return size;
    }
    warnOnce(reason) {
        if (this.disabledReason === reason)
            return;
        this.disabledReason = reason;
        console.warn(`[VCA] ${reason}`);
    }
}
exports.VcaEngine = VcaEngine;
/** Valida/limpa as regras vindas do JSON (defesa contra config malformada). */
function normalizeRules(raw) {
    const types = new Set(['motion_zone', 'line_cross', 'intrusion']);
    const out = [];
    for (const r of Array.isArray(raw) ? raw : []) {
        if (!r || !types.has(r.type))
            continue;
        const points = Array.isArray(r?.geometry?.points) ? r.geometry.points : [];
        if (r.type === 'line_cross' ? points.length < 2 : points.length < 3)
            continue;
        out.push({
            id: String(r.id || Math.random().toString(36).slice(2)),
            name: String(r.name || 'Regra'),
            type: r.type,
            geometry: { points: points.map((p) => [Number(p[0]), Number(p[1])]) },
            direction: ['in', 'out', 'both'].includes(r.direction) ? r.direction : 'both',
            schedule: Array.isArray(r.schedule) ? r.schedule : undefined,
            actions: Array.isArray(r.actions) && r.actions.length ? r.actions : ['record', 'alert', 'snapshot'],
            notifyTargets: r.notifyTargets || undefined,
            cooldownSec: (r.cooldownSec != null && Number(r.cooldownSec) > 0) ? Number(r.cooldownSec) : undefined,
            dwellMs: (r.dwellMs != null && Number(r.dwellMs) >= 0) ? Number(r.dwellMs) : undefined,
        });
    }
    return out;
}
