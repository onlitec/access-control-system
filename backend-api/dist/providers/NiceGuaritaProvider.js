"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NiceGuaritaProvider = void 0;
const NiceGuaritaProtocol_1 = require("../services/NiceGuaritaProtocol");
/**
 * Nice Guarita IP provider — real implementation.
 * Enrolls/deletes devices using the MG3000 binary protocol over TCP.
 * Gate control via relay trigger (Cmd 13).
 */
class NiceGuaritaProvider {
    constructor(ip, port) {
        this.name = 'nice_guarita';
        this.ip = ip ?? process.env.NICE_GUARITA_IP ?? '192.168.1.100';
        this.port = port ?? parseInt(process.env.NICE_GUARITA_PORT ?? '80', 10);
    }
    async isAvailable() {
        return NiceGuaritaProtocol_1.NiceGuaritaProtocol.ping(this.ip, this.port);
    }
    // ── People / Residents ────────────────────────────────────────────────────
    // Maps person data to MG3000 device enrollment (card by default)
    async addPerson(data) {
        if (!data.cardSerial && !data.txSerial) {
            console.warn('[NiceGuarita] addPerson: no cardSerial or txSerial provided, skipping enrollment');
            return null;
        }
        let successCount = 0;
        // Cadastra o Cartão/Tag
        if (data.cardSerial) {
            const cardFrame = {
                deviceType: NiceGuaritaProtocol_1.DEVICE_TYPES.CARD,
                serial: parseInt(data.cardSerial.replace(/\s/g, ''), 16),
                identification: `${data.firstName} ${data.lastName}`.substring(0, 18),
                unit: data.unit,
                block: data.block,
                vehiclePlate: data.vehiclePlate,
                vehicleBrand: data.vehiclePlate ? 0x00 : 0x1F,
                receiverBitmask: data.receiverBitmask ?? 0xFF,
            };
            const result = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.enrollDevice(this.ip, this.port, cardFrame);
            if (result.success)
                successCount++;
            else
                console.error('[NiceGuarita] addPerson (CARD) failed:', result.message);
        }
        // Cadastra o Controle Remoto (TX)
        if (data.txSerial) {
            const txFrame = {
                deviceType: NiceGuaritaProtocol_1.DEVICE_TYPES.CONTROL,
                serial: parseInt(data.txSerial.replace(/\s/g, ''), 16),
                identification: `${data.firstName} ${data.lastName}`.substring(0, 18),
                unit: data.unit,
                block: data.block,
                vehiclePlate: data.vehiclePlate,
                vehicleBrand: data.vehiclePlate ? 0x00 : 0x1F,
                receiverBitmask: data.receiverBitmask ?? 0xFF,
            };
            const result = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.enrollDevice(this.ip, this.port, txFrame);
            if (result.success)
                successCount++;
            else
                console.error('[NiceGuarita] addPerson (TX) failed:', result.message);
        }
        if (successCount > 0) {
            await NiceGuaritaProtocol_1.NiceGuaritaProtocol.updateReceivers(this.ip, this.port);
            // We return a primary identifier; prefer card over TX
            return data.cardSerial || data.txSerial || null;
        }
        return null;
    }
    async updatePerson(externalId, data) {
        // MG3000 has no update command; delete + re-enroll
        await this.deletePerson(externalId);
        if (data.cardSerial || data.txSerial) {
            await this.addPerson({ ...data, cardSerial: data.cardSerial, txSerial: data.txSerial });
        }
    }
    async deletePerson(externalId) {
        const serialNum = parseInt(externalId.replace(/\s/g, ''), 16);
        if (!isNaN(serialNum) && serialNum !== 0) {
            await NiceGuaritaProtocol_1.NiceGuaritaProtocol.deleteDevice(this.ip, this.port, NiceGuaritaProtocol_1.DEVICE_TYPES.CARD, serialNum);
            await NiceGuaritaProtocol_1.NiceGuaritaProtocol.deleteDevice(this.ip, this.port, NiceGuaritaProtocol_1.DEVICE_TYPES.CONTROL, serialNum);
            await NiceGuaritaProtocol_1.NiceGuaritaProtocol.updateReceivers(this.ip, this.port);
        }
    }
    async getPersons(_filter) {
        // MG3000 uses Cmd 70 (progressive read) — not implemented here yet
        return [];
    }
    async addPersonFace(_externalId, _faceBase64) {
        // Biometric integration via Cmd 74 (ANVIZ) — future implementation
        console.warn('[NiceGuarita] addPersonFace: biometric not yet implemented');
    }
    async authorizePersonAccess(_externalId, _levelCodes) {
        // Access levels in MG3000 are managed by receiverBitmask in enrollment frame
        console.warn('[NiceGuarita] authorizePersonAccess: managed via receiverBitmask during enrollment');
    }
    async getPersonAccessLevels(_externalId) {
        return [];
    }
    // ── Visitors ──────────────────────────────────────────────────────────────
    async createVisitor(data) {
        if (!data.cardSerial)
            return null;
        // Visitors enrolled with CARD type flagged as "CT Visitante" (bytes 0x56 0x49 in frame)
        const frame = {
            deviceType: NiceGuaritaProtocol_1.DEVICE_TYPES.CARD,
            serial: parseInt(data.cardSerial.replace(/\s/g, ''), 16),
            identification: data.fullName?.substring(0, 18),
            receiverBitmask: 0xFF,
        };
        const result = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.enrollDevice(this.ip, this.port, frame);
        if (result.success) {
            await NiceGuaritaProtocol_1.NiceGuaritaProtocol.updateReceivers(this.ip, this.port);
            return data.cardSerial;
        }
        return null;
    }
    async listVisitors(_groupName) {
        return [];
    }
    // ── Access Logs ───────────────────────────────────────────────────────────
    async getAccessLogs(_params) {
        // Access logs are push-based via Cmd 4 events handled by guaritaEventServer
        return [];
    }
    // ── Devices / Terminals ───────────────────────────────────────────────────
    async getDevices() {
        const count = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.readDeviceCount(this.ip, this.port).catch(() => 0);
        return [{
                id: `nice_guarita_${this.ip}`,
                name: `Módulo Guarita MG3000 (${this.ip})`,
                ip: this.ip,
                status: count >= 0 ? 'online' : 'offline',
                enrolledDevices: count,
            }];
    }
    async captureDevicePhoto(_deviceId) {
        return null;
    }
    // ── Configuration / Metadata ──────────────────────────────────────────────
    async getOrganizations() {
        return [];
    }
    async getAccessLevels() {
        // MG3000 uses receiver bitmask (8 receivers) instead of named access levels
        return [
            { id: '0xFF', name: 'Todos os receptores' },
            { id: '0x01', name: 'Receptor 1' },
            { id: '0x02', name: 'Receptor 2' },
            { id: '0x04', name: 'Receptor 3' },
            { id: '0x08', name: 'Receptor 4' },
            { id: '0x10', name: 'Receptor 5' },
            { id: '0x20', name: 'Receptor 6' },
            { id: '0x40', name: 'Receptor 7' },
            { id: '0x80', name: 'Receptor 8' },
        ];
    }
    // ── Guarita-specific gate control ─────────────────────────────────────────
    async openGate(_deviceId) {
        await NiceGuaritaProtocol_1.NiceGuaritaProtocol.triggerOutput(this.ip, this.port);
    }
    async closeGate(_deviceId) {
        await NiceGuaritaProtocol_1.NiceGuaritaProtocol.triggerOutput(this.ip, this.port);
    }
    async getGateStatus(_deviceId) {
        return 'unknown';
    }
}
exports.NiceGuaritaProvider = NiceGuaritaProvider;
