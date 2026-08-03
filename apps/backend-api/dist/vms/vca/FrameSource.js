"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrameSource = void 0;
const child_process_1 = require("child_process");
const Detector_1 = require("./Detector");
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
/**
 * Puxa uma câmera do MediaMTX (RTSP loopback) e entrega frames RGB 640x640
 * (letterbox) a uma taxa limitada. Um ffmpeg por câmera — o mesmo padrão de
 * `spawn(ffmpeg)` já usado em doorbell/facial. O ffmpeg faz TODO o trabalho
 * pesado (decodifica H264/H265, escala, letterbox); o Node só lê bytes prontos.
 */
class FrameSource {
    constructor(rtspUrl, origW, origH, maxFps, onFrame) {
        this.rtspUrl = rtspUrl;
        this.origW = origW;
        this.origH = origH;
        this.maxFps = maxFps;
        this.onFrame = onFrame;
        this.proc = null;
        this.buf = [];
        this.buffered = 0;
        this.stopped = false;
        this.frameBytes = Detector_1.DETECTOR_INPUT * Detector_1.DETECTOR_INPUT * 3;
        this.lb = { scale: 1, padX: 0, padY: 0, origW: 1, origH: 1 };
    }
    start() {
        const S = Detector_1.DETECTOR_INPUT;
        // scale mantendo proporção + pad até 640x640 (letterbox centralizado)
        const vf = `fps=${this.maxFps},scale=${S}:${S}:force_original_aspect_ratio=decrease,`
            + `pad=${S}:${S}:(ow-iw)/2:(oh-ih)/2`;
        const args = [
            '-hide_banner', '-loglevel', 'error',
            '-rtsp_transport', 'tcp', // controle sempre TCP; a mídia já vem do loopback
            '-i', this.rtspUrl,
            '-an', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
        ];
        this.proc = (0, child_process_1.spawn)(FFMPEG, args, { windowsHide: true });
        this.proc.stdout?.on('data', (chunk) => this.ingest(chunk));
        this.proc.on('exit', () => {
            if (this.stopped)
                return;
            setTimeout(() => { if (!this.stopped)
                this.start(); }, 4000); // reconecta
        });
        // fator de letterbox para reverter as caixas (o pad é centralizado)
        const scale = Math.min(S / this.origW, S / this.origH);
        const newW = this.origW * scale, newH = this.origH * scale;
        this.lb = { scale, padX: (S - newW) / 2, padY: (S - newH) / 2, origW: this.origW, origH: this.origH };
    }
    ingest(chunk) {
        if (this.stopped)
            return; // processo antigo ainda emitindo dados após stop() — descarta
        this.buf.push(chunk);
        this.buffered += chunk.length;
        while (this.buffered >= this.frameBytes) {
            const full = Buffer.concat(this.buf);
            const frame = full.subarray(0, this.frameBytes);
            const rest = full.subarray(this.frameBytes);
            this.buf = rest.length ? [rest] : [];
            this.buffered = rest.length;
            try {
                this.onFrame({ rgb: frame, letterbox: this.lb });
            }
            catch (err) {
                console.error('[VCA] onFrame erro:', err.message);
            }
        }
    }
    stop() {
        this.stopped = true;
        const proc = this.proc;
        this.proc = null;
        this.buf = [];
        this.buffered = 0;
        if (!proc)
            return;
        proc.kill();
        // ffmpeg lendo RTSP às vezes não sai com SIGTERM (fica preso na
        // sessão) — sem o SIGKILL de segurança, o processo antigo continua
        // emitindo frames e concorrendo com a pipeline nova pelo detector.
        const killTimer = setTimeout(() => {
            if (proc.exitCode === null && proc.signalCode === null)
                proc.kill('SIGKILL');
        }, 3000);
        proc.once('exit', () => clearTimeout(killTimer));
    }
}
exports.FrameSource = FrameSource;
