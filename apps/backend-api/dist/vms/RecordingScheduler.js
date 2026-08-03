"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordingScheduler = void 0;
exports.inSchedule = inSchedule;
const database_1 = require("../database");
const rtsp_1 = require("./rtsp");
const disk_1 = require("./disk");
const config_1 = require("./config");
/** Gravação manual sem parada explícita é encerrada sozinha (evita encher o disco). */
const MANUAL_MAX_MINUTES = 60;
function toMinutes(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}
/** Janela com start > end atravessa a meia-noite (ex.: 22:00–06:00). */
function inSchedule(schedule, now) {
    if (!Array.isArray(schedule))
        return false;
    const dow = now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();
    for (const w of schedule) {
        if (!w || !Array.isArray(w.dow) || !w.start || !w.end)
            continue;
        const start = toMinutes(w.start);
        const end = toMinutes(w.end);
        if (start <= end) {
            if (w.dow.includes(dow) && minutes >= start && minutes < end)
                return true;
        }
        else {
            // atravessa a meia-noite: [start, 24h) no dia listado, [0, end) no dia seguinte
            if (w.dow.includes(dow) && minutes >= start)
                return true;
            const prevDow = (dow + 6) % 7;
            if (w.dow.includes(prevDow) && minutes < end)
                return true;
        }
    }
    return false;
}
/**
 * Decide, a cada tick, se cada canal deve estar gravando e aplica no MediaMTX
 * (PATCH record/sourceOnDemand no path). Mantém o último estado aplicado em
 * memória para só chamar a API quando algo muda.
 */
