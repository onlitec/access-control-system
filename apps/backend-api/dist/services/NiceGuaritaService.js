"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NiceGuaritaService = exports.ServiceUnavailableError = void 0;
exports.setPassbackBroadcast = setPassbackBroadcast;
exports.describeReceiverEvent = describeReceiverEvent;
const client_1 = require("@prisma/client");
const NiceGuaritaProtocol_1 = require("./NiceGuaritaProtocol");
const EventBusService_1 = require("./EventBusService");
// Importação lazy para evitar dependência circular com routes
let _broadcastFn = null;
function setPassbackBroadcast(fn) {
    _broadcastFn = fn;
}
// Dedupe de rajadas: mesmo serial em <5s é ignorado (controle pressionado repetidamente)
const _recentSerials = new Map();
function isDuplicateBurst(serial, at) {
    const now = at.getTime();
    const last = _recentSerials.get(serial);
    _recentSerials.set(serial, now);
    if (_recentSerials.size > 500) {
        for (const [s, ts] of _recentSerials) {
            if (now - ts > 60000)
                _recentSerials.delete(s);
        }
    }
    return last !== undefined && now - last < 5000;
}
// Cache de configurações APB (TTL 30s) para evitar N+1 queries por evento
let _apbCache = null;
async function isAntiPassbackEnabled(prisma) {
    const now = Date.now();
    if (_apbCache && now - _apbCache.ts < 30000)
        return _apbCache.enabled;
    const settings = await prisma.condominiumSettings.findUnique({ where: { id: 'singleton' } });
    _apbCache = { enabled: settings?.antiPassbackEnabled ?? false, ts: now };
    return _apbCache.enabled;
}
const prisma = new client_1.PrismaClient();
/**
 * Subtipos do "Evento de receptor" (0x0C) — enviados pelo TX-4A e afins via CAN
 * quando o portão muda de estado (sensor de porta) ou em condições especiais.
 * Códigos conforme demo oficial Delphi (uprincipal.pas, evento tipo 12).
 */
