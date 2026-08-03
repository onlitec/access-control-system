"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Actions = exports.VCA_SNAPSHOT_DIR = void 0;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const config_1 = require("../config");
const Detector_1 = require("./Detector");
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
/** Snapshots ao lado das gravações; servidos pelo backend (rota vca-snapshots). */
exports.VCA_SNAPSHOT_DIR = path_1.default.join(path_1.default.dirname(config_1.VMS_RECORDINGS_DIR), 'vca-snapshots');
/**
 * Executa as ações de um disparo VCA. Reaproveita o que já existe: `noteMotion`
 * (mesma flag que a gravação por movimento usa) e o endpoint interno de eventos
 * (mesmo caminho SSE do feed do operador).
 */
class Actions {
    constructor(scheduler) {
        this.scheduler = scheduler;
    }
    async fire(hit) {
        // 1. gravar a CÂMERA DE VÍDEO do evento (a própria ou a vinculada), por
        //    recordSeconds — vale em qualquer modo de gravação.
        if (hit.actions.includes('record')) {
            this.scheduler.noteVcaRecord(hit.videoChannelId, hit.recordSeconds);
        }
        // 2. snapshot do frame do evento (também usado como thumbnail do alerta)
        let snapshotUrl = null;
        if (hit.actions.includes('snapshot') || hit.actions.includes('alert') || hit.actions.includes('notify')) {
            snapshotUrl = await this.saveSnapshot(hit).catch((e) => {
                console.error('[VCA] snapshot falhou:', e.message);
                return null;
            });
        }
        // 3. alerta no feed do operador (SSE via backend-api)
        if (hit.actions.includes('alert')) {
            await this.emit(hit, snapshotUrl).catch((e) => console.error('[VCA] emit falhou:', e.message));
        }
        // 4. notificação externa (e-mail/WhatsApp) — Fase 5
        if (hit.actions.includes('notify') && hit.notifyTargets) {
            await this.notify(hit, snapshotUrl).catch((e) => console.error('[VCA] notify falhou:', e.message));
        }
    }
    /** Codifica o frame RGB640 em JPEG (via ffmpeg) e grava em disco; devolve a URL. */
    async saveSnapshot(hit) {
        const dir = path_1.default.join(exports.VCA_SNAPSHOT_DIR, hit.channelId);
        await fs_1.promises.mkdir(dir, { recursive: true });
        const name = `${Date.now()}.jpg`;
        const file = path_1.default.join(dir, name);
        await new Promise((resolve, reject) => {
            const ff = (0, child_process_1.spawn)(FFMPEG, [
                '-hide_banner', '-loglevel', 'error',
                '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${Detector_1.DETECTOR_INPUT}x${Detector_1.DETECTOR_INPUT}`, '-i', 'pipe:0',
                '-frames:v', '1', '-q:v', '4', '-y', file,
            ], { windowsHide: true });
            ff.on('error', reject);
            ff.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg saiu ${code}`)));
            ff.stdin.write(hit.frameRgb);
            ff.stdin.end();
        });
        return `/api/vms/vca-snapshots/${hit.channelId}/${name}`;
    }
    async emit(hit, snapshotUrl) {
        const label = `${labelFor(hit.ruleType)}: ${hit.det.className} (${hit.ruleName})`;
        await (0, node_fetch_1.default)(`${config_1.VMS_BACKEND_API_URL}/api/vms/internal/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-vms-token': config_1.VMS_INTERNAL_TOKEN },
            body: JSON.stringify({
                type: hit.ruleType,
                label,
                channelId: hit.channelId,
                channelName: hit.channelName,
                deviceName: hit.deviceName,
                snapshotUrl,
                score: Number(hit.det.score.toFixed(2)),
                // câmera de vídeo do evento (própria ou vinculada) + flag de popup
                videoChannelId: hit.videoChannelId,
                streamPath: hit.videoStreamPath,
                videoChannelName: hit.videoChannelName,
                popup: hit.popup,
                recordSeconds: hit.recordSeconds,
            }),
        });
    }
    async notify(hit, snapshotUrl) {
        // Fase 5: e-mail (SMTP do sistema) com o snapshot anexo; WhatsApp/SMS opcional.
        await (0, node_fetch_1.default)(`${config_1.VMS_BACKEND_API_URL}/api/vms/internal/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-vms-token': config_1.VMS_INTERNAL_TOKEN },
            body: JSON.stringify({
                channelName: hit.channelName, ruleName: hit.ruleName, ruleType: hit.ruleType,
                className: hit.det.className, snapshotUrl, targets: hit.notifyTargets,
            }),
        }).catch(() => { });
    }
}
exports.Actions = Actions;
function labelFor(ruleType) {
    switch (ruleType) {
        case 'line_cross': return 'Cruzamento de linha';
        case 'intrusion': return 'Intrusão de área';
        case 'motion_zone': return 'Movimento na zona';
        default: return 'Detecção';
    }
}
