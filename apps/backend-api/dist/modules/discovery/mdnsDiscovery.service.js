"use strict";
/**
 * mdnsDiscovery.service.ts
 * Descoberta via mDNS/Bonjour — escuta serviços _http._tcp e _rtsp._tcp.
 * Útil para terminais faciais (Control iD, Intelbras) e interfones IP.
 * Usa a lib nativa 'multicast-dns' (sem dependência externa pesada).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mdnsScan = mdnsScan;
const dgram_1 = __importDefault(require("dgram"));
const device_fingerprint_util_1 = require("./device-fingerprint.util");
const MDNS_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;
const MDNS_TIMEOUT_MS = 6000;
/** Monta um query mDNS DNS-SD simples para os service types de interesse. */
function buildMdnsQuery(serviceType) {
    // Formato DNS binário simplificado para PTR query
    const parts = serviceType.split('.');
    const buf = [];
    // Transaction ID e flags (query padrão)
    buf.push(0x00, 0x00, 0x00, 0x00);
    // QDCOUNT: 1 question
    buf.push(0x00, 0x01);
    // AN/NS/AR count: 0
    buf.push(0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
    for (const part of parts) {
        buf.push(part.length, ...Buffer.from(part));
    }
    buf.push(0x00); // end of name
    // QTYPE = PTR (12), QCLASS = IN with unicast bit
    buf.push(0x00, 0x0c, 0x80, 0x01);
    return Buffer.from(buf);
}
/** Extrai endereços IP e nomes de serviço de respostas DNS mDNS (parsing mínimo). */
function parseMdnsResponse(buf) {
    try {
        const str = buf.toString('binary');
        // Extrair registros A (tipo 1) — endereços IPv4
        const ips = [];
        let i = 12; // skip header
        while (i < buf.length - 10) {
            const type = buf.readUInt16BE(i + 0);
            const rdLen = buf.readUInt16BE(i + 8);
            if (type === 1 && rdLen === 4) {
                // Registro A: 4 bytes de IP
                const ip = `${buf[i + 10]}.${buf[i + 11]}.${buf[i + 12]}.${buf[i + 13]}`;
                if (!ip.startsWith('169.254') && !ip.startsWith('127.'))
                    ips.push(ip);
            }
            i += 10 + rdLen;
        }
        if (ips.length === 0)
            return null;
        // Nome do serviço extraído como texto do buffer
        const name = str.replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 80);
        return { name, ips };
    }
    catch {
        return null;
    }
}
const SERVICE_TYPES = ['_http._tcp.local', '_rtsp._tcp.local', '_onvif._tcp.local'];
async function mdnsScan(onDevice) {
    return new Promise((resolve) => {
        const socket = dgram_1.default.createSocket({ type: 'udp4', reuseAddr: true });
        const seen = new Set();
        socket.on('error', () => socket.close());
        socket.on('message', (buf) => {
            const parsed = parseMdnsResponse(buf);
            if (!parsed)
                return;
            for (const ip of parsed.ips) {
                if (seen.has(ip))
                    continue;
                seen.add(ip);
                const manufacturer = null;
                const deviceType = (0, device_fingerprint_util_1.inferDeviceType)([], parsed.name, manufacturer);
                onDevice({
                    tempId: `mdns-${ip}-${Date.now()}`,
                    ipAddress: ip,
                    macAddress: null,
                    protocolType: 'mdns',
                    manufacturer,
                    model: null,
                    serialNumber: null,
                    firmwareVersion: null,
                    deviceType,
                    httpPort: 80,
                    sdkPort: 8000,
                    subnetMask: null,
                    gateway: null,
                    dhcpEnabled: false,
                    isActivated: true,
                    isAdded: false,
                });
            }
        });
        socket.bind(MDNS_PORT, '0.0.0.0', () => {
            try {
                socket.addMembership(MDNS_ADDR);
                socket.setMulticastTTL(255);
            }
            catch {
                // mDNS pode não estar disponível na interface — ignora
            }
            for (const svc of SERVICE_TYPES) {
                const query = buildMdnsQuery(svc);
                socket.send(query, MDNS_PORT, MDNS_ADDR);
            }
        });
        setTimeout(() => {
            try {
                socket.close();
            }
            catch { }
            resolve();
        }, MDNS_TIMEOUT_MS);
    });
}