function describeReceiverEvent(subCode) {
    switch (subCode) {
        case 0xFB: return { name: 'Portão abriu', category: 'gate', status: 'authorized' };
        case 0xFA: return { name: 'Portão fechou', category: 'gate', status: 'authorized' };
        case 0xF9: return { name: 'Portão violado', category: 'alarm', status: 'denied' };
        case 0xFF: return { name: 'Portão aberto (tempo excedido)', category: 'alarm', status: 'denied' };
        case 0xFE: return { name: "Falta d'água", category: 'device', status: 'denied' };
        case 0x00: return { name: 'TAG sem vaga', category: 'access', status: 'denied' };
        default: return { name: `Evento de receptor (0x${subCode.toString(16)})`, category: 'device', status: 'authorized' };
    }
}
// Sentinel for features blocked until hardware is connected
class ServiceUnavailableError extends Error {
    constructor(feature) {
        super(`Nice Guarita IP: funcionalidade "${feature}" indisponível. Verifique conexão com o módulo.`);
        this.code = 'SDK_UNAVAILABLE';
    }
}
exports.ServiceUnavailableError = ServiceUnavailableError;
// ─────────────────────────────────────────────────────────────────────────────
// NICE GUARITA IP — SERVICE
// All methods now have real protocol implementations.
// ─────────────────────────────────────────────────────────────────────────────
class NiceGuaritaService {
    // ── Device Registry (DB) ──────────────────────────────────────────────────
    static async listDevices() {
        return prisma.guaritaDevice.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, name: true, ip: true, port: true, location: true, enabled: true, sdkConfig: true, createdAt: true },
        });
    }
    static async getDevice(deviceId) {
        const device = await prisma.guaritaDevice.findUnique({ where: { id: deviceId } });
        if (!device)
            throw new Error(`Dispositivo Guarita ${deviceId} não encontrado`);
        return device;
    }
    // ── Connectivity ──────────────────────────────────────────────────────────
    static async pingDevice(deviceId) {
        const device = await this.getDevice(deviceId);
        const online = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.ping(device.ip, device.port);
        if (!online)
            return { online: false };
        const [deviceCount, clock] = await Promise.all([
            NiceGuaritaProtocol_1.NiceGuaritaProtocol.readDeviceCount(device.ip, device.port),
            NiceGuaritaProtocol_1.NiceGuaritaProtocol.readClock(device.ip, device.port),
        ]);
        return { online: true, deviceCount, clock };
    }
    /**
     * Scans a subnet for Nice Guarita MG3000 modules using TCP ping.
     * @param subnet e.g. "192.168.1"
     * @param port e.g. 80
     * @returns array of discovered IP addresses and details
     */
    static async scanNetwork(subnet, port = 80) {
        const discovered = [];
        const baseIp = subnet.endsWith('.') ? subnet.slice(0, -1) : subnet;
        const parts = baseIp.split('.');
        // We only support /24 subnet scans for simplicity (e.g. 192.168.1)
        let networkPrefix = baseIp;
        if (parts.length === 4) {
            networkPrefix = parts.slice(0, 3).join('.');
        }
        else if (parts.length !== 3) {
            throw new Error('Formato de sub-rede inválido. Use algo como "192.168.1"');
        }
        const batchSize = 30; // Scan in batches to avoid maxing out connections
        for (let i = 1; i < 255; i += batchSize) {
            const promises = [];
            for (let j = 0; j < batchSize && (i + j) < 255; j++) {
                const ip = `${networkPrefix}.${i + j}`;
                promises.push((async () => {
                    const online = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.ping(ip, port, 1000); // lower timeout for scan
                    if (online) {
                        const [deviceCount, clock] = await Promise.all([
                            NiceGuaritaProtocol_1.NiceGuaritaProtocol.readDeviceCount(ip, port),
                            NiceGuaritaProtocol_1.NiceGuaritaProtocol.readClock(ip, port),
                        ]);
                        discovered.push({ ip, deviceCount, clock });
                    }
                })());
            }
            await Promise.all(promises);
        }
        return discovered;
    }
    // ── Gate Control ──────────────────────────────────────────────────────────
    /**
     * Open gate/barrier — sends Cmd 13 (trigger relay) to the Guarita module.
     * Uses sdkConfig.deviceType and sdkConfig.deviceNum if set; defaults to broadcast (0xFF).
     */
    static async openGate(deviceId) {
        const device = await this.getDevice(deviceId);
        if (!device.enabled)
            throw new Error(`Dispositivo ${device.name} está desabilitado`);
        const cfg = (device.sdkConfig ?? {});
        await NiceGuaritaProtocol_1.NiceGuaritaProtocol.triggerOutput(device.ip, device.port, cfg.deviceType ?? 0xFF, cfg.deviceNum ?? 0xFF, cfg.relayOutput ?? 0x01, true);
    }
    /**
     * Close gate — same command, different relay output (if wired separately).
     * Most installations use the same relay to toggle, so we re-trigger.
     */
    static async closeGate(deviceId) {
        const device = await this.getDevice(deviceId);
        if (!device.enabled)
            throw new Error(`Dispositivo ${device.name} está desabilitado`);
        const cfg = (device.sdkConfig ?? {});
        await NiceGuaritaProtocol_1.NiceGuaritaProtocol.triggerOutput(device.ip, device.port, cfg.deviceType ?? 0xFF, cfg.deviceNum ?? 0xFF, cfg.relayClose ?? cfg.relayOutput ?? 0x01, true);
    }
    static async getGateStatus(_deviceId) {
        // MG3000 does not report gate status via polling; status is event-driven (Cmd 4).
        // Return 'unknown' — UI should rely on access events instead.
        return 'unknown';
    }
    // ── Device Enrollment ─────────────────────────────────────────────────────
    /**
     * Enroll a card/tag/password into the Guarita memory for a resident.
     * Automatically runs Cmd 29 (updateReceivers) after successful enrollment.
     */
    static async enrollResident(guardDeviceId, resident) {
        const device = await this.getDevice(guardDeviceId);
        if (!device.enabled)
            throw new Error(`Dispositivo ${device.name} está desabilitado`);
        const serialNum = parseInt(resident.serial.replace(/\s/g, ''), 16);
        if (isNaN(serialNum) || serialNum === 0) {
            return { success: false, message: 'Serial inválido', receiversUpdated: false };
        }
        const frame = {
            deviceType: resident.deviceType ?? NiceGuaritaProtocol_1.DEVICE_TYPES.CARD,
            serial: serialNum,
            unit: resident.unit,
            block: resident.block,
            identification: resident.name?.substring(0, 18),
            vehiclePlate: resident.vehiclePlate,
            vehicleBrand: resident.vehiclePlate ? 0x00 : 0x1F,
            receiverBitmask: resident.receiverBitmask ?? 0xFF,
        };
        const result = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.enrollDevice(device.ip, device.port, frame);
        let receiversUpdated = false;
        if (result.success) {
            const syncResult = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.updateReceivers(device.ip, device.port);
            receiversUpdated = syncResult.success;
            if (!syncResult.success) {
                console.warn(`[NiceGuarita] Cmd 29 falhou em ${device.name}: ${syncResult.message} — receptores no barramento CAN não confirmaram (verificar cabeamento/endereço CAN dos receptores)`);
            }
        }
        return { ...result, receiversUpdated };
    }
    /**
     * Remove a device from the Guarita memory.
     * Automatically runs Cmd 29 after deletion.
     */
    static async unenrollResident(guardDeviceId, serial, deviceType = NiceGuaritaProtocol_1.DEVICE_TYPES.CARD) {
        const device = await this.getDevice(guardDeviceId);
        if (!device.enabled)
            throw new Error(`Dispositivo ${device.name} está desabilitado`);
        const serialNum = parseInt(serial.replace(/\s/g, ''), 16);
        if (isNaN(serialNum) || serialNum === 0) {
            return { success: false, message: 'Serial inválido', receiversUpdated: false };
        }
        const result = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.deleteDevice(device.ip, device.port, deviceType, serialNum);
        let receiversUpdated = false;
        if (result.success) {
            const syncResult = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.updateReceivers(device.ip, device.port);
            receiversUpdated = syncResult.success;
            if (!syncResult.success) {
                console.warn(`[NiceGuarita] Cmd 29 falhou em ${device.name}: ${syncResult.message} — receptores no barramento CAN não confirmaram (verificar cabeamento/endereço CAN dos receptores)`);
            }
        }
        return { ...result, receiversUpdated };
    }
    /**
     * Imports all devices from the Guarita memory and creates Residents (Persons) in the database.
     */
    static async importResidents(guardDeviceId) {
        let device;
        if (guardDeviceId === 'default') {
            device = await prisma.guaritaDevice.findFirst({ where: { enabled: true } });
            if (!device)
                throw new Error('Nenhum dispositivo Guarita IP habilitado foi encontrado.');
        }
        else {
            device = await this.getDevice(guardDeviceId);
        }
        if (!device.enabled)
            throw new Error(`Dispositivo ${device.name} está desabilitado`);
        const count = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.readDeviceCount(device.ip, device.port);
        if (count === 0)
            return { imported: 0, total: 0 };
        const devices = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.readAllDevices(device.ip, device.port, count);
        let imported = 0;
        for (const d of devices) {
            if (!d.identification || !d.serial)
                continue;
            // MG3000 Device Type mapping to Prisma fields
            const isCard = d.deviceType === NiceGuaritaProtocol_1.DEVICE_TYPES.CARD;
            const isControl = d.deviceType === NiceGuaritaProtocol_1.DEVICE_TYPES.CONTROL;
            if (!isCard && !isControl)
                continue; // Skip biometric/passwords for now unless needed
            // Formato canônico = o mesmo dos eventos Cmd 4 do módulo: TX tem 7
            // dígitos hex (nibble alto incluso), demais 6 — com zeros à esquerda.
            // Sem isso o lookup do morador no acionamento nunca casa.
            const serialHex = d.serial.toString(16).toUpperCase().padStart(isControl ? 7 : 6, '0');
            const parts = d.identification.trim().split(' ');
            const firstName = parts[0] || 'Desconhecido';
            const lastName = parts.slice(1).join(' ') || '';
            // Check if already exists by Serial OR by Name+Unit
            let existing = await prisma.person.findFirst({
                where: {
                    OR: [
                        { cardSerial: serialHex },
                        { txSerial: serialHex }
                    ]
                }
            });
            if (!existing) {
                existing = await prisma.person.findFirst({
                    where: {
                        firstName,
                        lastName,
                        unit_number: d.unit ? d.unit.toString() : null,
                        block: d.block ? d.block.toString() : null // ✓ FIX: block field, not tower
                    }
                });
            }
            if (!existing) {
                // Create new Resident
                await prisma.person.create({
                    data: {
                        firstName,
                        lastName,
                        unit_number: d.unit ? d.unit.toString() : null,
                        block: d.block ? d.block.toString() : null, // ✓ FIX: block field, not tower
                        cardSerial: isCard ? serialHex : null,
                        txSerial: isControl ? serialHex : null,
                        orgIndexCode: '7', // default for Residents
                        is_owner: true
                    }
                });
                imported++;
            }
            else {
                // Smart Merge: Update only the tags/controls, preserving local data (Photos, etc)
                const updateData = {};
                if (isCard && existing.cardSerial !== serialHex)
                    updateData.cardSerial = serialHex;
                if (isControl && existing.txSerial !== serialHex)
                    updateData.txSerial = serialHex;
                // Optionally update unit/block if missing locally
                if (!existing.unit_number && d.unit)
                    updateData.unit_number = d.unit.toString();
                if (!existing.block && d.block)
                    updateData.block = d.block.toString(); // ✓ FIX: block field, not tower
                if (Object.keys(updateData).length > 0) {
                    await prisma.person.update({
                        where: { id: existing.id },
                        data: updateData
                    });
                    imported++;
                }
            }
        }
        return { imported, total: count };
    }
    static startImportStoredEvents(deviceId, from = 0, to = 8191) {
        const existing = this.importJobs.get(deviceId);
        if (existing?.running)
            return existing;
        const progress = { running: true, from, to, processed: 0, imported: 0, startedAt: new Date() };
        this.importJobs.set(deviceId, progress);
        void (async () => {
            try {
                const device = await this.getDevice(deviceId);
                // Mapas em memória: serial→morador e relé→portão (evita N+1 na varredura)
                const persons = await prisma.person.findMany({
                    where: { OR: [{ txSerial: { not: null } }, { cardSerial: { not: null } }] },
                    select: { id: true, firstName: true, lastName: true, unit_number: true, photoUrl: true, txSerial: true, cardSerial: true },
                });
                const personBySerial = new Map();
                for (const p of persons) {
                    for (const s of [p.txSerial, p.cardSerial]) {
                        if (!s)
                            continue;
                        personBySerial.set(s.toUpperCase(), p);
                        personBySerial.set(s.toUpperCase().replace(/^0+/, ''), p);
                    }
                }
                const gates = await prisma.guaritaDevice.findMany({ where: { ip: device.ip } });
                const gateByOutput = new Map();
                for (const g of gates) {
                    const relay = g.sdkConfig?.relayOutput;
                    if (typeof relay === 'number')
                        gateByOutput.set(relay, g);
                }
                const IMPORT_TYPES = new Set(['device_triggered', 'access_granted', 'panic', 'clone_attempt', 'intercom_triggered']);
                let batch = [];
                const flush = async () => {
                    if (batch.length === 0)
                        return;
                    const result = await prisma.accessEvent.createMany({ data: batch, skipDuplicates: true });
                    progress.imported += result.count;
                    batch = [];
                };
                for (let pointer = from; pointer <= Math.min(to, 8191); pointer++) {
                    const ev = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.readEventAt(device.ip, device.port, pointer).catch(() => null);
                    progress.processed++;
                    if (!ev || !IMPORT_TYPES.has(ev.type) || isNaN(ev.dateTime.getTime()))
                        continue;
                    const serialTrimmed = ev.serial.replace(/^0+/, '');
                    const person = personBySerial.get(ev.serial) ?? personBySerial.get(serialTrimmed) ?? null;
                    const gate = ev.output != null ? gateByOutput.get(ev.output) ?? null : null;
                    const gateCfg = gate?.sdkConfig;
                    const direction = gateCfg?.direction === 'entry' ? 'in' : gateCfg?.direction === 'exit' ? 'out' : null;
                    const isAlarm = ev.type === 'panic' || ev.type === 'clone_attempt';
                    const isIntercom = ev.type === 'intercom_triggered';
                    batch.push({
                        id: `mg3k-${ev.serial}-${Math.floor(ev.dateTime.getTime() / 1000)}-${ev.output ?? 'x'}`,
                        occurredAt: ev.dateTime,
                        eventTime: ev.dateTime,
                        personName: person
                            ? `${person.firstName} ${person.lastName}`.trim()
                            : isIntercom ? 'Acionamento pela portaria'
                                : ev.type === 'panic' ? 'Botão de pânico acionado'
                                    : ev.type === 'clone_attempt' ? 'Tentativa de clonagem detectada'
                                        : 'Controle não cadastrado',
                        personType: person ? 'resident' : 'system',
                        personId: person?.id ?? null,
                        unit: person?.unit_number ?? null,
                        deviceName: gate?.name ?? device.name,
                        status: isAlarm || (!person && !isIntercom) ? 'denied' : 'authorized',
                        photoUrl: person?.photoUrl ?? null,
                        direction: isIntercom || isAlarm ? null : direction,
                        category: isAlarm ? 'alarm' : isIntercom ? 'gate' : 'access',
                        source: 'controle_rf',
                        notes: person ? null : `Serial ${ev.serial}`,
                        metadata: { serial: ev.serial, deviceKind: ev.deviceKind, guaritaEventType: ev.type, output: ev.output, pointer, importedFromModule: true },
                    });
                    if (batch.length >= 200)
                        await flush();
                }
                await flush();
                progress.running = false;
                progress.finishedAt = new Date();
                console.log(`[NiceGuarita] Importação de histórico concluída: ${progress.imported} eventos de ${progress.processed} ponteiros lidos (${device.name})`);
            }
            catch (err) {
                progress.running = false;
                progress.finishedAt = new Date();
                progress.error = err.message;
                console.error('[NiceGuarita] Importação de histórico falhou:', err.message);
            }
        })();
        return progress;
    }
    // ── Clock Sync ────────────────────────────────────────────────────────────
    static async syncClock(deviceId) {
        const device = await this.getDevice(deviceId);
        try {
            await NiceGuaritaProtocol_1.NiceGuaritaProtocol.writeClock(device.ip, device.port);
            const guardaClock = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.readClock(device.ip, device.port);
            return { success: true, guardaClock };
        }
        catch (err) {
            return { success: false };
        }
    }
    // ── Access Event Handler ──────────────────────────────────────────────────
    /**
     * Handle an incoming push event (Cmd 4) from the MG3000.
     * Persists to AccessLog and returns the structured event.
     */
    static async handleAccessEvent(event) {
        console.log(`[NiceGuarita] Access event: type=${event.type} serial=${event.serial} at ${event.dateTime.toISOString()} device=${event.deviceKind} sourceIp=${event.sourceIp ?? 'unknown'}`);
        try {
            // ── 0. Dedupe de rajadas (mesmo serial em <5s) ─────────────────────────
            if (isDuplicateBurst(event.serial, event.dateTime)) {
                console.log(`[NiceGuarita] Evento duplicado ignorado (rajada): serial=${event.serial}`);
                return;
            }
            // ── 1. Correlacionar dispositivo (portão) pela IP + saída (relé) ───────
            // Um módulo comanda vários portões (ex.: relé 1 = entrada moradores,
            // relé 2 = entrada visitantes, relé 3 = saída), cada um cadastrado como
            // um GuaritaDevice com o mesmo IP e sdkConfig.relayOutput distinto.
            const candidates = event.sourceIp
                ? await prisma.guaritaDevice.findMany({ where: { ip: event.sourceIp } })
                : [];
            const device = (event.output != null
                ? candidates.find((d) => (d.sdkConfig?.relayOutput ?? null) === event.output)
                : undefined) ?? candidates[0] ?? null;
            const direction = device?.sdkConfig?.direction ?? 'both';
            // ── 2. Lookup morador pelo serial do cartão/TAG/controle ───────────────
            // Aceita também o serial sem zeros à esquerda (cadastros antigos/manuais)
            const serialTrimmed = event.serial.replace(/^0+/, '') || event.serial;
            const person = await prisma.person.findFirst({
                where: {
                    OR: [
                        { cardSerial: { in: [event.serial, serialTrimmed], mode: 'insensitive' } },
                        { txSerial: { in: [event.serial, serialTrimmed], mode: 'insensitive' } },
                        { hikPersonId: event.serial },
                        { externalId: event.serial },
                    ],
                },
            });
            // ── 3. Anti-Passagem Dupla ─────────────────────────────────────────────
            if (person && direction === 'entry') {
                const apbEnabled = await isAntiPassbackEnabled(prisma);
                if (apbEnabled) {
                    const state = await prisma.guaritaPassbackState.findUnique({ where: { personId: person.id } });
                    if (state?.direction === 'IN') {
                        // VIOLAÇÃO: morador tenta entrar sem ter saído
                        const alert = await prisma.guaritaPassbackAlert.create({
                            data: {
                                personId: person.id,
                                personName: `${person.firstName} ${person.lastName}`.trim(),
                                serial: event.serial,
                                deviceId: device?.id ?? null,
                                deviceName: device?.name ?? null,
                                unit: person.unit_number ?? null,
                                photoUrl: person.photoUrl ?? null,
                                occurredAt: event.dateTime,
                            },
                        });
                        console.warn(`[APB] Violação: ${person.firstName} ${person.lastName} tentou entrar sem registrar saída. Alert ID=${alert.id}`);
                        _broadcastFn?.(alert);
                        await (0, EventBusService_1.emitEvent)({
                            occurredAt: event.dateTime,
                            personName: `${person.firstName} ${person.lastName}`.trim(),
                            personType: 'resident',
                            personId: person.id,
                            unit: person.unit_number ?? null,
                            deviceName: device?.name ?? 'Guarita IP',
                            status: 'denied',
                            photoUrl: person.photoUrl ?? null,
                            notes: 'Anti-passback: entrada bloqueada sem registro de saída',
                            direction: 'in',
                            category: 'access',
                            source: 'controle_rf',
                            metadata: { serial: event.serial, deviceKind: event.deviceKind, deviceId: device?.id ?? null, passbackAlertId: alert.id },
                        }).catch(e => console.error('[NiceGuarita] Falha ao emitir evento APB:', e.message));
                        return; // Bloquear: não atualiza estado, não concede acesso
                    }
                    // Registrar entrada: atualizar estado para IN
                    await prisma.guaritaPassbackState.upsert({
                        where: { personId: person.id },
                        create: { personId: person.id, serial: event.serial, direction: 'IN', deviceId: device?.id ?? null, occurredAt: event.dateTime },
                        update: { serial: event.serial, direction: 'IN', deviceId: device?.id ?? null, occurredAt: event.dateTime },
                    });
                    console.log(`[APB] Entrada registrada: ${person.firstName} ${person.lastName} — estado: IN`);
                }
            }
            if (person && direction === 'exit') {
                // Registrar saída: atualizar estado para OUT
                await prisma.guaritaPassbackState.upsert({
                    where: { personId: person.id },
                    create: { personId: person.id, serial: event.serial, direction: 'OUT', deviceId: device?.id ?? null, occurredAt: event.dateTime },
                    update: { serial: event.serial, direction: 'OUT', deviceId: device?.id ?? null, occurredAt: event.dateTime },
                });
                console.log(`[APB] Saída registrada: ${person.firstName} ${person.lastName} — estado: OUT`);
            }
            // ── 4. Persistir na Central de Eventos (com broadcast SSE) ────────────
            const eventDirection = direction === 'entry' ? 'in' : direction === 'exit' ? 'out' : null;
            const source = event.deviceKind?.toUpperCase().includes('CONTROL') ? 'controle_rf' : 'guarita';
            const baseMetadata = {
                serial: event.serial,
                deviceKind: event.deviceKind,
                deviceId: device?.id ?? null,
                guaritaEventType: event.type,
            };
            const ALARM_TYPES = new Set(['panic', 'clone_attempt']);
            // Acionamentos COM serial (controle/cartão/tag do morador)
            const ACCESS_TYPES = new Set(['access_granted', 'device_triggered']);
            if (event.type === 'remote_pc_trigger') {
                // Eco do Cmd 13 enviado pela própria plataforma (gera_evt=1): a rota
                // /open|/close já registrou "Portão aberto/fechado manualmente" —
                // registrar de novo criaria evento falso "Controle não cadastrado".
                console.log(`[NiceGuarita] Acionamento PC confirmado pelo módulo ${device?.name ?? event.sourceIp ?? ''}`);
                return;
            }
            if (event.type === 'intercom_triggered') {
                // Acionamento feito na console física da portaria (sem serial)
                await (0, EventBusService_1.emitEvent)({
                    occurredAt: event.dateTime,
                    personName: 'Acionamento pela portaria',
                    personType: 'system',
                    deviceName: device?.name ?? 'Guarita IP',
                    status: 'authorized',
                    category: 'gate',
                    source: 'guarita',
                    metadata: baseMetadata,
                });
                return;
            }
            if (event.type === 'receiver_event') {
                // Evento vindo do receptor (TX-4A etc.) via CAN: mudança de estado do
                // portão (sensor de porta) — cobre também aberturas feitas diretamente
                // no receptor/controle em modo autônomo, desde que haja sensor ligado.
                const desc = describeReceiverEvent(event.subCode);
                await (0, EventBusService_1.emitEvent)({
                    occurredAt: event.dateTime,
                    personName: desc.name,
                    personType: 'system',
                    deviceName: device?.name ?? 'Guarita IP',
                    status: desc.status,
                    category: desc.category,
                    source: 'guarita',
                    metadata: { ...baseMetadata, receiverSubCode: event.subCode },
                });
                return;
            }
            if (ALARM_TYPES.has(event.type)) {
                await (0, EventBusService_1.emitEvent)({
                    occurredAt: event.dateTime,
                    personName: event.type === 'panic' ? 'Botão de pânico acionado' : 'Tentativa de clonagem detectada',
                    personType: 'system',
                    personId: person?.id ?? null,
                    unit: person?.unit_number ?? null,
                    deviceName: device?.name ?? 'Guarita IP',
                    status: 'denied',
                    photoUrl: person?.photoUrl ?? null,
                    notes: person ? `Serial de ${person.firstName} ${person.lastName}`.trim() : `Serial ${event.serial}`,
                    category: 'alarm',
                    source,
                    metadata: baseMetadata,
                });
            }
            else if (ACCESS_TYPES.has(event.type)) {
                if (person) {
                    await (0, EventBusService_1.emitEvent)({
                        occurredAt: event.dateTime,
                        personName: `${person.firstName} ${person.lastName}`.trim(),
                        personType: 'resident',
                        personId: person.id,
                        unit: person.unit_number ?? null,
                        deviceName: device?.name ?? 'Guarita IP',
                        status: 'authorized',
                        photoUrl: person.photoUrl ?? null,
                        direction: eventDirection,
                        category: 'access',
                        source,
                        metadata: baseMetadata,
                    });
                }
                else {
                    // Serial desconhecido: acesso negado — controle não cadastrado
                    await (0, EventBusService_1.emitEvent)({
                        occurredAt: event.dateTime,
                        personName: 'Controle não cadastrado',
                        personType: 'system',
                        deviceName: device?.name ?? 'Guarita IP',
                        status: 'denied',
                        notes: `Serial ${event.serial}`,
                        direction: eventDirection,
                        category: 'access',
                        source,
                        metadata: baseMetadata,
                    });
                }
            }
            else {
                // Demais tipos (doorbell, programming_changed etc.): apenas log
                console.log(`[NiceGuarita] Event: ${event.type} serial=${event.serial} person=${person?.id ?? 'unknown'} dir=${direction}`);
            }
        }
        catch (err) {
            console.error('[NiceGuarita] Error handling access event:', err.message);
        }
    }
    static isSdkAvailable() {
        return true; // Protocol layer is now implemented
    }
}
exports.NiceGuaritaService = NiceGuaritaService;
// ── Importação do histórico de eventos da memória do módulo ─────────────
/**
 * O MG3000 guarda até 8192 eventos em memória circular. Este job lê a faixa
 * de ponteiros pedida e converte acionamentos/alarmes em AccessEvents locais.
 * Idempotente: o id é derivado de serial+instante+saída (createMany com
 * skipDuplicates), então rodar de novo não duplica; acionamentos repetidos
 * no MESMO segundo (retransmissões do receptor) colapsam em um evento.
 */
NiceGuaritaService.importJobs = new Map();
