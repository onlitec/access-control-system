"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioTranscoder = void 0;
const child_process_1 = require("child_process");
const database_1 = require("../database");
const rtsp_1 = require("./rtsp");
const config_1 = require("./config");
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const RESTART_DELAY_MS = 10000;
// mesma autenticação que o loopback RTSP já exige em qualquer leitura interna
// (ver GET /channels/:id/snapshot) — sem isso o MediaMTX devolve 401.
const LOOPBACK_AUTH = config_1.VMS_INTERNAL_TOKEN ? `?jwt=${encodeURIComponent(config_1.VMS_INTERNAL_TOKEN)}` : '';
/**
 * Mantém, por canal com `capabilities.audioListen`, um processo ffmpeg de
 * baixo custo (vídeo copiado sem recodificar, só o áudio G.711→AAC) lendo do
 * path original via loopback RTSP e republicando em "{streamPath}-aac". É
 * esse path com áudio já em AAC que os players devem usar para HLS — ver
 * `aacPathName()` em rtsp.ts.
 */
class AudioTranscoder {
    constructor(mtx) {
        this.mtx = mtx;
        this.procs = new Map();
    }
    async reconcile() {
        const channels = await database_1.prisma.videoChannel.findMany({
            where: { enabled: true, device: { enabled: true } },
        });
        const desired = new Set();
        for (const ch of channels) {
            const cap = ch.capabilities;
            if (cap?.audioListen)
                desired.add(ch.streamPath);
        }
        for (const [streamPath, proc] of this.procs) {
            if (!desired.has(streamPath))
                await this.stop(streamPath, proc);
        }
        for (const streamPath of desired) {
            if (!this.procs.has(streamPath))
                await this.start(streamPath);
        }
    }
    async stop(streamPath, proc) {
        proc.stopped = true;
        proc.child.kill('SIGTERM');
        this.procs.delete(streamPath);
        await this.mtx.deletePath((0, rtsp_1.aacPathName)(streamPath)).catch(() => { });
        console.log(`[VMS] Transcoder de áudio parado: ${streamPath}`);
    }
    async start(streamPath) {
        const aacName = (0, rtsp_1.aacPathName)(streamPath);
        // path "publisher": sem source configurado, só espera o ffmpeg abaixo publicar
        await this.mtx.addPath(aacName, {}).catch(() => { });
        const args = [
            '-hide_banner', '-loglevel', 'error', '-nostats',
            '-rtsp_transport', 'tcp', '-i', `${config_1.VMS_RTSP_LOOPBACK}/${streamPath}${LOOPBACK_AUTH}`,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '64k', '-ar', '44100',
            '-f', 'rtsp', '-rtsp_transport', 'tcp', `${config_1.VMS_RTSP_LOOPBACK}/${aacName}${LOOPBACK_AUTH}`,
        ];
        const child = (0, child_process_1.spawn)(FFMPEG_PATH, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        const proc = { child, stopped: false };
        this.procs.set(streamPath, proc);
        // só o essencial para diagnosticar uma queda — loglevel error já filtra o resto
        let lastErr = '';
        child.stderr?.on('data', (chunk) => { lastErr = chunk.toString().trim() || lastErr; });
        child.on('exit', (code) => {
            this.procs.delete(streamPath);
            if (proc.stopped)
                return; // parado de propósito (reconcile) — não reagenda
            console.warn(`[VMS] Transcoder de áudio (${streamPath}) caiu (código ${code}): ${lastErr} — nova tentativa em ${RESTART_DELAY_MS / 1000}s`);
            setTimeout(() => { void this.start(streamPath); }, RESTART_DELAY_MS);
        });
        console.log(`[VMS] Transcoder de áudio iniciado: ${streamPath} -> ${aacName}`);
    }
    stopAll() {
        for (const [streamPath, proc] of this.procs)
            void this.stop(streamPath, proc);
    }
}
exports.AudioTranscoder = AudioTranscoder;
