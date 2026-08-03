"use strict";
/**
 * onvifDiscovery.service.ts
 * WS-Discovery conforme especificação ONVIF:
 * - Envia probe UDP multicast para 239.255.255.250:3702
 * - Parseia respostas ProbeMatch SOAP para extrair XAddrs
 * - Chama GetDeviceInformation no endpoint retornado
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onvifScan = onvifScan;
const dgram_1 = __importDefault(require("dgram"));
const xml2js_1 = require("xml2js");
const node_fetch_1 = __importDefault(require("node-fetch"));
const device_fingerprint_util_1 = require("./device-fingerprint.util");
const MULTICAST_ADDR = '239.255.255.250';
const MULTICAST_PORT = 3702;
const PROBE_TIMEOUT_MS = 5000;
function buildProbeMessage() {
    const msgId = `uuid:${Math.random().toString(36).slice(2)}-${Date.now()}`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope
  xmlns:s="http://www.w3.org/2003/05/soap-envelope"
  xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
  xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">
  <s:Header>
    <a:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action>
    <a:MessageID>${msgId}</a:MessageID>
    <a:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To>
  </s:Header>
  <s:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter tds:Device</d:Types>
    </d:Probe>
  </s:Body>
</s:Envelope>`;
}
function extractText(obj, ...keys) {
    let cur = obj;
    for (const k of keys) {
        if (!cur)
            return '';
        cur = cur[k];
        if (Array.isArray(cur))
            cur = cur[0];
    }
    return typeof cur === 'string' ? cur.trim() : (cur?._ ?? '');
}
async function getDeviceInformation(xAddr) {
    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
  <s:Body><tds:GetDeviceInformation/></s:Body>
</s:Envelope>`;
    try {
        const res = await (0, node_fetch_1.default)(xAddr, {
            method: 'POST',
            headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
            body: soap,
            signal: AbortSignal.timeout(4000),
        });
        if (!res.ok)
            return {};
        const xml = await res.text();
        const parsed = await (0, xml2js_1.parseStringPromise)(xml, { explicitArray: true, ignoreAttrs: false });
        const body = parsed?.['s:Envelope']?.['s:Body']?.[0] ??
            parsed?.['SOAP-ENV:Envelope']?.['SOAP-ENV:Body']?.[0] ?? {};
        const info = body['tds:GetDeviceInformationResponse']?.[0] ??
            body['GetDeviceInformationResponse']?.[0] ?? {};
        return {
            manufacturer: extractText(info, 'tds:Manufacturer') || extractText(info, 'Manufacturer'),
            model: extractText(info, 'tds:Model') || extractText(info, 'Model'),
            firmwareVersion: extractText(info, 'tds:FirmwareVersion') || extractText(info, 'FirmwareVersion'),
            serialNumber: extractText(info, 'tds:SerialNumber') || extractText(info, 'SerialNumber'),
        };
    }
    catch {
        return {};
    }
}
function parseProbeMatch(xmlStr) {
    const results = [];
    // Extrai XAddrs e Types por regex simples (mais tolerante a namespaces variados)
    const xAddrsMatches = [...xmlStr.matchAll(/XAddrs[^>]*>([^<]+)</gi)];
    const typesMatches = [...xmlStr.matchAll(/Types[^>]*>([^<]+)</gi)];
    xAddrsMatches.forEach((m, i) => {
        const rawAddrs = m[1].trim().split(/\s+/);
        const rawTypes = (typesMatches[i]?.['1'] ?? '').trim().split(/\s+/);
        for (const addr of rawAddrs) {
            try {
                const url = new URL(addr);
                results.push({ ip: url.hostname, xAddr: addr, types: rawTypes });
            }
            catch {
                // URL inválida, ignora
            }
        }
    });
    return results;
}
async function onvifScan(onDevice) {
    return new Promise((resolve) => {
        const socket = dgram_1.default.createSocket({ type: 'udp4', reuseAddr: true });
        const seen = new Set();
        const pending = [];
        socket.on('error', () => socket.close());
        socket.on('message', (buf) => {
            const xml = buf.toString('utf8');
            const matches = parseProbeMatch(xml);
            for (const { ip, xAddr, types } of matches) {
                if (seen.has(ip))
                    continue;
                seen.add(ip);
                const p = getDeviceInformation(xAddr).then((info) => {
                    const manufacturer = info.manufacturer || (0, device_fingerprint_util_1.getManufacturerByMac)('') || null;
                    const deviceType = (0, device_fingerprint_util_1.inferDeviceType)(types, info.model, manufacturer);
                    onDevice({
                        tempId: `onvif-${ip}-${Date.now()}`,
                        ipAddress: ip,
                        macAddress: null,
                        protocolType: 'onvif',
                        manufacturer: info.manufacturer || null,
                        model: info.model || null,
                        serialNumber: info.serialNumber || null,
                        firmwareVersion: info.firmwareVersion || null,
                        deviceType,
                        httpPort: 80,
                        sdkPort: 8000,
                        subnetMask: null,
                        gateway: null,
                        dhcpEnabled: false,
                        isActivated: true,
                        isAdded: false,
                    });
                });
                pending.push(p);
            }
        });
        socket.bind(0, () => {
            socket.addMembership(MULTICAST_ADDR);
            const probe = Buffer.from(buildProbeMessage());
            socket.send(probe, 0, probe.length, MULTICAST_PORT, MULTICAST_ADDR);
        });
        setTimeout(async () => {
            socket.close();
            await Promise.allSettled(pending);
            resolve();
        }, PROBE_TIMEOUT_MS);
    });
}
