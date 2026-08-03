"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPtzCommand = sendPtzCommand;
const crypto_1 = require("crypto");
const dgram_1 = require("dgram");
const digest_fetch_utils_1 = require("../utils/digest-fetch.utils");
function ptzChannelNo(channel) {
    const cap = channel.capabilities;
    return cap?.ptzChannelNo ?? channel.channelNo;
}
/**
 * Move (ou para) uma câmera PTZ, despachando por `device.protocol` — mesmo
 * espírito do `buildStreamUrls` em rtsp.ts, mas para comandos em vez de URLs.
 */
async function sendPtzCommand(device, channel, action) {
    const ch = ptzChannelNo(channel);
    const { pan, tilt, zoom } = action === 'stop' ? { pan: 0, tilt: 0, zoom: 0 } : action;
    if (device.protocol === 'hikvision_isapi') {
        return sendHikvisionPtz(device, ch, pan, tilt, zoom);
    }
    if (device.protocol === 'dahua') {
        return sendDahuaPtz(device, ch, pan, tilt, zoom);
    }
    if (device.protocol === 'xiongmai') {
        return sendXiongmaiPtz(device, ch, pan, tilt, zoom);
    }
    return { ok: false, error: `Protocolo "${device.protocol}" não suporta PTZ`, unsupported: true };
}
// ── Hikvision ISAPI: PUT .../PTZCtrl/channels/{ch}/continuous, -100..100 ────
async function sendHikvisionPtz(device, ch, pan, tilt, zoom) {
    const url = `http://${device.ip}:${device.httpPort}/ISAPI/PTZCtrl/channels/${ch}/continuous`;
    const xml = `<PTZData><pan>${pan}</pan><tilt>${tilt}</tilt><zoom>${zoom}</zoom></PTZData>`;
    try {
        const res = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password, 'PUT', xml, { 'Content-Type': 'application/xml' });
        if (!res.ok)
            return { ok: false, error: `ISAPI PTZ respondeu ${res.status}` };
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err.message };
    }
}
// ── Dahua CGI: GET /cgi-bin/ptz.cgi?action=start|stop&channel=&code=&arg1..3 ─
const DAHUA_DIRECTIONS = [
    { code: 'Up', test: (p, t) => t > 0 },
    { code: 'Down', test: (p, t) => t < 0 },
    { code: 'Left', test: (p, t) => p < 0 },
    { code: 'Right', test: (p, t) => p > 0 },
];
async function sendDahuaPtz(device, ch, pan, tilt, zoom) {
    const base = `http://${device.ip}:${device.httpPort}/cgi-bin/ptz.cgi`;
    const isStop = pan === 0 && tilt === 0 && zoom === 0;
    if (isStop) {
        // Dahua não guarda "última direção": manda stop pra todos os códigos de movimento.
        const codes = ['Up', 'Down', 'Left', 'Right', 'ZoomTele', 'ZoomWide'];
        try {
            for (const code of codes) {
                const url = `${base}?action=stop&channel=${ch}&code=${code}&arg1=0&arg2=0&arg3=0`;
                await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password);
            }
            return { ok: true };
        }
        catch (err) {
            return { ok: false, error: err.message };
        }
    }
    const speed = Math.max(1, Math.round(Math.max(Math.abs(pan), Math.abs(tilt)) / 100 * 8)) || 1;
    const direction = DAHUA_DIRECTIONS.find((d) => d.test(pan, tilt));
    const code = direction ? direction.code : (zoom > 0 ? 'ZoomTele' : zoom < 0 ? 'ZoomWide' : null);
    if (!code)
        return { ok: true }; // nada a mover
    const url = `${base}?action=start&channel=${ch}&code=${code}&arg1=${speed}&arg2=${speed}&arg3=0`;
    try {
        const res = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password);
        if (!res.ok)
            return { ok: false, error: `CGI PTZ respondeu ${res.status}` };
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err.message };
    }
}
// ── Xiongmai/XMeye — spike best-effort (protocolo P2P fechado do Yoosee) ────
// A camera-miguel não expõe ONVIF/ISAPI/CGI (só RTSP:554 e uma porta P2P:5000).
// Um pacote de login no formato clássico "NetSDK" (porta 34567) não obteve
// resposta na porta 5000 dela, então tentamos aqui o mesmo handshake JSON
// binário contra a porta 5000 como última tentativa de engenharia reversa.
// Se não houver resposta válida em nenhuma tentativa, retorna unsupported —
// a interface simplesmente não mostra o pad PTZ pra essa câmera.
const XM_LOGIN_CMD = 999; // NET_CTRL_LOGIN clássico do protocolo Xiongmai NetSDK
function xmPacket(cmd, payload) {
    const body = Buffer.from(JSON.stringify(payload) + '\n', 'utf8');
    const head = Buffer.alloc(20);
    head.writeUInt8(0xff, 0);
    head.writeUInt8(0x00, 1);
    head.writeUInt8(0x00, 2);
    head.writeUInt8(0x00, 3);
    head.writeUInt32LE(0, 4); // sessionId (0 no login)
    head.writeUInt32LE(0, 8); // sequence
    head.writeUInt16LE(0, 12);
    head.writeUInt16LE(cmd, 14);
    head.writeUInt32LE(body.length, 16);
    return Buffer.concat([head, body]);
}
async function sendXiongmaiPtz(device, ch, pan, tilt, zoom) {
    const port = 5000;
    const loginPayload = {
        EncryptType: 'MD5',
        LoginType: 'DVRIP-Web',
        PassWord: (0, crypto_1.createHash)('md5').update(device.password).digest('hex').slice(0, 8),
        UserName: device.username,
    };
    return new Promise((resolve) => {
        const sock = (0, dgram_1.createSocket)('udp4');
        const timer = setTimeout(() => {
            sock.close();
            resolve({ ok: false, error: 'Câmera não respondeu ao handshake proprietário (porta 5000/P2P) — PTZ não suportado nesse protocolo fechado.', unsupported: true });
        }, 3000);
        sock.once('message', () => {
            clearTimeout(timer);
            sock.close();
            // Handshake respondeu, mas sem especificação pública do protocolo de
            // sessão/PTZ não dá pra completar o login nem montar o comando de
            // movimento com segurança — reportamos como não suportado por ora.
            resolve({ ok: false, error: 'Câmera respondeu ao handshake, mas o protocolo de sessão/PTZ não está documentado — necessário mais engenharia reversa.', unsupported: true });
        });
        sock.once('error', (err) => {
            clearTimeout(timer);
            sock.close();
            resolve({ ok: false, error: err.message, unsupported: true });
        });
        const packet = xmPacket(XM_LOGIN_CMD, loginPayload);
        sock.send(packet, port, device.ip, (err) => {
            if (err) {
                clearTimeout(timer);
                sock.close();
                resolve({ ok: false, error: err.message, unsupported: true });
            }
        });
    });
}
