"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachTalkServer = attachTalkServer;
const ws_1 = require("ws");
const stream_1 = require("stream");
const node_fetch_1 = __importDefault(require("node-fetch"));
const jsonwebtoken_1 = require("jsonwebtoken");
const unifiedConfig_1 = require("../config/unifiedConfig");
const database_1 = require("../database");
const digest_fetch_utils_1 = require("../utils/digest-fetch.utils");
const TALK_PATH = '/api/vms/talk';
// 1 sessão de fala por canal: falar por cima de outro operador na mesma
// câmera não faz sentido, além de poupar o único alto-falante do canal.
const activeSessions = new Set();
function ptzChannelNo(capabilities, channelNo) {
    const cap = capabilities;
    return cap?.ptzChannelNo ?? channelNo;
}
async function openTwoWayAudio(base, ch, username, password) {
    const res = await (0, digest_fetch_utils_1.digestFetch)(`${base}/ISAPI/System/TwoWayAudio/channels/${ch}/open`, username, password, 'PUT');
    if (!res.ok)
        throw new Error(`open respondeu ${res.status}`);
}
async function closeTwoWayAudio(base, ch, username, password) {
    await (0, digest_fetch_utils_1.digestFetch)(`${base}/ISAPI/System/TwoWayAudio/channels/${ch}/close`, username, password, 'PUT').catch(() => { });
}
/**
 * Abre um PUT autenticado de longa duração para .../audioData e devolve o
 * PassThrough onde os frames G.711 recebidos do navegador (via WebSocket)
 * devem ser escritos. O handshake Digest (probe → 401 → header) acontece
 * UMA vez aqui — não a cada frame, diferente de `digestFetch`.
 */
async function openAudioDataStream(url, username, password) {
    const stream = new stream_1.PassThrough();
    const urlObj = new URL(url);
    const uri = urlObj.pathname + urlObj.search;
    const probe = await (0, node_fetch_1.default)(url, { method: 'PUT', signal: AbortSignal.timeout(5000) });
    const wwwAuth = probe.status === 401 ? (probe.headers.get('www-authenticate') || '') : '';
    const authHeader = (0, digest_fetch_utils_1.computeDigestAuthHeader)(wwwAuth, 'PUT', uri, username, password) || (0, digest_fetch_utils_1.basicAuth)(username, password);
    // dispara o PUT streaming em paralelo; não aguardamos a resposta (a câmera só
    // responde quando o corpo termina, o que só acontece ao fechar a sessão)
    void (0, node_fetch_1.default)(url, {
        method: 'PUT',
        headers: { Authorization: authHeader, 'Content-Type': 'audio/G711' },
        body: stream,
    }).catch(() => { });
    return stream;
}
function attachTalkServer(server) {
    const wss = new ws_1.WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url || '', 'http://localhost');
        if (url.pathname !== TALK_PATH)
            return;
        wss.handleUpgrade(req, socket, head, (ws) => {
            void handleTalkConnection(ws, url);
        });
    });
}
async function handleTalkConnection(ws, url) {
    const token = url.searchParams.get('token') || '';
    const channelId = url.searchParams.get('channelId') || '';
    try {
        (0, jsonwebtoken_1.verify)(token, unifiedConfig_1.config.JWT.SECRET);
    }
    catch {
        ws.close(4401, 'unauthorized');
        return;
    }
    const channel = await database_1.prisma.videoChannel.findUnique({
        where: { id: channelId },
        include: { device: true },
    });
    if (!channel || !channel.enabled || !channel.device.enabled) {
        ws.close(4404, 'channel not found');
        return;
    }
    const cap = channel.capabilities;
    if (!cap?.audioTalk || channel.device.protocol !== 'hikvision_isapi') {
        ws.close(4400, 'audio talk not available for this channel');
        return;
    }
    if (activeSessions.has(channelId)) {
        ws.close(4409, 'talk session already active on this channel');
        return;
    }
    activeSessions.add(channelId);
    const ch = ptzChannelNo(channel.capabilities, channel.channelNo);
    const base = `http://${channel.device.ip}:${channel.device.httpPort}`;
    const { username, password } = channel.device;
    let audioStream = null;
    let closed = false;
    const cleanup = async () => {
        if (closed)
            return;
        closed = true;
        activeSessions.delete(channelId);
        audioStream?.end();
        await closeTwoWayAudio(base, ch, username, password);
    };
    try {
        await openTwoWayAudio(base, ch, username, password);
        audioStream = await openAudioDataStream(`${base}/ISAPI/System/TwoWayAudio/channels/${ch}/audioData`, username, password);
    }
    catch (err) {
        await cleanup();
        ws.close(4502, `camera error: ${String(err.message || err).slice(0, 100)}`);
        return;
    }
    ws.on('message', (data, isBinary) => {
        if (isBinary && audioStream && !closed)
            audioStream.write(data);
    });
    ws.on('close', () => { void cleanup(); });
    ws.on('error', () => { void cleanup(); });
}
