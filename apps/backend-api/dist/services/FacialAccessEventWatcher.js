"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.facialAccessEventWatcher = exports.FacialAccessEventWatcher = void 0;
const client_1 = require("@prisma/client");
const digest_fetch_utils_1 = require("../utils/digest-fetch.utils");
const EventBusService_1 = require("./EventBusService");
const FacialAccessService_1 = require("./FacialAccessService");
const prisma = new client_1.PrismaClient();
const RETRY_DELAY_MS = 10000;
/**
 * Eventos em tempo real dos terminais/controladoras faciais Hikvision — Fase 4
 * do plano (docs/LEITORES-FACIAIS/PLANO-INTEGRACAO-LEITORES-FACIAIS.md).
 *
 * Mantém um long-poll `GET /ISAPI/Event/notification/alertStream` por
 * dispositivo habilitado (mesmo espírito do MotionWatcher do VMS), com
 * reconexão. Diferença importante validada no DS-K1T673DX real: as partes do
 * multipart vêm como JSON (`AccessControllerEvent`), não XML.
 *
 * Ao conectar, o equipamento reenvia os últimos eventos armazenados
 * (currentEvent=false) — a deduplicação é pelo id determinístico
 * `facial-{deviceId}-{serialNo}` (mesmo esquema do import da Fase 6), então
 * replays e reimportações não duplicam no feed.
 */
class FacialAccessEventWatcher {
    constructor() {
        this.active = new Map(); // deviceId -> handle
    }
    /** Reconcilia os watchers com o banco (boot + a cada 60s). */
    async sync() {
        const devices = await prisma.facialAccessDevice.findMany({ where: { enabled: true } });
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
        const url = `http://${device.ip}:${device.port}/ISAPI/Event/notification/alertStream`;
        console.log(`[FacialAccess] Event watcher iniciado: ${device.name} (${device.ip})`);
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
                    // Partes separadas por "--MIME_boundary"; cada parte fecha quando a
                    // próxima boundary chega. Heartbeats/partes XML são descartados.
                    for (;;) {
                        const start = buffer.indexOf('--MIME_boundary');
                        if (start === -1)
                            break;
                        const next = buffer.indexOf('--MIME_boundary', start + 15);
                        if (next === -1)
                            break;
                        const part = buffer.slice(start + 15, next);
                        buffer = buffer.slice(next);
                        const jsonStart = part.indexOf('{');
                        if (jsonStart === -1)
                            continue;
                        try {
                            const payload = JSON.parse(part.slice(jsonStart));
                            await this.handleEvent(device, payload);
                        }
                        catch { /* parte truncada/não-JSON — ignora */ }
                    }
                    if (buffer.length > 262144)
                        buffer = buffer.slice(-65536); // proteção contra lixo sem boundary
                }
            }
            catch (err) {
                if (!handle.stop) {
                    console.warn(`[FacialAccess] alertStream de ${device.name} caiu (${err.message}) — reconectando em ${RETRY_DELAY_MS / 1000}s`);
                }
            }
            if (!handle.stop)
                await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
        console.log(`[FacialAccess] Event watcher encerrado: ${device.name}`);
    }
    async handleEvent(device, payload) {
        if (payload?.eventType !== 'AccessControllerEvent')
            return;
        const ev = payload.AccessControllerEvent;
        if (!ev)
            return;
        const mapped = (0, FacialAccessService_1.mapFacialEvent)(ev.majorEventType, ev.subEventType);
        if (!mapped)
            return;
        const doorNo = ev.doorNo ?? null;
        const door = doorNo != null
            ? await prisma.facialAccessDoor.findUnique({ where: { deviceId_doorNo: { deviceId: device.id, doorNo } } })
            : null;
        const cardNo = ev.employeeNoString ?? (ev.employeeNo != null ? String(ev.employeeNo) : null);
        const person = cardNo
            ? await prisma.person.findFirst({
                where: { facialAccessCardNo: cardNo },
                select: { id: true, firstName: true, lastName: true, unit_number: true, photoUrl: true },
            })
            : null;
        const when = payload.dateTime ? new Date(payload.dateTime) : new Date();
        try {
            await (0, EventBusService_1.emitEvent)({
                id: `facial-${device.id}-${ev.serialNo}`,
                occurredAt: isNaN(when.getTime()) ? new Date() : when,
                personName: person
                    ? `${person.firstName} ${person.lastName}`.trim()
                    : mapped.kind === 'alarm' ? mapped.label
                        : ev.name || mapped.label,
                personType: person ? 'resident' : 'system',
                personId: person?.id ?? null,
                unit: person?.unit_number ?? null,
                deviceName: door?.name ?? device.name,
                status: mapped.status,
                photoUrl: person?.photoUrl ?? null,
                direction: door?.direction === 'entry' ? 'in' : door?.direction === 'exit' ? 'out' : null,
                category: mapped.kind,
                source: 'facial_access',
                notes: mapped.kind === 'access' && !person && cardNo ? `employeeNo ${cardNo}` : null,
                metadata: {
                    deviceId: device.id, doorId: door?.id ?? null, serialNo: ev.serialNo,
                    major: ev.majorEventType, minor: ev.subEventType,
                    verifyMode: ev.currentVerifyMode ?? null, mask: ev.mask ?? null,
                    cardReaderNo: ev.cardReaderNo ?? null, pictureURL: ev.pictureURL ?? null,
                },
            });
        }
        catch (err) {
            // P2002 = replay de evento já persistido (reconexão/import) — silencioso
            if (err?.code !== 'P2002') {
                console.error(`[FacialAccess] Falha ao gravar evento de ${device.name}:`, err.message);
            }
        }
    }
}
exports.FacialAccessEventWatcher = FacialAccessEventWatcher;
exports.facialAccessEventWatcher = new FacialAccessEventWatcher();
