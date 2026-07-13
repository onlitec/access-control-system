import { spawn, ChildProcess } from 'child_process';
import { DETECTOR_INPUT } from './Detector';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

export interface Frame {
  /** RGB24 640x640 com letterbox (pronto para o detector). */
  rgb: Buffer;
  letterbox: { scale: number; padX: number; padY: number; origW: number; origH: number };
}

/**
 * Puxa uma câmera do MediaMTX (RTSP loopback) e entrega frames RGB 640x640
 * (letterbox) a uma taxa limitada. Um ffmpeg por câmera — o mesmo padrão de
 * `spawn(ffmpeg)` já usado em doorbell/facial. O ffmpeg faz TODO o trabalho
 * pesado (decodifica H264/H265, escala, letterbox); o Node só lê bytes prontos.
 */
export class FrameSource {
  private proc: ChildProcess | null = null;
  private buf: Buffer[] = [];
  private buffered = 0;
  private stopped = false;
  private readonly frameBytes = DETECTOR_INPUT * DETECTOR_INPUT * 3;

  constructor(
    private rtspUrl: string,
    private origW: number,
    private origH: number,
    private maxFps: number,
    private onFrame: (f: Frame) => void,
  ) {}

  start(): void {
    const S = DETECTOR_INPUT;
    // scale mantendo proporção + pad até 640x640 (letterbox centralizado)
    const vf = `fps=${this.maxFps},scale=${S}:${S}:force_original_aspect_ratio=decrease,`
      + `pad=${S}:${S}:(ow-iw)/2:(oh-ih)/2`;
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-rtsp_transport', 'tcp', // controle sempre TCP; a mídia já vem do loopback
      '-i', this.rtspUrl,
      '-an', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
    ];
    this.proc = spawn(FFMPEG, args, { windowsHide: true });
    this.proc.stdout?.on('data', (chunk: Buffer) => this.ingest(chunk));
    this.proc.on('exit', () => {
      if (this.stopped) return;
      setTimeout(() => { if (!this.stopped) this.start(); }, 4000); // reconecta
    });

    // fator de letterbox para reverter as caixas (o pad é centralizado)
    const scale = Math.min(S / this.origW, S / this.origH);
    const newW = this.origW * scale, newH = this.origH * scale;
    this.lb = { scale, padX: (S - newW) / 2, padY: (S - newH) / 2, origW: this.origW, origH: this.origH };
  }

  private lb = { scale: 1, padX: 0, padY: 0, origW: 1, origH: 1 };

  private ingest(chunk: Buffer): void {
    this.buf.push(chunk);
    this.buffered += chunk.length;
    while (this.buffered >= this.frameBytes) {
      const full = Buffer.concat(this.buf);
      const frame = full.subarray(0, this.frameBytes);
      const rest = full.subarray(this.frameBytes);
      this.buf = rest.length ? [rest] : [];
      this.buffered = rest.length;
      try { this.onFrame({ rgb: frame, letterbox: this.lb }); }
      catch (err: any) { console.error('[VCA] onFrame erro:', err.message); }
    }
  }

  stop(): void {
    this.stopped = true;
    this.proc?.kill();
    this.proc = null;
    this.buf = [];
    this.buffered = 0;
  }
}
