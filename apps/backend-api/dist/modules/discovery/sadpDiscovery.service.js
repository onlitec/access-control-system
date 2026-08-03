"use strict";
/**
 * sadpDiscovery.service.ts
 * Protocolo SADP (Hikvision/OEMs como Intelbras) — UDP broadcast porta 37020.
 * Envia pacote XML de descoberta e parseia as respostas dos dispositivos.
 * Útil para encontrar dispositivos ainda sem IP configurado ou em sub-rede diferente.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sadpScan = sadpScan;
const dgram_1 = __importDefault(require("dgram"));
const device_fingerprint_util_1 = require("./device-fingerprint.util");
const SADP_PORT = 37020;
const BROADCAST_ADDR = '255.255.255.255';
const SADP_TIMEOUT_MS = 5000;
/** Pacote de descoberta SADP (formato XML proprietário Hikvision). */
function buildSadpProbe() {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Probe>
  <Uuid>${Date.now()}</Uuid>
  <Types>inquiry</Types>
</Probe>`;
    return Buffer.from(xml, 'utf8');
}
function parseSadpResponse(xml) {
    try {
        // Extração por regex tolerante a variações de namespace
        const get = (tag) => {
            const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<`, 'i'));
            return m?.[1]?.trim() ?? '';
        };
        const ip = get('IPv4Address') || get('IP');
        if (!ip)
            return null;
        const mac = get('MAC');
        const manufacturer = (0, device_fingerprint_util_1.getManufacturerByMac)(mac);
        const model = get('DeviceType') || get('OEMInfo');
        const deviceType = (0, device_fingerprint_util_1.inferDeviceType)([], model, manufacturer);
        return {
            ipAddress: ip,
            macAddress: mac || null,
            protocolType: 'sadp',
            manufacturer: manufacturer,
            model: model || null,
            serialNumber: get('SerialNo') || get('DeviceSN') || null,
            firmwareVersion: get('Firmware') || null,
            deviceType,
            httpPort: parseInt(get('HttpPort') || '80', 10) || 80,
            sdkPort: parseInt(get('DSPVersion') || '8000', 10) || 8000,
            subnetMask: get('Ipv4SubnetMask') || get('SubnetMask') || null,
            gateway: get('IPv4Gateway') || get('Gateway') || null,
            dhcpEnabled: get('DHCP').toLowerCase() === 'true',
            isActivated: get('Activated').toLowerCase() !== 'false',
            isAdded: false,
        };
    }
    catch {
        return null;
    }
}
async function sadpScan(onDevice) {
    return new Promise((resolve) => {
        const socket = dgram_1.default.createSocket({ type: 'udp4', reuseAddr: true });
        const seen = new Set();
        socket.on('error', () => socket.close());
        socket.on('message', async (buf) => {
            const xml = buf.toString('utf8');
            if (!xml.includes('<') || !xml.includes('IPv4Address') && !xml.includes('IP'))
                return;
            const partial = parseSadpResponse(xml);
            if (!partial?.ipAddress)
                return;
            if (seen.has(partial.ipAddress))
                return;
            seen.add(partial.ipAddress);
            onDevice({
                tempId: `sadp-${partial.ipAddress}-${Date.now()}`,
                ...partial,
            });
        });
        socket.bind(SADP_PORT, () => {
            socket.setBroadcast(true);
            try {
                // Também ouvir a própria porta de descoberta
                socket.addMembership('239.255.255.250');
            }
            catch {
                // Sem multicast disponível, continua com broadcast apenas
            }
            const probe = buildSadpProbe();
            socket.send(probe, 0, probe.length, SADP_PORT, BROADCAST_ADDR);
        });
        setTimeout(() => {
            socket.close();
            resolve();
        }, SADP_TIMEOUT_MS);
    });
}
