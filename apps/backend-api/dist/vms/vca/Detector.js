"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DETECTOR_INPUT = exports.Detector = void 0;
const coco_1 = require("./coco");
// onnxruntime-node é módulo nativo (prebuilds win-x64/linux-x64). Carregado por
// require dinâmico para o vms-service não quebrar quando o modelo/VCA não estão
// instalados (VCA é componente opcional).
let ort = null;
const INPUT = 640; // YOLOv8n foi exportado com imgsz=640
exports.DETECTOR_INPUT = INPUT;
/**
 * Detector YOLOv8 sobre onnxruntime-node. Sessão ÚNICA compartilhada por todas
 * as câmeras (o modelo ocupa memória; uma sessão só evita N cópias).
 */
class Detector {
    constructor(modelPath) {
        this.modelPath = modelPath;
        this.session = null;
        this.inputName = 'images';
    }
    /** Instância compartilhada; null se onnxruntime/modelo não estiverem disponíveis. */
    static async shared(modelPath) {
        if (Detector.instance)
            return Detector.instance;
        try {
            if (!ort)
                ort = require('onnxruntime-node');
        }
        catch {
            console.warn('[VCA] onnxruntime-node não instalado — VCA desativado.');
            return null;
        }
        const det = new Detector(modelPath);
        try {
            det.session = await ort.InferenceSession.create(modelPath);
            det.inputName = det.session.inputNames[0];
        }
        catch (err) {
            console.warn(`[VCA] falha ao carregar o modelo (${modelPath}): ${err.message}`);
            return null;
        }
        Detector.instance = det;
        return det;
    }
    /**
     * Roda a inferência sobre um frame RGB já redimensionado para 640x640 com
     * letterbox (o FrameSource pede isso ao ffmpeg). `padX/padY/scale` descrevem o
     * letterbox para reverter as caixas às coordenadas normalizadas do frame real.
     */
    async detect(rgb, letterbox, minScore, wantIds, classThresholds) {
        if (!this.session)
            return [];
        // HWC uint8 → CHW float32 normalizado
        const n = INPUT * INPUT;
        const chw = new Float32Array(3 * n);
        for (let i = 0; i < n; i++) {
            chw[i] = rgb[i * 3] / 255;
            chw[n + i] = rgb[i * 3 + 1] / 255;
            chw[2 * n + i] = rgb[i * 3 + 2] / 255;
        }
        const input = new ort.Tensor('float32', chw, [1, 3, INPUT, INPUT]);
        const out = await this.session.run({ [this.inputName]: input });
        const o = out[this.session.outputNames[0]];
        // saída YOLOv8: [1, 84, 8400] → 4 (cx,cy,w,h em px do input) + 80 scores
        const na = o.dims[2];
        const data = o.data;
        const { scale, padX, padY, origW, origH } = letterbox;
        const raw = [];
        for (let i = 0; i < na; i++) {
            let bc = -1, bs = 0;
            for (const c of wantIds) {
                const s = data[(4 + c) * na + i];
                if (s > bs) {
                    bs = s;
                    bc = c;
                }
            }
            const thr = classThresholds && classThresholds.has(bc) ? classThresholds.get(bc) : minScore;
            if (bs < thr || bc < 0)
                continue;
            // caixa em px do input 640 → remove letterbox → px do frame real → normaliza
            const cx = data[i], cy = data[na + i], w = data[2 * na + i], h = data[3 * na + i];
            const x1 = ((cx - w / 2) - padX) / scale;
            const y1 = ((cy - h / 2) - padY) / scale;
            const x2 = ((cx + w / 2) - padX) / scale;
            const y2 = ((cy + h / 2) - padY) / scale;
            raw.push({
                cls: bc, className: coco_1.COCO_CLASSES[bc] || `id${bc}`, score: bs,
                x1: x1 / origW, y1: y1 / origH, x2: x2 / origW, y2: y2 / origH,
                cx: (x1 + x2) / 2 / origW, cy: (y1 + y2) / 2 / origH,
            });
        }
        return nms(raw, 0.45);
    }
}
exports.Detector = Detector;
Detector.instance = null;
/** Non-Max Suppression: colapsa caixas sobrepostas do mesmo objeto. */
function nms(dets, iouThr) {
    dets.sort((a, b) => b.score - a.score);
    const keep = [];
    const removed = new Array(dets.length).fill(false);
    for (let i = 0; i < dets.length; i++) {
        if (removed[i])
            continue;
        keep.push(dets[i]);
        for (let j = i + 1; j < dets.length; j++) {
            if (removed[j] || dets[j].cls !== dets[i].cls)
                continue;
            if (iou(dets[i], dets[j]) > iouThr)
                removed[j] = true;
        }
    }
    return keep;
}
function iou(a, b) {
    const xx1 = Math.max(a.x1, b.x1), yy1 = Math.max(a.y1, b.y1);
    const xx2 = Math.min(a.x2, b.x2), yy2 = Math.min(a.y2, b.y2);
    const w = Math.max(0, xx2 - xx1), h = Math.max(0, yy2 - yy1);
    const inter = w * h;
    const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
    const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
    return inter / (areaA + areaB - inter + 1e-9);
}
