"use strict";
/**
 * device-fingerprint.util.ts
 * Identifica fabricante e tipo provável de dispositivo a partir do prefixo
 * OUI do endereço MAC (primeiros 3 octetos) e de flags ONVIF/SADP.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getManufacturerByMac = getManufacturerByMac;
exports.inferDeviceType = inferDeviceType;
exports.fingerprint = fingerprint;
exports.probeHttpIdentity = probeHttpIdentity;
/** Mapeamento OUI → fabricante (24 bits, upper-case, sem separadores). */
const OUI_MAP = {
    // Hikvision
    '001F3F': 'Hikvision',
    'C0561B': 'Hikvision',
    'B40C25': 'Hikvision',
    '4876BB': 'Hikvision',
    '28579E': 'Hikvision',
    'D4C4CA': 'Hikvision',
    '68C90E': 'Hikvision',
    'A4146B': 'Hikvision',
    'C0EFAB': 'Hikvision',
    'BC96CF': 'Hikvision',
    '703519': 'Hikvision',
    '5CA358': 'Hikvision',
    'A4D5C2': 'Hikvision', // DS-K1T673 (terminal facial em produção)
    '18688F': 'Hikvision',
    '2C0A2A': 'Hikvision',
    '3CBDD8': 'Hikvision',
    '440049': 'Hikvision',
    '54C4C8': 'Hikvision',
    '58032B': 'Hikvision',
    'ACB9C4': 'Hikvision',
    'BCAD28': 'Hikvision',
    'E0BAAD': 'Hikvision',
    'F84DFC': 'Hikvision',
    // Dahua
    'E0501E': 'Dahua',
    '90D7EB': 'Dahua',
    'F0545D': 'Dahua',
    '3CE4D9': 'Dahua',
    'C45141': 'Dahua',
    '90EFA6': 'Dahua',
    'B09A1A': 'Dahua',
    'A4B806': 'Dahua',
    // Intelbras
    '00236C': 'Intelbras',
    'E4A5C4': 'Intelbras',
    '003087': 'Intelbras',
    'B00C11': 'Intelbras',
    '000C43': 'Intelbras',
    // Control iD
    '94C96D': 'Control iD',
    'D8D5B9': 'Control iD',
    // Axis Communications
    '00408C': 'Axis',
    'ACCC8E': 'Axis',
    'B8A44F': 'Axis',
    // Bosch
    '00107D': 'Bosch',
    '000992': 'Bosch',
    // Uniview (UNV)
    'DC2C6E': 'Uniview',
    '14DDA9': 'Uniview',
    // TP-Link (câmeras Tapo)
    '9884E3': 'TP-Link',
    'D46E5C': 'TP-Link',
    // Reolink
    'EC:2C:4D': 'Reolink',
    // Nice / NICE Automation
    '00236E': 'Nice',
};
/** Normaliza endereço MAC para 6 octetos uppercase sem separadores. */
function normalizeMac(mac) {
    return mac.toUpperCase().replace(/[:\-\.]/g, '');
}
/** Extrai o OUI (primeiros 6 hex chars = 24 bits). */
function extractOui(mac) {
    return normalizeMac(mac).substring(0, 6);
}
/**
 * Identifica o fabricante pelo MAC address.
 * Retorna null se o OUI não estiver na tabela interna.
 */
function getManufacturerByMac(mac) {
    if (!mac)
        return null;
    const oui = extractOui(mac);
    return OUI_MAP[oui] ?? null;
}
/**
 * Infere o tipo de dispositivo a partir de informações disponíveis:
 * - tipos ONVIF (NetworkVideoTransmitter, Device)
 * - modelo do dispositivo
 * - fabricante inferido
 */