class RecordingScheduler {
    constructor(mtx) {
        this.mtx = mtx;
        this.applied = new Map(); // pathName -> record aplicado
        this.appliedSeg = new Map(); // pathName -> ciclo (min) aplicado
        this.pathTrigger = new Map(); // pathName -> motivo da gravação ativa
        this.motionUntil = new Map(); // channelId -> epoch ms
        this.vcaUntil = new Map(); // channelId -> epoch ms (gravação por evento VCA)
        this.manualUntil = new Map(); // channelId -> epoch ms (gravação manual)
        this.manualStartedAt = new Map(); // channelId -> início da gravação manual
        this.diskWarned = false; // evita spam de log do disco cheio
    }
    /** Chamado pelo MotionWatcher a cada evento de movimento do canal. */
    noteMotion(channelId, postEventSec) {
        this.motionUntil.set(channelId, Date.now() + Math.max(postEventSec, 5) * 1000);
    }
    /**
     * Gravação disparada por um evento VCA (detecção). Vale em QUALQUER modo
     * (inclusive gravação desligada) — todo evento com ação "record" grava. Roda
     * um tick na hora para não esperar até 30 s (o momento do evento se perderia).
     */
    noteVcaRecord(channelId, seconds) {
        this.vcaUntil.set(channelId, Date.now() + Math.max(seconds, 5) * 1000);
        void this.tick().catch((e) => console.error(`[VMS] tick imediato (VCA) falhou: ${e.message}`));
    }
    /**
     * Gravação manual (botão REC do operador). Vale independentemente do modo
     * configurado — inclusive em canais com gravação desligada. Expira sozinha
     * após MANUAL_MAX_MINUTES, para um clique esquecido não lotar o disco.
     */
    setManual(channelId, active) {
        if (active) {
            this.manualUntil.set(channelId, Date.now() + MANUAL_MAX_MINUTES * 60000);
            this.manualStartedAt.set(channelId, new Date());
        }
        else {
            this.manualUntil.delete(channelId);
        }
    }
    /** Início da última gravação manual do canal (usado para achar o clipe gerado). */
    manualStart(channelId) {
        return this.manualStartedAt.get(channelId);
    }
    isManual(channelId) {
        return (this.manualUntil.get(channelId) ?? 0) > Date.now();
    }
    /** Canais gravando manualmente agora (para a UI acender o botão REC). */
    manualChannels() {
        const now = Date.now();
        return [...this.manualUntil.entries()].filter(([, until]) => until > now).map(([id]) => id);
    }
    /**
     * O path está com record aplicado agora? Depois de parar o REC manual, um
     * canal em modo contínuo/agenda continua gravando — o arquivo segue ABERTO.
     */
    isPathRecording(pathName) {
        return this.applied.get(pathName) ?? false;
    }
    /** Motivo da gravação em curso num path — usado pelo SegmentIndexer. */
    triggerForPath(pathName) {
        return this.pathTrigger.get(pathName) ?? 'continuous';
    }
    /** Descarta estado aplicado (força re-aplicação no próximo tick). */
    reset() {
        this.applied.clear();
        this.appliedSeg.clear();
    }
    async tick() {
        // inclui canais SEM config de gravação: eles podem estar gravando manualmente
        const channels = await database_1.prisma.videoChannel.findMany({
            where: { enabled: true, device: { enabled: true } },
            include: { recording: true },
        });
        // Disco no limite: pausa TODA a gravação. Escrever até encher trava o
        // MediaMTX (e ameaça o PostgreSQL) — melhor perder gravação que o sistema.
        const diskCritical = await (0, disk_1.isDiskCritical)();
        if (diskCritical && !this.diskWarned) {
            console.error('[VMS] Disco quase cheio — gravação PAUSADA até haver espaço livre');
            this.diskWarned = true;
        }
        else if (!diskCritical && this.diskWarned) {
            console.log('[VMS] Espaço em disco restabelecido — gravação retomada');
            this.diskWarned = false;
        }
        const now = new Date();
        for (const channel of channels) {
            const cfg = channel.recording;
            let shouldRecord = false;
            let trigger = 'continuous';
            switch (cfg?.mode) {
                case 'continuous':
                    shouldRecord = true;
                    trigger = 'continuous';
                    break;
                case 'scheduled':
                    shouldRecord = inSchedule(cfg.schedule, now);
                    trigger = 'schedule';
                    break;
                case 'motion':
                    shouldRecord = (this.motionUntil.get(channel.id) ?? 0) > Date.now();
                    trigger = 'motion';
                    break;
                default:
                    shouldRecord = false;
            }
            // evento VCA grava em qualquer modo (do momento da detecção em diante)
            if ((this.vcaUntil.get(channel.id) ?? 0) > Date.now()) {
                shouldRecord = true;
                trigger = 'motion';
            }
            // o botão REC do operador vence a configuração (grava mesmo com modo "off")
            if (this.isManual(channel.id)) {
                shouldRecord = true;
                trigger = 'manual';
            }
            if (diskCritical)
                shouldRecord = false;
            const pathName = cfg?.useSubStream ? (0, rtsp_1.subPathName)(channel.streamPath) : channel.streamPath;
            const segMinutes = Math.min(Math.max(cfg?.segmentMinutes ?? 10, 1), 120);
            // reaplica também quando só o ciclo de gravação mudou no admin
            const unchanged = this.applied.get(pathName) === shouldRecord
                && this.appliedSeg.get(pathName) === segMinutes;
            if (unchanged)
                continue;
            try {
                // Com VMS_ALWAYS_ON a fonte fica sempre conectada (abrir o app não
                // espera o RTSP subir); sem ele, só se mantém conectada enquanto grava.
                // O ciclo (duração de cada arquivo) é configurado por câmera no admin.
                await this.mtx.patchPath(pathName, {
                    record: shouldRecord,
                    recordSegmentDuration: `${segMinutes}m`,
                    ...(config_1.VMS_ALWAYS_ON ? {} : { sourceOnDemand: !shouldRecord }),
                });
                this.applied.set(pathName, shouldRecord);
                this.appliedSeg.set(pathName, segMinutes);
                if (shouldRecord) {
                    this.pathTrigger.set(pathName, trigger);
                    console.log(`[VMS] Gravação LIGADA em ${pathName} (${trigger})`);
                }
                else {
                    console.log(`[VMS] Gravação desligada em ${pathName}`);
                }
            }
            catch (err) {
                console.error(`[VMS] Falha ao alternar gravação em ${pathName}: ${err.message}`);
            }
        }
    }
}
exports.RecordingScheduler = RecordingScheduler;
