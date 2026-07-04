"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NiceGuaritaService = exports.ServiceUnavailableError = void 0;
exports.setPassbackBroadcast = setPassbackBroadcast;
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
        await NiceGuaritaProtocol_1.NiceGuaritaProtocol.triggerOutput(device.ip, device.port, cfg.deviceType ?? 0xFF, cfg.deviceNum ?? 0xFF, cfg.relayOutput ?? 0x04, true);
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
        await NiceGuaritaProtocol_1.NiceGuaritaProtocol.triggerOutput(device.ip, device.port, cfg.deviceType ?? 0xFF, cfg.deviceNum ?? 0xFF, cfg.relayClose ?? cfg.relayOutput ?? 0x04, true);
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
            const serialHex = d.serial.toString(16).toUpperCase();
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
                        tower: d.block ? d.block.toString() : null
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
                        tower: d.block ? d.block.toString() : null,
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
                // Optionally update unit/tower if missing locally
                if (!existing.unit_number && d.unit)
                    updateData.unit_number = d.unit.toString();
                if (!existing.tower && d.block)
                    updateData.tower = d.block.toString();
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
            // ── 1. Correlacionar dispositivo pela IP de origem ─────────────────────
            const device = event.sourceIp
                ? await prisma.guaritaDevice.findFirst({ where: { ip: event.sourceIp } })
                : null;
            const direction = device?.sdkConfig?.direction ?? 'both';
            // ── 2. Lookup morador pelo serial do cartão/TAG/controle ───────────────
            const person = await prisma.person.findFirst({
                where: {
                    OR: [
                        { cardSerial: event.serial },
                        { txSerial: event.serial },
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
            const ACCESS_TYPES = new Set(['access_granted', 'device_triggered', 'remote_pc_trigger', 'intercom_triggered']);
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