function inferDeviceType(onvifTypes, model, manufacturer) {
    const typesLower = onvifTypes.map((t) => t.toLowerCase());
    const modelLower = (model ?? '').toLowerCase();
    const mfr = (manufacturer ?? '').toLowerCase();
    if (typesLower.some((t) => t.includes('networkvideotransmitter'))) {
        if (modelLower.includes('nvr') || modelLower.includes('ds-96') || modelLower.includes('ds-7'))
            return 'nvr';
        if (modelLower.includes('dvr') || modelLower.includes('turbo'))
            return 'dvr';
        return 'camera';
    }
    if (typesLower.some((t) => t.includes('accesscontrol') || t.includes('door')))
        return 'controller';
    if (modelLower.includes('facial') ||
        modelLower.includes('ds-k1t') ||
        modelLower.includes('ds-k2') ||
        (mfr === 'control id' && modelLower.includes('id')))
        return 'facial';
    if (modelLower.includes('intercom') || modelLower.includes('ds-kv') || modelLower.includes('porteiro')) {
        return 'intercom';
    }
    if (modelLower.includes('nvr'))
        return 'nvr';
    if (modelLower.includes('dvr'))
        return 'dvr';
    if (modelLower.includes('cam') || modelLower.includes('ipc') || modelLower.includes('ds-2c') || modelLower.includes('ds-2d')) {
        return 'camera';
    }
    return 'unknown';
}
/**
 * Fingerprint completo a partir do MAC + metadados ONVIF.
 */
function fingerprint(mac, onvifTypes = [], model) {
    const manufacturer = getManufacturerByMac(mac);
    const deviceType = inferDeviceType(onvifTypes, model, manufacturer);
    return { manufacturer, deviceType };
}
const tag = (xml, name) => xml.match(new RegExp(`<${name}>([^<]+)</${name}>`, 'i'))?.[1]?.trim() ?? null;
/**
 * Identifica o equipamento consultando-o pela rede, sem credenciais — a tabela
 * OUI cobre poucos prefixos e falha justamente nos modelos novos. Estratégia:
 *
 *  1. `GET /ISAPI/System/deviceInfo`: equipamentos Hikvision/OEM respondem 401
 *     com `WWW-Authenticate: Digest realm="..."` (o realm costuma trazer o
 *     modelo), ou 200 com o XML completo quando o acesso anônimo está ligado.
 *  2. Header `Server:` da raiz HTTP — vários fabricantes se identificam nele.
 *
 * Best-effort: qualquer falha retorna campos nulos, sem quebrar a varredura.
 */
async function probeHttpIdentity(ip, port, timeoutMs = 2500) {
    const empty = { manufacturer: null, model: null, serialNumber: null, firmwareVersion: null };
    const fetchSafe = async (path) => {
        try {
            return await fetch(`http://${ip}:${port}${path}`, {
                method: 'GET',
                signal: AbortSignal.timeout(timeoutMs),
            });
        }
        catch {
            return null;
        }
    };
    // 1. ISAPI (Hikvision e OEMs)
    const isapi = await fetchSafe('/ISAPI/System/deviceInfo');
    if (isapi) {
        if (isapi.status === 200) {
            const xml = await isapi.text().catch(() => '');
            if (/<DeviceInfo/i.test(xml)) {
                return {
                    manufacturer: tag(xml, 'manufacturer') ?? 'Hikvision',
                    model: tag(xml, 'model'),
                    serialNumber: tag(xml, 'serialNumber'),
                    firmwareVersion: tag(xml, 'firmwareVersion'),
                };
            }
        }
        if (isapi.status === 401) {
            // 401 no endpoint ISAPI já é assinatura do ecossistema Hikvision/OEM.
            // O realm normalmente vem como: Digest realm="DS-K1T673DX-BR", ...
            const realm = isapi.headers.get('www-authenticate')?.match(/realm="([^"]+)"/i)?.[1] ?? null;
            const looksLikeModel = realm && /^[A-Za-z0-9\-_.]+$/.test(realm) && !/^ip camera$/i.test(realm);
            return { ...empty, manufacturer: 'Hikvision', model: looksLikeModel ? realm : null };
        }
    }
    // 2. Header Server na raiz
    const root = await fetchSafe('/');
    const server = root?.headers.get('server') ?? '';
    for (const [needle, name] of [
        ['hikvision', 'Hikvision'], ['dahua', 'Dahua'], ['intelbras', 'Intelbras'],
        ['axis', 'Axis'], ['uniview', 'Uniview'], ['control id', 'Control iD'],
    ]) {
        if (server.toLowerCase().includes(needle))
            return { ...empty, manufacturer: name };
    }
    return empty;
}
