"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MotionWatcher = exports.VCA_EVENT_LABELS = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const database_1 = require("../database");
const digest_fetch_utils_1 = require("../utils/digest-fetch.utils");
const config_1 = require("./config");
const RETRY_DELAY_MS = 10000;
const EVENT_THROTTLE_MS = 30000; // no máx. 1 evento SSE por canal/tipo a cada 30s
/**
 * Eventos ISAPI (alertStream) que podem disparar gravação. Chave = eventType
 * normalizado (minúsculo); valor = rótulo exibido no feed de eventos.
 * VMD é a detecção de movimento básica; os demais são eventos VCA/Smart
 * (exigem que as linhas/áreas estejam desenhadas na interface da câmera).
 */
exports.VCA_EVENT_LABELS = {
    vmd: 'Movimento',
    motiondetection: 'Movimento',
    linedetection: 'Cruzamento de linha',
    fielddetection: 'Intrusão em área',
    regionentrance: 'Entrada em região',
    regionexiting: 'Saída de região',
    loitering: 'Permanência suspeita',
    unattendedbaggage: 'Objeto abandonado',
    attendedbaggage: 'Objeto removido',
    facedetection: 'Rosto detectado',
    audioexception: 'Exceção de áudio',
    scenechangedetection: 'Câmera deslocada/coberta',
};
/** "motiondetection" conta como "vmd" na configuração do canal. */
function normalizeEventType(eventType) {
    const t = eventType.toLowerCase();
    return t === 'motiondetection' ? 'vmd' : t;
}
/**
 * Mantém um long-poll ISAPI `/ISAPI/Event/notification/alertStream` por
 * dispositivo Hikvision que tenha algum canal em modo de gravação "motion"
 * (por evento). Cada evento compatível com os eventTypes configurados no canal
 * ativa a flag de gravação no RecordingScheduler e é repassado ao backend-api
 * para o feed SSE.
 */
class MotionWatcher {
    constructor(scheduler) {
        this.scheduler = scheduler;
        this.active = new Map(); // deviceId -> handle
        this.lastEventAt = new Map(); // channelId:tipo -> epoch ms
    }
    /** Reconcilia os watchers com o banco (chamado no boot, no reload e a cada 60s). */
    async sync() {
        const devices = await database_1.prisma.videoDevice.findMany({
            where: {
                enabled: true,
                protocol: 'hikvision_isapi',
                channels: { some: { enabled: true, recording: { is: { mode: 'motion' } } } },
            },
        });
        const wanted = new Set(devices.map((d) => d.id));
        for (const [deviceId, handle] of this.active) {
            if (!wanted.has(deviceId)) {
                handle.stop = true;
                this.active.delete(deviceId);
            }
        }
        for (const device of devices) {
            if (!this.active.has(device.id)) {
                const handle = { stop: false };
                this.active.set(device.id, handle);
                void this.watchLoop(device, handle);
            }
        }
    }
    async watchLoop(device, handle) {
        const url = `http://${device.ip}:${device.httpPort}/ISAPI/Event/notification/alertStream`;
        console.log(`[VMS] Event watcher iniciado: ${device.name} (${device.ip})`);
        while (!handle.stop) {
            try {
                const res = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password, 'GET', undefined, undefined, { timeoutMs: 0 });
                if (!res.ok || !res.body)
                    throw new Error(`HTTP ${res.status}`);
                let buffer = '';
                for await (const chunk of res.body) {
                    if (handle.stop)
                        break;
                    buffer += chunk.toString('utf-8');
                    // blocos XML chegam separados por boundary multipart; processa e descarta
                    let idx;
                    while ((idx = buffer.indexOf('</EventNotificationAlert>')) !== -1) {
                        const block = buffer.slice(0, idx);
                        buffer = buffer.slice(idx + '</EventNotificationAlert>'.length);
                        await this.handleEventBlock(device, block);
                    }
                    if (buffer.length > 65536)
                        buffer = buffer.slice(-16384); // proteção contra lixo sem fechamento
                }
            }
            catch (err) {
                if (!handle.stop) {
                    console.warn(`[VMS] alertStream de ${device.name} caiu (${err.message}) — reconectando em ${RETRY_DELAY_MS / 1000}s`);
                }
            }
            if (!handle.stop)
                await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
        console.log(`[VMS] Event watcher encerrado: ${device.name}`);
    }
    async handleEventBlock(device, xml) {
        const rawType = xml.match(/<eventType>([^<]+)<\/eventType>/i)?.[1]?.trim().toLowerCase();
        const eventState = xml.match(/<eventState>([^<]+)<\/eventState>/i)?.[1]?.trim().toLowerCase();
        if (!rawType || eventState !== 'active')
            return;
        const label = exports.VCA_EVENT_LABELS[rawType];
        if (!label)
            return; // videoloss/heartbeat e afins
        const eventType = normalizeEventType(rawType);
        const channelNo = Number(xml.match(/<channelID>(\d+)<\/channelID>/i)?.[1]
            ?? xml.match(/<dynChannelID>(\d+)<\/dynChannelID>/i)?.[1]
            ?? '1');
        const channel = await database_1.prisma.videoChannel.findFirst({
            where: { deviceId: device.id, channelNo, enabled: true, recording: { is: { mode: 'motion' } } },
            include: { recording: true },
        });
        if (!channel)
            return;
        // eventTypes configurados no canal (null/vazio = só movimento)
        const configured = Array.isArray(channel.recording?.eventTypes)
            ? channel.recording.eventTypes.map((t) => normalizeEventType(String(t)))
            : ['vmd'];
        if (!configured.includes(eventType))
            return;
        this.scheduler.noteMotion(channel.id, channel.recording?.postEventSec ?? 30);
        const throttleKey = `${channel.id}:${eventType}`;
        const last = this.lastEventAt.get(throttleKey) ?? 0;
        if (Date.now() - last < EVENT_THROTTLE_MS)
            return;
        this.lastEventAt.set(throttleKey, Date.now());
        try {
            await (0, node_fetch_1.default)(`${config_1.VMS_BACKEND_API_URL}/api/vms/internal/event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-vms-token': config_1.VMS_INTERNAL_TOKEN },
                body: JSON.stringify({
                    type: eventType,
                    label,
                    channelId: channel.id,
                    channelName: channel.name,
                    deviceName: device.name,
                }),
                signal: AbortSignal.timeout(5000),
            });
        }
        catch (err) {
            console.warn(`[VMS] Falha ao notificar evento ao backend: ${err.message}`);
        }
    }
}
exports.MotionWatcher = MotionWatcher;
