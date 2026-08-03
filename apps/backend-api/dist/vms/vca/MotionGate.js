"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MotionGate = void 0;
const Detector_1 = require("./Detector");
/**
 * Gate de movimento barato: decide se vale a pena rodar a IA (cara) num frame.
 * Faz diferença absoluta média entre o frame atual e o anterior, sobre uma
 * versão bem reduzida em tons de cinza (subamostragem do RGB 640). Se a fração
 * de pixels que mudaram acima de um limiar passar de `minRatio`, há movimento.
 *
 * É o que derruba o custo de CPU de "IA em todo frame" para "IA só quando algo
 * mexe". Não precisa ser preciso — só evitar rodar o YOLO em cena parada.
 */
class MotionGate {
    constructor(minRatio = 0.004, pixelThr = 18, downsample = 8) {
        this.minRatio = minRatio;
        this.pixelThr = pixelThr;
        this.prev = null;
        this.step = downsample;
        this.gw = Math.floor(Detector_1.DETECTOR_INPUT / this.step);
        this.gh = Math.floor(Detector_1.DETECTOR_INPUT / this.step);
    }
    /** true se há movimento (e sempre true no primeiro frame, para "aquecer"). */
    hasMotion(rgb) {
        const S = Detector_1.DETECTOR_INPUT;
        const g = new Uint8Array(this.gw * this.gh);
        let k = 0;
        for (let y = 0; y < S; y += this.step) {
            for (let x = 0; x < S; x += this.step) {
                const i = (y * S + x) * 3;
                // luma aproximado (sem multiplicações caras): média simples serve
                g[k++] = (rgb[i] + rgb[i + 1] + rgb[i + 2]) / 3;
            }
        }
        if (!this.prev) {
            this.prev = g;
            return true;
        }
        let changed = 0;
        for (let i = 0; i < g.length; i++) {
            if (Math.abs(g[i] - this.prev[i]) > this.pixelThr)
                changed++;
        }
        this.prev = g;
        return changed / g.length >= this.minRatio;
    }
}
exports.MotionGate = MotionGate;
