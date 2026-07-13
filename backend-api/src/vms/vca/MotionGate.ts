import { DETECTOR_INPUT } from './Detector';

/**
 * Gate de movimento barato: decide se vale a pena rodar a IA (cara) num frame.
 * Faz diferença absoluta média entre o frame atual e o anterior, sobre uma
 * versão bem reduzida em tons de cinza (subamostragem do RGB 640). Se a fração
 * de pixels que mudaram acima de um limiar passar de `minRatio`, há movimento.
 *
 * É o que derruba o custo de CPU de "IA em todo frame" para "IA só quando algo
 * mexe". Não precisa ser preciso — só evitar rodar o YOLO em cena parada.
 */
export class MotionGate {
  private prev: Uint8Array | null = null;
  private readonly gw: number;
  private readonly gh: number;
  private readonly step: number;

  constructor(private minRatio = 0.004, private pixelThr = 18, downsample = 8) {
    this.step = downsample;
    this.gw = Math.floor(DETECTOR_INPUT / this.step);
    this.gh = Math.floor(DETECTOR_INPUT / this.step);
  }

  /** true se há movimento (e sempre true no primeiro frame, para "aquecer"). */
  hasMotion(rgb: Buffer): boolean {
    const S = DETECTOR_INPUT;
    const g = new Uint8Array(this.gw * this.gh);
    let k = 0;
    for (let y = 0; y < S; y += this.step) {
      for (let x = 0; x < S; x += this.step) {
        const i = (y * S + x) * 3;
        // luma aproximado (sem multiplicações caras): média simples serve
        g[k++] = (rgb[i] + rgb[i + 1] + rgb[i + 2]) / 3;
      }
    }
    if (!this.prev) { this.prev = g; return true; }
    let changed = 0;
    for (let i = 0; i < g.length; i++) {
      if (Math.abs(g[i] - this.prev[i]) > this.pixelThr) changed++;
    }
    this.prev = g;
    return changed / g.length >= this.minRatio;
  }
}
