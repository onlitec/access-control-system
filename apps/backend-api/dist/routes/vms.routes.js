"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const node_fetch_1 = __importDefault(require("node-fetch"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const net_1 = __importDefault(require("net"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const database_1 = require("../database");
const unifiedConfig_1 = require("../config/unifiedConfig");
const auth_1 = require("../middleware/auth");
const digest_fetch_utils_1 = require("../utils/digest-fetch.utils");
const EventBusService_1 = require("../services/EventBusService");
const EmailService_1 = require("../services/EmailService");
const rtsp_1 = require("../vms/rtsp");
const ptz_1 = require("../vms/ptz");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const router = (0, express_1.Router)();
const VMS_PORT = Number(process.env.VMS_PORT || 3011);
const VMS_INTERNAL_TOKEN = process.env.VMS_INTERNAL_TOKEN || '';
const VMS_RECORDINGS_DIR = process.env.VMS_RECORDINGS_DIR || path_1.default.join(process.cwd(), 'recordings');
// snapshots do VCA ficam ao lado das gravações (mesmo esquema do vms-service)
const VCA_SNAPSHOT_DIR = path_1.default.join(path_1.default.dirname(VMS_RECORDINGS_DIR), 'vca-snapshots');
const RCLONE_PATH = process.env.RCLONE_PATH || 'rclone';
const RCLONE_CONFIG = process.env.RCLONE_CONFIG || '';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
// Playback server do MediaMTX (loopback) — concatena/recorta as gravações por tempo.
const MTX_PLAYBACK = process.env.VMS_PLAYBACK_URL || 'http://127.0.0.1:9996';
// Teto do clipe de evidência (recodificação com carimbo é cara); 2h por padrão.
const EXPORT_MAX_SECONDS = Number(process.env.VMS_EXPORT_MAX_SECONDS || 7200);
// Fonte do drawtext. No Linux o fontconfig acha uma padrão; no Windows aponte aqui.
const VMS_FONT_PATH = process.env.VMS_FONT_PATH || '';
// ── Helpers ─────────────────────────────────────────────────────────────────
/** Campos de dispositivo expostos nos GETs — NUNCA inclui password. */
const deviceSelect = {
    id: true, name: true, kind: true, protocol: true, ip: true,
    httpPort: true, rtspPort: true, username: true, location: true,
    enabled: true, sdkConfig: true, createdAt: true, updatedAt: true,
};
const channelInclude = { recording: true };
function slugify(name) {
    const slug = name
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || 'cam';
}
async function uniqueStreamPath(base) {
    let candidate = base;
    for (let i = 2;; i++) {
        const existing = await database_1.prisma.videoChannel.findUnique({ where: { streamPath: candidate } });
        if (!existing)
            return candidate;
        candidate = `${base}-${i}`;
    }
}
/** Avisa o onliacesso-vms para re-sincronizar os paths do MediaMTX (best-effort). */
function notifyVmsReload() {
    (0, node_fetch_1.default)(`http://127.0.0.1:${VMS_PORT}/internal/reload`, {
        method: 'POST',
        headers: { 'x-vms-token': VMS_INTERNAL_TOKEN },
        signal: AbortSignal.timeout(10000),
    }).catch(() => { });
}
function serializeSegment(segment) {
    return { ...segment, sizeBytes: Number(segment.sizeBytes) };
}
/**
 * Câmeras que um usuário pode acessar. Retorna `null` quando o usuário tem
 * acesso a TODAS (cameraAccessAll = true, o padrão) — nesse caso não há filtro.
 * Caso contrário, um Set com os channelIds liberados. Base da permissão por
 * câmera (aplicada em /devices, stream-auth, gravações e playback).
 */
async function allowedChannelIds(userId) {
    if (!userId)
        return null;
    const user = await database_1.prisma.user.findUnique({
        where: { id: userId },
        select: { cameraAccessAll: true, cameraAccess: { select: { channelId: true } } },
    }).catch(() => null);
    if (!user || user.cameraAccessAll)
        return null; // null = todas as câmeras
    return new Set(user.cameraAccess.map((c) => c.channelId));
}
/** true se o usuário pode acessar o canal (null = sem restrição). */
function channelAllowed(allowed, channelId) {
    if (allowed === null)
        return true;
    return !!channelId && allowed.has(channelId);
}
// reaproveitado por events.routes.js para filtrar o SSE de alarmes por permissão de câmera
exports.allowedChannelIds = allowedChannelIds;
exports.channelAllowed = channelAllowed;
/**
 * O JWT_SECRET também assina tokens de MORADOR (portal do morador) e de
 * ONBOARDING (link de cadastro, válido 48h) — um `jwt.verify` puro aceitaria
 * os três. Câmeras só podem ser vistas por usuários do sistema (operadores e
 * admins), então aqui exigimos um token com `role` e sem `type` de morador.
 */
function isSystemUserToken(payload) {
    if (!payload || typeof payload !== 'object')
        return false;
    if (payload.type === 'resident' || payload.type === 'onboarding')
        return false;
    return Boolean(payload.role && payload.id);
}
/** Barra tokens de morador/onboarding nas rotas de câmera (usar após authMiddleware). */
function requireSystemUser(req, res, next) {
    if (!isSystemUserToken(req.user)) {
        res.status(403).json({ error: 'Acesso restrito a usuários do sistema' });
        return;
    }
    next();
}
function tcpProbe(ip, port, timeoutMs = 4000) {
    return new Promise((resolve) => {
        const socket = new net_1.default.Socket();
        const done = (ok) => { socket.destroy(); resolve(ok); };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
        socket.connect(port, ip);
    });
}
/** Protocolos aceitos no cadastro — ver buildStreamUrls() em vms/rtsp.ts. */
const VALID_PROTOCOLS = ['hikvision_isapi', 'xiongmai', 'dahua', 'onvif', 'rtsp'];
async function testDevice(protocol, ip, httpPort, rtspPort, username, password) {
    if (protocol === 'hikvision_isapi') {
        try {
            const res = await (0, digest_fetch_utils_1.digestFetch)(`http://${ip}:${httpPort}/ISAPI/System/deviceInfo`, username, password);
            return res.ok || res.status === 401;
        }
        catch {
            return false;
        }
    }
    // xiongmai/dahua/onvif/rtsp: alcance TCP na porta RTSP já indica que o
    // equipamento está lá (a URL real é validada pelo MediaMTX ao publicar)
    return tcpProbe(ip, rtspPort);
}
// ═════════════════════════════════════════════════════════════════════════════
// Endpoints SEM authMiddleware (chamados pelo MediaMTX / vms-service / <video>)
// ═════════════════════════════════════════════════════════════════════════════
// ── POST /api/vms/stream-auth — callback de autenticação do MediaMTX ─────────
// O MediaMTX envia {user, password, ip, action, path, protocol, query} e espera
// 2xx (permitido) ou 401. O player passa o JWT como query (?jwt=...), pois
// <video>/hls.js não enviam header Authorization.
router.post('/stream-auth', async (req, res) => {
    const { query, password, path: reqPath } = (req.body ?? {});
    const params = new URLSearchParams(String(query || ''));
    const token = params.get('jwt') || params.get('token') || '';
    if (VMS_INTERNAL_TOKEN && (token === VMS_INTERNAL_TOKEN || password === VMS_INTERNAL_TOKEN)) {
        res.status(200).json({ ok: true });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, unifiedConfig_1.config.JWT.SECRET);
        // morador/onboarding não podem ver câmeras, mesmo com JWT válido
        if (!isSystemUserToken(payload)) {
            res.status(401).json({ error: 'não autorizado' });
            return;
        }
        // ENFORCE permissão por câmera: o path pedido é o streamPath (ou <path>-sub).
        // Esta é a trava real — sem ela o usuário poderia abrir a URL do stream direto.
        const allowed = await allowedChannelIds(payload.id);
        if (allowed !== null) {
            const base = String(reqPath || '').replace(/-sub$/, '');
            const channel = base
                ? await database_1.prisma.videoChannel.findUnique({ where: { streamPath: base }, select: { id: true } }).catch(() => null)
                : null;
            if (!channelAllowed(allowed, channel?.id)) {
                res.status(401).json({ error: 'sem permissão para esta câmera' });
                return;
            }
        }
        res.status(200).json({ ok: true });
    }
    catch {
        res.status(401).json({ error: 'não autorizado' });
    }
});
// ── POST /api/vms/internal/event — vms-service repassa eventos (motion) ──────
router.post('/internal/event', async (req, res) => {
    if (!VMS_INTERNAL_TOKEN || req.headers['x-vms-token'] !== VMS_INTERNAL_TOKEN) {
        res.status(401).json({ error: 'token interno inválido' });
        return;
    }
    try {
        const { type, label, channelId, channelName, deviceName, snapshotUrl, score, videoChannelId, streamPath, videoChannelName, popup, recordSeconds } = req.body ?? {};
        await (0, EventBusService_1.emitEvent)({
            personName: `${label || 'Evento de câmera'} — ${channelName || 'câmera'}`,
            personType: 'system',
            category: 'alarm',
            deviceName: deviceName ?? null,
            eventType: String(type || 'vms'),
            source: 'vms',
            status: 'authorized',
            metadata: {
                channelId: channelId ?? null,
                ...(channelName ? { channelName } : {}),
                ...(snapshotUrl ? { snapshotUrl } : {}),
                ...(score != null ? { score } : {}),
                // câmera de vídeo do evento (própria ou vinculada) + popup
                ...(videoChannelId ? { videoChannelId } : {}),
                ...(streamPath ? { streamPath } : {}),
                ...(videoChannelName ? { videoChannelName } : {}),
                ...(popup ? { popup: true } : {}),
                ...(recordSeconds != null ? { recordSeconds: Number(recordSeconds) } : {}),
            },
        });
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/vms/internal/notify — notificação externa de um disparo VCA ────
// Chamado pelo vms-service (Actions.notify). Envia e-mail com o snapshot anexo
// aos destinatários da regra. WhatsApp/SMS ficam como TODO (targets.phones).
router.post('/internal/notify', async (req, res) => {
    if (!VMS_INTERNAL_TOKEN || req.headers['x-vms-token'] !== VMS_INTERNAL_TOKEN) {
        res.status(401).json({ error: 'token interno inválido' });
        return;
    }
    try {
        const { channelName, ruleName, className, snapshotUrl, targets } = req.body ?? {};
        const emails = Array.isArray(targets?.emails) ? targets.emails.filter(Boolean) : [];
        if (emails.length === 0) {
            res.json({ success: true, skipped: 'sem destinatários' });
            return;
        }
        if (!(await EmailService_1.EmailService.isConfigured())) {
            res.json({ success: true, skipped: 'SMTP não configurado' });
            return;
        }
        // lê o snapshot do disco (a URL é /api/vms/vca-snapshots/<ch>/<file>)
        let image;
        const m = String(snapshotUrl || '').match(/vca-snapshots\/([A-Za-z0-9_-]+)\/([0-9]+\.jpg)$/);
        if (m) {
            try {
                image = await fs_1.promises.readFile(path_1.default.join(VCA_SNAPSHOT_DIR, m[1], m[2]));
            }
            catch { /* segue sem imagem */ }
        }
        await EmailService_1.EmailService.sendVcaAlert(emails.join(','), {
            title: `${ruleName || 'Detecção'}${className ? ` — ${className}` : ''}`,
            cameraName: channelName || 'câmera',
            when: new Date(),
            image,
        });
        res.json({ success: true, sent: emails.length });
    }
    catch (err) {
        console.error('[VMS] notify falhou:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/vms/recordings/:id/file — mp4 com Range (auth via ?token=) ──────
router.get('/recordings/:id/file', async (req, res) => {
    const token = req.query.token || '';
    if (!token) {
        res.status(401).end();
        return;
    }
    let filePayload;
    try {
        filePayload = jsonwebtoken_1.default.verify(token, unifiedConfig_1.config.JWT.SECRET);
        if (!isSystemUserToken(filePayload)) {
            res.status(403).end();
            return;
        }
    }
    catch {
        res.status(401).end();
        return;
    }
    const segment = await database_1.prisma.recordingSegment.findUnique({ where: { id: req.params.id } }).catch(() => null);
    if (!segment || segment.status === 'deleted_local') {
        res.status(404).json({ error: 'Gravação não encontrada' });
        return;
    }
    const fileAllowed = await allowedChannelIds(filePayload.id);
    if (!channelAllowed(fileAllowed, segment.channelId)) {
        res.status(403).json({ error: 'sem permissão para esta câmera' });
        return;
    }
    const absFile = path_1.default.join(VMS_RECORDINGS_DIR, segment.filePath);
    let stat;
    try {
        stat = await fs_1.promises.stat(absFile);
    }
    catch {
        res.status(404).json({ error: 'Arquivo da gravação não está mais no disco' });
        return;
    }
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.query.download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${path_1.default.basename(segment.filePath)}"`);
    }
    const range = req.headers.range;
    const m = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (m && (m[1] || m[2])) {
        const start = m[1] ? parseInt(m[1], 10) : Math.max(0, stat.size - parseInt(m[2], 10));
        const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
        if (start >= stat.size || start > end) {
            res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
            return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        res.setHeader('Content-Length', end - start + 1);
        (0, fs_1.createReadStream)(absFile, { start, end }).pipe(res);
    }
    else {
        res.setHeader('Content-Length', stat.size);
        (0, fs_1.createReadStream)(absFile).pipe(res);
    }
});
// ── GET /api/vms/vca-snapshots/:channelId/:file — JPEG do evento VCA (auth ?token=) ──
// Servido por token na query porque carrega em <img> no feed (sem header Authorization).
router.get('/vca-snapshots/:channelId/:file', async (req, res) => {
    const token = req.query.token || '';
    try {
        const payload = jsonwebtoken_1.default.verify(token, unifiedConfig_1.config.JWT.SECRET);
        if (!isSystemUserToken(payload)) {
            res.status(403).end();
            return;
        }
    }
    catch {
        res.status(401).end();
        return;
    }
    // trava contra path traversal: só nomes simples
    const { channelId, file } = req.params;
    if (!/^[A-Za-z0-9_-]+$/.test(channelId) || !/^[0-9]+\.jpg$/.test(file)) {
        res.status(400).end();
        return;
    }
    const abs = path_1.default.join(VCA_SNAPSHOT_DIR, channelId, file);
    try {
        await fs_1.promises.stat(abs);
    }
    catch {
        res.status(404).end();
        return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    (0, fs_1.createReadStream)(abs).pipe(res);
});
// ── Playback (reprodução contínua + evidência) ───────────────────────────────
// Motor: playback server do MediaMTX (/get concatena os segmentos fMP4 e recorta
// por [start, duration]). Auth por ?token= (carregado em <video>/<a download>,
// sem header Authorization) — mesmo molde de /recordings/:id/file.
/** Valida o token da query; devolve o payload ou null (já responde 401/403). */
function authPlaybackToken(req, res) {
    const token = req.query.token || '';
    if (!token) {
        res.status(401).end();
        return null;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, unifiedConfig_1.config.JWT.SECRET);
        if (!isSystemUserToken(payload)) {
            res.status(403).end();
            return null;
        }
        return payload;
    }
    catch {
        res.status(401).end();
        return null;
    }
}
/**
 * Resolve o nome do canal e o **path onde a gravação foi feita** no MediaMTX
 * (sub-stream quando `useSubStream`, senão o principal) — é esse path que o
 * playback server conhece; o streamPath principal pode não ter gravações.
 */
async function resolvePlaybackChannel(channelId) {
    if (!channelId)
        return null;
    const ch = await database_1.prisma.videoChannel.findUnique({
        where: { id: channelId },
        select: { id: true, name: true, streamPath: true, recording: { select: { useSubStream: true } } },
    });
    if (!ch)
        return null;
    const recordPath = ch.recording?.useSubStream ? (0, rtsp_1.subPathName)(ch.streamPath) : ch.streamPath;
    return { id: ch.id, name: ch.name, recordPath };
}
function playbackGetUrl(streamPath, startIso, durationSec, format) {
    const q = new URLSearchParams({ path: streamPath, start: startIso, duration: String(durationSec), format });
    return `${MTX_PLAYBACK}/get?${q.toString()}`;
}
// ── GET /api/vms/playback/stream — MP4 contínuo a partir de um instante ──────
// Faz proxy do /get (stream copy, sem recodificar). O player pede uma janela a
// partir do ponto clicado; ao chegar num gap, o /get devolve menos e o front
// avança para o próximo trecho (auto-advance pela linha do tempo).
router.get('/playback/stream', async (req, res) => {
    const streamPayload = authPlaybackToken(req, res);
    if (!streamPayload)
        return;
    const { channelId, start } = req.query;
    const duration = Math.min(Math.max(Number(req.query.duration) || 3600, 1), EXPORT_MAX_SECONDS);
    if (!channelId || !start) {
        res.status(400).json({ error: 'channelId e start são obrigatórios' });
        return;
    }
    if (!channelAllowed(await allowedChannelIds(streamPayload.id), channelId)) {
        res.status(403).json({ error: 'sem permissão para esta câmera' });
        return;
    }
    const channel = await resolvePlaybackChannel(channelId);
    if (!channel) {
        res.status(404).json({ error: 'Canal não encontrado' });
        return;
    }
    try {
        const upstream = await (0, node_fetch_1.default)(playbackGetUrl(channel.recordPath, start, duration, 'mp4'));
        if (!upstream.ok || !upstream.body) {
            // 500 aqui geralmente é "não há gravação nesse instante" (gap)
            res.status(upstream.status === 500 ? 404 : upstream.status).json({ error: 'Sem gravação neste trecho' });
            return;
        }
        res.status(200);
        res.setHeader('Content-Type', 'video/mp4');
        if (req.query.download === '1') {
            const stamp = new Date(start).toISOString().replace(/[:.]/g, '-').slice(0, 19);
            res.setHeader('Content-Disposition', `attachment; filename="${slugify(channel.name)}_${stamp}.mp4"`);
        }
        const cl = upstream.headers.get('content-length');
        if (cl)
            res.setHeader('Content-Length', cl);
        upstream.body.pipe(res);
        upstream.body.on('error', () => res.destroy());
        res.on('close', () => { try {
            upstream.body?.destroy?.();
        }
        catch { /* noop */ } });
    }
    catch (err) {
        if (!res.headersSent)
            res.status(502).json({ error: `Playback indisponível: ${err.message}` });
    }
});
// ── GET /api/vms/playback/export — clipe de EVIDÊNCIA com carimbo queimado ────
// ffmpeg lê direto do /get do MediaMTX (recorte exato dentro do trecho contínuo)
// e queima data/hora que avança + nome da câmera. Recodifica (drawtext exige).
router.get('/playback/export', async (req, res) => {
    const exportPayload = authPlaybackToken(req, res);
    if (!exportPayload)
        return;
    const { channelId, start } = req.query;
    const duration = Number(req.query.duration) || 0;
    if (!channelId || !start || duration <= 0) {
        res.status(400).json({ error: 'channelId, start e duration são obrigatórios' });
        return;
    }
    if (duration > EXPORT_MAX_SECONDS) {
        res.status(400).json({ error: `Trecho muito longo (máx ${Math.round(EXPORT_MAX_SECONDS / 60)} min)` });
        return;
    }
    if (!channelAllowed(await allowedChannelIds(exportPayload.id), channelId)) {
        res.status(403).json({ error: 'sem permissão para esta câmera' });
        return;
    }
    const channel = await resolvePlaybackChannel(channelId);
    if (!channel) {
        res.status(404).json({ error: 'Canal não encontrado' });
        return;
    }
    const startEpoch = Math.floor(new Date(start).getTime() / 1000);
    if (!Number.isFinite(startEpoch)) {
        res.status(400).json({ error: 'start inválido' });
        return;
    }
    // texto do overlay: nome da câmera (topo) + relógio que avança (base). Escapa
    // caracteres especiais do drawtext no nome da câmera.
    const safeName = channel.name.replace(/[\\:']/g, ' ').replace(/[%{}]/g, '');
    // fontfile no filtergraph: barras normais e o ":" do drive escapado como "\\:"
    // (dois níveis de escape do ffmpeg no Windows). No Linux o path não tem ":",
    // então o replace é inócuo. Sem aspas — elas não protegem o ":" do drive.
    const fontOpt = VMS_FONT_PATH
        ? `fontfile=${VMS_FONT_PATH.replace(/\\/g, '/').replace(/:/g, '\\\\:')}:`
        : '';
    const box = `:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=6`;
    const vf = [
        `drawtext=${fontOpt}text='${safeName}':x=12:y=12${box}`,
        `drawtext=${fontOpt}text='%{pts\\:localtime\\:${startEpoch}}':x=12:y=h-34${box}`,
    ].join(',');
    const inputUrl = playbackGetUrl(channel.recordPath, start, Math.ceil(duration), 'mp4');
    const stamp = new Date(start).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${slugify(channel.name)}_${stamp}_${Math.round(duration)}s.mp4`;
    const args = [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-fflags', '+discardcorrupt',
        '-i', inputUrl,
        '-t', String(duration),
        '-vf', vf,
        '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
        '-an',
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        '-f', 'mp4', 'pipe:1',
    ];
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const ff = (0, child_process_1.spawn)(FFMPEG, args, { windowsHide: true });
    ff.stdout.pipe(res);
    let errBuf = '';
    ff.stderr.on('data', (d) => { errBuf += d.toString().slice(0, 2000); });
    ff.on('error', (err) => { if (!res.headersSent)
        res.status(500).json({ error: `ffmpeg falhou: ${err.message}` }); });
    ff.on('close', (code) => {
        if (code !== 0 && !res.headersSent)
            res.status(500).json({ error: `Falha ao gerar evidência: ${errBuf}` });
        else
            res.end();
    });
    // se o cliente cancelar o download, mata o ffmpeg
    res.on('close', () => { if (!ff.killed)
        ff.kill('SIGKILL'); });
});
// ═════════════════════════════════════════════════════════════════════════════
// Endpoints autenticados (usuário do sistema; mutações exigem admin)
// requireSystemUser barra tokens de morador/onboarding, que são assinados com
// o MESMO segredo e passariam pelo authMiddleware.
// ═════════════════════════════════════════════════════════════════════════════
router.use(auth_1.authMiddleware);
router.use(requireSystemUser);
// ── GET /api/vms/devices ─────────────────────────────────────────────────────
router.get('/devices', async (req, res) => {
    try {
        const devices = await database_1.prisma.videoDevice.findMany({
            select: { ...deviceSelect, channels: { include: channelInclude, orderBy: { channelNo: 'asc' } } },
            orderBy: { name: 'asc' },
        });
        // filtra por permissão de câmera do usuário; dispositivos sem canal liberado somem
        const allowed = await allowedChannelIds(req.user?.id);
        const filtered = allowed === null ? devices : devices
            .map((d) => ({ ...d, channels: d.channels.filter((c) => allowed.has(c.id)) }))
            .filter((d) => d.channels.length > 0);
        res.json({ devices: filtered });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── Permissão de câmera por usuário (admin) ─────────────────────────────────
// TODAS as câmeras para o seletor do admin — ignora a restrição do próprio
// admin, pois quem gerencia precisa enxergar todas para atribuir.
router.get('/all-channels', auth_1.adminMiddleware, async (_req, res) => {
    try {
        const devices = await database_1.prisma.videoDevice.findMany({
            select: { name: true, channels: { select: { id: true, name: true }, orderBy: { channelNo: 'asc' } } },
            orderBy: { name: 'asc' },
        });
        const channels = devices.flatMap((d) => d.channels.map((c) => ({ id: c.id, name: c.name, deviceName: d.name })));
        res.json({ channels });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/users/:id/cameras', auth_1.adminMiddleware, async (req, res) => {
    try {
        const user = await database_1.prisma.user.findUnique({
            where: { id: req.params.id },
            select: { cameraAccessAll: true, cameraAccess: { select: { channelId: true } } },
        });
        if (!user) {
            res.status(404).json({ error: 'Usuário não encontrado' });
            return;
        }
        res.json({ all: user.cameraAccessAll, channelIds: user.cameraAccess.map((c) => c.channelId) });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.put('/users/:id/cameras', auth_1.adminMiddleware, async (req, res) => {
    try {
        const userId = req.params.id;
        const all = req.body?.all !== false; // padrão: todas
        const channelIds = Array.isArray(req.body?.channelIds)
            ? req.body.channelIds.filter((x) => typeof x === 'string') : [];
        const exists = await database_1.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!exists) {
            res.status(404).json({ error: 'Usuário não encontrado' });
            return;
        }
        await database_1.prisma.$transaction([
            database_1.prisma.user.update({ where: { id: userId }, data: { cameraAccessAll: all } }),
            database_1.prisma.userCameraAccess.deleteMany({ where: { userId } }),
            ...(!all && channelIds.length
                ? [database_1.prisma.userCameraAccess.createMany({ data: channelIds.map((channelId) => ({ userId, channelId })), skipDuplicates: true })]
                : []),
        ]);
        res.json({ success: true, all, channelIds: all ? [] : channelIds });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/vms/devices (admin only) ───────────────────────────────────────
router.post('/devices', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, kind, protocol, ip, httpPort, rtspPort, username, password, location, sdkConfig, rtspUrlMain, rtspUrlSub } = req.body;
        if (!name || !ip || !username || !password) {
            res.status(400).json({ error: 'nome, ip, username e password são obrigatórios' });
            return;
        }
        if (kind && !['nvr', 'dvr', 'ip_camera'].includes(kind)) {
            res.status(400).json({ error: 'kind deve ser "nvr", "dvr" ou "ip_camera"' });
            return;
        }
        if (protocol && !VALID_PROTOCOLS.includes(protocol)) {
            res.status(400).json({ error: `protocol deve ser um de: ${VALID_PROTOCOLS.join(', ')}` });
            return;
        }
        const device = await database_1.prisma.videoDevice.create({
            data: {
                name, ip, username, password,
                kind: kind ?? 'ip_camera',
                protocol: protocol ?? 'hikvision_isapi',
                httpPort: httpPort ?? 80,
                rtspPort: rtspPort ?? 554,
                location: location ?? null,
                sdkConfig: sdkConfig ?? null,
            },
        });
        // Câmera IP = sempre 1 canal implícito, criado no cadastro
        if (device.kind === 'ip_camera') {
            await database_1.prisma.videoChannel.create({
                data: {
                    deviceId: device.id,
                    channelNo: 1,
                    name,
                    streamPath: await uniqueStreamPath(slugify(name)),
                    rtspUrlMain: rtspUrlMain ?? null,
                    rtspUrlSub: rtspUrlSub ?? null,
                },
            });
        }
        const full = await database_1.prisma.videoDevice.findUnique({
            where: { id: device.id },
            select: { ...deviceSelect, channels: { include: channelInclude, orderBy: { channelNo: 'asc' } } },
        });
        notifyVmsReload();
        res.status(201).json({ success: true, device: full });
    }
    catch (err) {
        res.status(err.code === 'P2002' ? 409 : 500).json({ error: err.message });
    }
});
// ── PUT /api/vms/devices/:id (admin only) ────────────────────────────────────
router.put('/devices/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, kind, protocol, ip, httpPort, rtspPort, username, password, location, enabled, sdkConfig } = req.body;
        const device = await database_1.prisma.videoDevice.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(kind !== undefined && { kind }),
                ...(protocol !== undefined && { protocol }),
                ...(ip !== undefined && { ip }),
                ...(httpPort !== undefined && { httpPort }),
                ...(rtspPort !== undefined && { rtspPort }),
                ...(username !== undefined && { username }),
                ...(password !== undefined && password !== '' && { password }),
                ...(location !== undefined && { location }),
                ...(enabled !== undefined && { enabled }),
                ...(sdkConfig !== undefined && { sdkConfig }),
            },
            select: { ...deviceSelect, channels: { include: channelInclude, orderBy: { channelNo: 'asc' } } },
        });
        notifyVmsReload();
        res.json({ success: true, device });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── DELETE /api/vms/devices/:id (admin only) ─────────────────────────────────
router.delete('/devices/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        await database_1.prisma.videoDevice.delete({ where: { id: req.params.id } });
        notifyVmsReload();
        res.json({ success: true });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── GET /api/vms/devices/:id/ping ────────────────────────────────────────────
router.get('/devices/:id/ping', async (req, res) => {
    try {
        const device = await database_1.prisma.videoDevice.findUnique({ where: { id: req.params.id } });
        if (!device) {
            res.status(404).json({ error: 'Dispositivo não encontrado' });
            return;
        }
        const online = await testDevice(device.protocol, device.ip, device.httpPort, device.rtspPort, device.username, device.password);
        res.json({ online });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/vms/test — testa conectividade antes de cadastrar ─────────────
router.post('/test', async (req, res) => {
    try {
        const { protocol, ip, httpPort, rtspPort, username, password } = req.body;
        if (!ip) {
            res.status(400).json({ error: 'ip é obrigatório' });
            return;
        }
        const reachable = await testDevice(protocol ?? 'hikvision_isapi', ip, httpPort ?? 80, rtspPort ?? 554, username ?? '', password ?? '');
        res.json({ reachable });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/vms/devices/:id/discover (admin) — popula canais do NVR/DVR ────
router.post('/devices/:id/discover', auth_1.adminMiddleware, async (req, res) => {
    try {
        const device = await database_1.prisma.videoDevice.findUnique({
            where: { id: req.params.id },
            include: { channels: true },
        });
        if (!device) {
            res.status(404).json({ error: 'Dispositivo não encontrado' });
            return;
        }
        if (device.protocol !== 'hikvision_isapi') {
            res.status(400).json({ error: 'Descoberta automática disponível apenas para dispositivos Hikvision (ISAPI); cadastre os canais manualmente com a URL RTSP' });
            return;
        }
        // NVR/DVR: canais analógicos/IP proxy; câmera IP: entradas de vídeo diretas
        const base = `http://${device.ip}:${device.httpPort}`;
        const endpoints = ['/ISAPI/ContentMgmt/InputProxy/channels', '/ISAPI/System/Video/inputs/channels'];
        const found = [];
        for (const endpoint of endpoints) {
            try {
                const response = await (0, digest_fetch_utils_1.digestFetch)(`${base}${endpoint}`, device.username, device.password);
                if (!response.ok)
                    continue;
                const xml = await response.text();
                const blocks = xml.match(/<(?:InputProxyChannel|VideoInputChannel)>[\s\S]*?<\/(?:InputProxyChannel|VideoInputChannel)>/g) || [];
                for (const block of blocks) {
                    const id = Number(block.match(/<id>(\d+)<\/id>/)?.[1] ?? NaN);
                    if (!Number.isFinite(id))
                        continue;
                    const chName = block.match(/<name>([^<]*)<\/name>/)?.[1]?.trim() || `Canal ${id}`;
                    found.push({ channelNo: id, name: chName });
                }
                if (found.length > 0)
                    break;
            }
            catch { /* tenta o próximo endpoint */ }
        }
        if (found.length === 0) {
            res.status(502).json({ error: 'Nenhum canal retornado pelo dispositivo (verifique credenciais/firmware)' });
            return;
        }
        const existing = new Set(device.channels.map((c) => c.channelNo));
        let created = 0;
        for (const ch of found) {
            if (existing.has(ch.channelNo))
                continue;
            await database_1.prisma.videoChannel.create({
                data: {
                    deviceId: device.id,
                    channelNo: ch.channelNo,
                    name: ch.name,
                    streamPath: await uniqueStreamPath(slugify(`${device.name}-${ch.name}`)),
                },
            });
            created += 1;
        }
        const full = await database_1.prisma.videoDevice.findUnique({
            where: { id: device.id },
            select: { ...deviceSelect, channels: { include: channelInclude, orderBy: { channelNo: 'asc' } } },
        });
        notifyVmsReload();
        res.json({ success: true, discovered: found.length, created, device: full });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/vms/devices/:id/channels (admin only) ──────────────────────────
router.post('/devices/:id/channels', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { channelNo, name, rtspUrlMain, rtspUrlSub, capabilities } = req.body;
        if (channelNo === undefined || !name) {
            res.status(400).json({ error: 'channelNo e name são obrigatórios' });
            return;
        }
        const channel = await database_1.prisma.videoChannel.create({
            data: {
                deviceId: req.params.id,
                channelNo: Number(channelNo),
                name,
                streamPath: await uniqueStreamPath(slugify(name)),
                rtspUrlMain: rtspUrlMain ?? null,
                rtspUrlSub: rtspUrlSub ?? null,
                capabilities: capabilities ?? undefined,
            },
            include: channelInclude,
        });
        notifyVmsReload();
        res.status(201).json({ success: true, channel });
    }
    catch (err) {
        if (err.code === 'P2002') {
            res.status(409).json({ error: 'Já existe um canal com esse número neste dispositivo. Câmeras IP têm o canal 1 criado automaticamente no cadastro.' });
            return;
        }
        res.status(500).json({ error: err.message });
    }
});
// ── PUT /api/vms/channels/:id (admin only) ───────────────────────────────────
router.put('/channels/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, channelNo, rtspUrlMain, rtspUrlSub, enabled, capabilities } = req.body;
        const channel = await database_1.prisma.videoChannel.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(channelNo !== undefined && { channelNo: Number(channelNo) }),
                ...(rtspUrlMain !== undefined && { rtspUrlMain }),
                ...(rtspUrlSub !== undefined && { rtspUrlSub }),
                ...(enabled !== undefined && { enabled }),
                ...(capabilities !== undefined && { capabilities }),
            },
            include: channelInclude,
        });
        notifyVmsReload();
        res.json({ success: true, channel });
    }
    catch (err) {
        if (err.code === 'P2002') {
            res.status(409).json({ error: 'Já existe um canal com esse número neste dispositivo.' });
            return;
        }
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── DELETE /api/vms/channels/:id (admin only) ────────────────────────────────
router.delete('/channels/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        await database_1.prisma.videoChannel.delete({ where: { id: req.params.id } });
        notifyVmsReload();
        res.json({ success: true });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── PUT /api/vms/channels/:id/recording (admin) — config de gravação ─────────
// Tipos de evento aceitos em mode=motion (subset de VCA_EVENT_LABELS do watcher)
const VALID_EVENT_TYPES = new Set([
    'vmd', 'linedetection', 'fielddetection', 'regionentrance', 'regionexiting',
    'loitering', 'unattendedbaggage', 'attendedbaggage', 'facedetection',
    'audioexception', 'scenechangedetection',
]);
/**
 * Liga a detecção de movimento (VMD) na própria câmera via ISAPI — sem isso o
 * alertStream nunca emite o evento. Best-effort: retorna true/false/null
 * (null = não suportado/inacessível; eventos VCA exigem configurar
 * linhas/áreas na interface web da câmera, não dá para ativar daqui).
 */
async function enableMotionDetection(device, channelNo) {
    const url = `http://${device.ip}:${device.httpPort}/ISAPI/System/Video/inputs/channels/${channelNo}/motionDetection`;
    try {
        const current = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password);
        if (!current.ok)
            return null;
        const xml = await current.text();
        if (/<enabled>\s*true\s*<\/enabled>/i.test(xml))
            return true;
        const updated = xml.replace(/<enabled>\s*false\s*<\/enabled>/i, '<enabled>true</enabled>');
        const put = await (0, digest_fetch_utils_1.digestFetch)(url, device.username, device.password, 'PUT', updated, { 'Content-Type': 'application/xml' });
        return put.ok;
    }
    catch {
        return null;
    }
}
router.put('/channels/:id/recording', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { mode, schedule, postEventSec, retentionDays, useSubStream, eventTypes, segmentMinutes } = req.body;
        if (mode && !['off', 'continuous', 'scheduled', 'motion'].includes(mode)) {
            res.status(400).json({ error: 'mode deve ser "off", "continuous", "scheduled" ou "motion"' });
            return;
        }
        // ciclo de gravação: duração de cada arquivo (1 min a 2 h)
        if (segmentMinutes !== undefined && (Number(segmentMinutes) < 1 || Number(segmentMinutes) > 120)) {
            res.status(400).json({ error: 'segmentMinutes deve estar entre 1 e 120 minutos' });
            return;
        }
        let cleanEventTypes;
        if (eventTypes !== undefined) {
            if (eventTypes === null) {
                cleanEventTypes = null;
            }
            else if (Array.isArray(eventTypes)) {
                cleanEventTypes = eventTypes.map((t) => String(t).toLowerCase()).filter((t) => VALID_EVENT_TYPES.has(t));
                if (cleanEventTypes.length === 0)
                    cleanEventTypes = ['vmd'];
            }
            else {
                res.status(400).json({ error: 'eventTypes deve ser uma lista de tipos de evento' });
                return;
            }
        }
        const channel = await database_1.prisma.videoChannel.findUnique({
            where: { id: req.params.id },
            include: { device: true },
        });
        if (!channel) {
            res.status(404).json({ error: 'Canal não encontrado' });
            return;
        }
        const recording = await database_1.prisma.videoRecordingConfig.upsert({
            where: { channelId: channel.id },
            create: {
                channelId: channel.id,
                mode: mode ?? 'off',
                schedule: schedule ?? null,
                eventTypes: cleanEventTypes ?? client_1.Prisma.DbNull,
                postEventSec: postEventSec ?? 30,
                retentionDays: retentionDays ?? 7,
                useSubStream: useSubStream ?? false,
                segmentMinutes: segmentMinutes !== undefined ? Number(segmentMinutes) : 10,
            },
            update: {
                ...(mode !== undefined && { mode }),
                ...(schedule !== undefined && { schedule }),
                ...(cleanEventTypes !== undefined && { eventTypes: cleanEventTypes ?? client_1.Prisma.DbNull }),
                ...(postEventSec !== undefined && { postEventSec: Number(postEventSec) }),
                ...(retentionDays !== undefined && { retentionDays: Number(retentionDays) }),
                ...(useSubStream !== undefined && { useSubStream }),
                ...(segmentMinutes !== undefined && { segmentMinutes: Number(segmentMinutes) }),
            },
        });
        // Gravação por evento com movimento: garante o VMD ligado na câmera
        let motionDetection = null;
        const wantsVmd = recording.mode === 'motion'
            && (!Array.isArray(recording.eventTypes) || recording.eventTypes.includes('vmd'));
        if (wantsVmd && channel.device.protocol === 'hikvision_isapi') {
            motionDetection = await enableMotionDetection(channel.device, channel.channelNo);
        }
        notifyVmsReload();
        res.json({ success: true, recording, motionDetection });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/vms/channels/:id/vca — config de VCA por software ────────────────
router.get('/channels/:id/vca', async (req, res) => {
    try {
        const vca = await database_1.prisma.videoVcaConfig.findUnique({ where: { channelId: req.params.id } });
        res.json({ vca: vca ?? null });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── PUT /api/vms/channels/:id/vca (admin) — regras de VCA por software ────────
const VCA_RULE_TYPES = new Set(['motion_zone', 'line_cross', 'intrusion']);
const VCA_ACTIONS = new Set(['record', 'alert', 'notify', 'snapshot']);
router.put('/channels/:id/vca', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { enabled, classes, maxFps, minScore, cooldownSec, rules, recordSeconds, linkedCameraId, popupOnOperator, motionMinRatio, motionPixelThr, motionDownsample, trackerMaxDist, trackerTtlMs } = req.body ?? {};
        const channel = await database_1.prisma.videoChannel.findUnique({ where: { id: req.params.id } });
        if (!channel) {
            res.status(404).json({ error: 'Canal não encontrado' });
            return;
        }
        // sanea as regras (geometria normalizada 0–1, tipos/ações válidos)
        let cleanRules;
        if (rules !== undefined) {
            if (!Array.isArray(rules)) {
                res.status(400).json({ error: 'rules deve ser uma lista' });
                return;
            }
            cleanRules = rules.map((r) => {
                if (!VCA_RULE_TYPES.has(r?.type))
                    throw new Error(`tipo de regra inválido: ${r?.type}`);
                const points = Array.isArray(r?.geometry?.points) ? r.geometry.points : [];
                const min = r.type === 'line_cross' ? 2 : 3;
                if (points.length < min)
                    throw new Error(`regra '${r?.name || r?.type}' precisa de ao menos ${min} pontos`);
                const actions = Array.isArray(r.actions) ? r.actions.filter((a) => VCA_ACTIONS.has(a)) : [];
                return {
                    id: String(r.id || (0, crypto_1.randomBytes)(6).toString('hex')),
                    name: String(r.name || 'Regra'),
                    type: r.type,
                    geometry: { points: points.map((p) => [Number(p[0]), Number(p[1])]) },
                    direction: ['in', 'out', 'both'].includes(r.direction) ? r.direction : 'both',
                    schedule: Array.isArray(r.schedule) ? r.schedule : undefined,
                    actions: actions.length ? actions : ['record', 'alert', 'snapshot'],
                    notifyTargets: r.notifyTargets || undefined,
                    cooldownSec: r.cooldownSec != null ? Math.max(Number(r.cooldownSec), 1) : undefined,
                    dwellMs: r.dwellMs != null ? Math.max(Number(r.dwellMs), 0) : undefined,
                };
            });
        }
        // sanea as classes (string simples, ou {name,minScore} pra limiar por classe)
        let cleanClasses;
        if (classes !== undefined) {
            if (classes !== null && !Array.isArray(classes)) {
                res.status(400).json({ error: 'classes deve ser uma lista' });
                return;
            }
            cleanClasses = classes === null ? null : classes.map((c) => {
                if (typeof c === 'string')
                    return c;
                if (c && typeof c === 'object' && typeof c.name === 'string') {
                    const out = { name: c.name };
                    if (typeof c.minScore === 'number')
                        out.minScore = Math.min(Math.max(Number(c.minScore), 0.05), 0.95);
                    return out;
                }
                throw new Error(`classe inválida: ${JSON.stringify(c)}`);
            });
        }
        // linkedCameraId: "" ou o próprio id = a própria câmera (null); senão valida
        let cleanLinked;
        if (linkedCameraId !== undefined) {
            const v = linkedCameraId ? String(linkedCameraId) : '';
            if (!v || v === channel.id)
                cleanLinked = null;
            else {
                const exists = await database_1.prisma.videoChannel.findUnique({ where: { id: v }, select: { id: true } });
                if (!exists) {
                    res.status(400).json({ error: 'câmera vinculada não encontrada' });
                    return;
                }
                cleanLinked = v;
            }
        }
        const data = {
            ...(enabled !== undefined && { enabled: Boolean(enabled) }),
            ...(cleanClasses !== undefined && { classes: cleanClasses ?? client_1.Prisma.DbNull }),
            ...(maxFps !== undefined && { maxFps: Math.min(Math.max(Number(maxFps), 1), 15) }),
            ...(minScore !== undefined && { minScore: Math.min(Math.max(Number(minScore), 0.1), 0.95) }),
            ...(cooldownSec !== undefined && { cooldownSec: Math.max(Number(cooldownSec), 1) }),
            ...(recordSeconds !== undefined && { recordSeconds: Math.min(Math.max(Number(recordSeconds), 5), 300) }),
            ...(cleanLinked !== undefined && { linkedCameraId: cleanLinked }),
            ...(popupOnOperator !== undefined && { popupOnOperator: Boolean(popupOnOperator) }),
            ...(cleanRules !== undefined && { rules: cleanRules }),
            ...(motionMinRatio !== undefined && { motionMinRatio: motionMinRatio === null ? null : Math.min(Math.max(Number(motionMinRatio), 0.0005), 0.2) }),
            ...(motionPixelThr !== undefined && { motionPixelThr: motionPixelThr === null ? null : Math.round(Math.min(Math.max(Number(motionPixelThr), 1), 255)) }),
            ...(motionDownsample !== undefined && { motionDownsample: motionDownsample === null ? null : Math.round(Math.min(Math.max(Number(motionDownsample), 1), 32)) }),
            ...(trackerMaxDist !== undefined && { trackerMaxDist: trackerMaxDist === null ? null : Math.min(Math.max(Number(trackerMaxDist), 0.01), 1) }),
            ...(trackerTtlMs !== undefined && { trackerTtlMs: trackerTtlMs === null ? null : Math.round(Math.min(Math.max(Number(trackerTtlMs), 200), 20000)) }),
        };
        const vca = await database_1.prisma.videoVcaConfig.upsert({
            where: { channelId: channel.id },
            create: {
                channelId: channel.id,
                enabled: Boolean(enabled),
                classes: cleanClasses ?? client_1.Prisma.DbNull,
                maxFps: maxFps !== undefined ? Math.min(Math.max(Number(maxFps), 1), 15) : 5,
                minScore: minScore !== undefined ? Math.min(Math.max(Number(minScore), 0.1), 0.95) : 0.4,
                cooldownSec: cooldownSec !== undefined ? Math.max(Number(cooldownSec), 1) : 15,
                recordSeconds: recordSeconds !== undefined ? Math.min(Math.max(Number(recordSeconds), 5), 300) : 20,
                linkedCameraId: cleanLinked ?? null,
                popupOnOperator: Boolean(popupOnOperator),
                rules: cleanRules ?? [],
                motionMinRatio: motionMinRatio != null ? Math.min(Math.max(Number(motionMinRatio), 0.0005), 0.2) : null,
                motionPixelThr: motionPixelThr != null ? Math.round(Math.min(Math.max(Number(motionPixelThr), 1), 255)) : null,
                motionDownsample: motionDownsample != null ? Math.round(Math.min(Math.max(Number(motionDownsample), 1), 32)) : null,
                trackerMaxDist: trackerMaxDist != null ? Math.min(Math.max(Number(trackerMaxDist), 0.01), 1) : null,
                trackerTtlMs: trackerTtlMs != null ? Math.round(Math.min(Math.max(Number(trackerTtlMs), 200), 20000)) : null,
            },
            update: data,
        });
        notifyVmsReload();
        res.json({ success: true, vca });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
// ── GET /api/vms/channels/:id/live — URLs de visualização ao vivo ────────────
router.get('/channels/:id/live', async (req, res) => {
    try {
        const channel = await database_1.prisma.videoChannel.findUnique({
            where: { id: req.params.id },
            include: { device: true },
        });
        if (!channel || !channel.enabled || !channel.device.enabled) {
            res.status(404).json({ error: 'Canal não encontrado ou desabilitado' });
            return;
        }
        const urls = (0, rtsp_1.buildStreamUrls)(channel.device, channel);
        const hasSub = Boolean(urls.sub && urls.sub !== urls.main);
        // URLs relativas ao nginx (/streams/ → MediaMTX HLS); o front anexa ?jwt=<token>
        res.json({
            streamPath: channel.streamPath,
            hlsMain: `/streams/${channel.streamPath}/index.m3u8`,
            hlsSub: hasSub ? `/streams/${(0, rtsp_1.subPathName)(channel.streamPath)}/index.m3u8` : null,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/vms/channels/:id/snapshot — 1 frame JPEG (fundo do editor VCA) ──
// Puxa do loopback do MediaMTX (autenticado com o token interno) e devolve um
// JPEG. Serve de tela de fundo para desenhar as zonas/linhas do VCA.
const VMS_RTSP_LOOPBACK = (process.env.VMS_RTSP_LOOPBACK || 'rtsp://127.0.0.1:8554').replace(/\/+$/, '');
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
router.get('/channels/:id/snapshot', async (req, res) => {
    try {
        const channel = await database_1.prisma.videoChannel.findUnique({ where: { id: req.params.id } });
        if (!channel) {
            res.status(404).json({ error: 'Canal não encontrado' });
            return;
        }
        const auth = VMS_INTERNAL_TOKEN ? `?jwt=${encodeURIComponent(VMS_INTERNAL_TOKEN)}` : '';
        const url = `${VMS_RTSP_LOOPBACK}/${channel.streamPath}${auth}`;
        const chunks = [];
        await new Promise((resolve, reject) => {
            const ff = (0, child_process_1.spawn)(FFMPEG_PATH, [
                '-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp',
                '-i', url, '-frames:v', '1', '-q:v', '4', '-f', 'mjpeg', 'pipe:1',
            ], { windowsHide: true });
            const timer = setTimeout(() => { ff.kill(); reject(new Error('timeout')); }, 15000);
            ff.stdout.on('data', (c) => chunks.push(c));
            ff.on('error', (e) => { clearTimeout(timer); reject(e); });
            ff.on('exit', (code) => { clearTimeout(timer); code === 0 && chunks.length ? resolve() : reject(new Error(`ffmpeg ${code}`)); });
        });
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'no-store');
        res.end(Buffer.concat(chunks));
    }
    catch (err) {
        res.status(503).json({ error: `não foi possível capturar o frame: ${err.message}` });
    }
});
// ── GET /api/vms/live-status — estado real de cada canal (gravando? online?) ─
// Consulta o MediaMTX: config (flag record por path) + runtime (ready = fonte
// RTSP conectada). "recording" = gravação ligada E fonte entregando vídeo.
const MEDIAMTX_API_URL = (process.env.MEDIAMTX_API_URL || 'http://127.0.0.1:9997').replace(/\/+$/, '');
router.get('/live-status', async (_req, res) => {
    try {
        const channels = await database_1.prisma.videoChannel.findMany({
            where: { enabled: true, device: { enabled: true } },
            include: { recording: true },
        });
        let recordByPath = new Map();
        let readyByPath = new Map();
        let audioByPath = new Map();
        let manualSet = new Set();
        // canais em gravação manual (botão REC) — vem do vms-service
        try {
            const mr = await (0, node_fetch_1.default)(`http://127.0.0.1:${VMS_PORT}/internal/manual-record`, {
                headers: { 'x-vms-token': VMS_INTERNAL_TOKEN },
                signal: AbortSignal.timeout(4000),
            });
            if (mr.ok) {
                const data = await mr.json();
                manualSet = new Set(data.channels || []);
            }
        }
        catch { /* vms-service fora do ar — segue sem o estado manual */ }
        try {
            const [confRes, runtimeRes] = await Promise.all([
                (0, node_fetch_1.default)(`${MEDIAMTX_API_URL}/v3/config/paths/list?itemsPerPage=200`, { signal: AbortSignal.timeout(5000) }),
                (0, node_fetch_1.default)(`${MEDIAMTX_API_URL}/v3/paths/list?itemsPerPage=200`, { signal: AbortSignal.timeout(5000) }),
            ]);
            if (confRes.ok) {
                const conf = await confRes.json();
                recordByPath = new Map((conf.items || []).map((i) => [i.name, Boolean(i.record)]));
            }
            if (runtimeRes.ok) {
                const runtime = await runtimeRes.json();
                readyByPath = new Map((runtime.items || []).map((i) => [i.name, Boolean(i.ready)]));
                audioByPath = new Map((runtime.items || []).map((i) => [i.name, (i.tracks || []).some((t) => /audio|g711|g722|g726|opus|aac|pcm/i.test(t))]));
            }
        }
        catch { /* MediaMTX fora do ar — tudo reporta como não gravando/offline */ }
        res.json({
            channels: channels.map((ch) => {
                const recPath = ch.recording?.useSubStream ? (0, rtsp_1.subPathName)(ch.streamPath) : ch.streamPath;
                const recordArmed = recordByPath.get(recPath) ?? false;
                const ready = (readyByPath.get(ch.streamPath) ?? false) || (readyByPath.get((0, rtsp_1.subPathName)(ch.streamPath)) ?? false);
                const hasAudio = (audioByPath.get(ch.streamPath) ?? false) || (audioByPath.get((0, rtsp_1.subPathName)(ch.streamPath)) ?? false);
                return {
                    channelId: ch.id,
                    streamPath: ch.streamPath,
                    mode: ch.recording?.mode ?? 'off',
                    ready,
                    hasAudio, // câmera está publicando alguma faixa de áudio agora
                    recordArmed, // gravação ligada no MediaMTX (pode estar aguardando a fonte)
                    recording: recordArmed && (readyByPath.get(recPath) ?? false), // gravando de fato
                    manual: manualSet.has(ch.id), // gravação iniciada pelo botão REC
                };
            }),
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/vms/channels/:id/record — gravação manual (botão REC) ─────────
// Qualquer operador pode acionar (não exige admin): é ação de operação, como
// gravar uma ocorrência que está acontecendo agora.
router.post('/channels/:id/record', async (req, res) => {
    try {
        const active = req.body?.active !== false; // padrão: iniciar
        const channel = await database_1.prisma.videoChannel.findUnique({ where: { id: req.params.id } });
        if (!channel) {
            res.status(404).json({ error: 'Canal não encontrado' });
            return;
        }
        const r = await (0, node_fetch_1.default)(`http://127.0.0.1:${VMS_PORT}/internal/manual-record`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-vms-token': VMS_INTERNAL_TOKEN },
            body: JSON.stringify({ channelId: channel.id, active }),
            // ao parar, o serviço espera o arquivo fechar e indexa antes de responder
            signal: AbortSignal.timeout(active ? 10000 : 25000),
        });
        if (!r.ok)
            throw new Error(`serviço de vídeo respondeu ${r.status}`);
        const data = await r.json();
        // segments = clipe(s) recém-gravados; clip = janela exata para baixar pelo
        // playback quando não há arquivo fechado (canal em gravação contínua)
        res.json({ success: true, recording: data.recording, segments: data.segments ?? [], clip: data.clip ?? null });
    }
    catch (err) {
        res.status(503).json({ error: `Não foi possível acionar a gravação: ${err.message}` });
    }
});
// ── POST /api/vms/channels/:id/ptz — mover/parar câmera PTZ ─────────────────
// Ação de operação (como o REC): qualquer operador com acesso à câmera pode
// mover. `capabilities.ptz` precisa estar marcado no cadastro do canal.
router.post('/channels/:id/ptz', async (req, res) => {
    try {
        const channel = await database_1.prisma.videoChannel.findUnique({
            where: { id: req.params.id },
            include: { device: true },
        });
        if (!channel || !channel.enabled || !channel.device.enabled) {
            res.status(404).json({ error: 'Canal não encontrado ou desabilitado' });
            return;
        }
        const cap = channel.capabilities;
        if (!cap?.ptz) {
            res.status(400).json({ error: 'Esse canal não tem PTZ habilitado' });
            return;
        }
        const action = req.body?.stop
            ? 'stop'
            : {
                pan: Number(req.body?.pan) || 0,
                tilt: Number(req.body?.tilt) || 0,
                zoom: Number(req.body?.zoom) || 0,
            };
        const result = await (0, ptz_1.sendPtzCommand)(channel.device, channel, action);
        if (!result.ok) {
            res.status(result.unsupported ? 501 : 502).json({ error: result.error });
            return;
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/vms/storage-usage — uso de disco das gravações ─────────────────
router.get('/storage-usage', async (_req, res) => {
    try {
        const [agg, disk] = await Promise.all([
            database_1.prisma.recordingSegment.aggregate({
                where: { status: 'closed' },
                _sum: { sizeBytes: true },
                _count: { _all: true },
            }),
            fs_1.promises.statfs(VMS_RECORDINGS_DIR).catch(() => null),
        ]);
        const GB = 1024 * 1024 * 1024;
        const usedGb = Number(agg._sum.sizeBytes ?? BigInt(0)) / GB;
        const freeGb = disk ? (Number(disk.bavail) * Number(disk.bsize)) / GB : null;
        const totalGb = disk ? (Number(disk.blocks) * Number(disk.bsize)) / GB : null;
        const minFreeGb = Number(process.env.VMS_MIN_FREE_GB || 10);
        res.json({
            segments: agg._count._all,
            usedGb: Number(usedGb.toFixed(2)),
            freeGb: freeGb === null ? null : Number(freeGb.toFixed(2)),
            totalGb: totalGb === null ? null : Number(totalGb.toFixed(2)),
            minFreeGb,
            maxDiskGb: Number(process.env.VMS_MAX_DISK_GB || 0),
            // crítico = gravação pausada automaticamente
            critical: freeGb !== null && freeGb < minFreeGb / 2,
            low: freeGb !== null && freeGb < minFreeGb,
            recordingsDir: VMS_RECORDINGS_DIR,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/vms/recordings?channelId&from&to ────────────────────────────────
router.get('/recordings', async (req, res) => {
    try {
        const { channelId, from, to } = req.query;
        const limit = Math.min(Number(req.query.limit) || 200, 1000);
        // permissão de câmera: restringe as gravações às câmeras liberadas
        const allowed = await allowedChannelIds(req.user?.id);
        if (allowed !== null && channelId && !allowed.has(channelId)) {
            res.json({ recordings: [] });
            return;
        }
        const channelFilter = channelId
            ? { channelId }
            : (allowed !== null ? { channelId: { in: [...allowed] } } : {});
        const segments = await database_1.prisma.recordingSegment.findMany({
            where: {
                ...channelFilter,
                ...(from || to ? {
                    startedAt: {
                        ...(from ? { gte: new Date(from) } : {}),
                        ...(to ? { lte: new Date(to) } : {}),
                    },
                } : {}),
                status: { not: 'failed' },
            },
            include: {
                channel: { select: { id: true, name: true, streamPath: true } },
                uploads: { select: { status: true, destination: { select: { name: true } } } },
            },
            orderBy: { startedAt: 'desc' },
            take: limit,
        });
        res.json({ recordings: segments.map(serializeSegment) });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/vms/playback/timeline?channelId&from&to ─────────────────────────
// Linha do tempo para o player: intervalos gravados (do banco, confiável) e os
// "trechos contínuos" (segmentos agrupados com gap < GAP_TOL) para o front saber
// onde a reprodução precisa saltar. Não usa o /list do MediaMTX (instável com o
// segmento em curso na v1.9.3).
router.get('/playback/timeline', async (req, res) => {
    try {
        const { channelId, from, to } = req.query;
        if (!channelId) {
            res.status(400).json({ error: 'channelId é obrigatório' });
            return;
        }
        const allowed = await allowedChannelIds(req.user?.id);
        if (!channelAllowed(allowed, channelId)) {
            res.status(403).json({ error: 'sem permissão para esta câmera' });
            return;
        }
        const segments = await database_1.prisma.recordingSegment.findMany({
            where: {
                channelId,
                status: { notIn: ['failed', 'deleted_local'] },
                ...(from || to ? { startedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
            },
            select: { id: true, startedAt: true, endedAt: true, trigger: true },
            orderBy: { startedAt: 'asc' },
            take: 2000,
        });
        // intervalos individuais (o segmento em curso não tem endedAt → usa agora)
        const now = Date.now();
        const intervals = segments.map((s) => {
            const startMs = s.startedAt.getTime();
            const endMs = s.endedAt ? s.endedAt.getTime() : Math.min(now, startMs + 1800000);
            return { start: s.startedAt.toISOString(), end: new Date(endMs).toISOString(), trigger: s.trigger };
        });
        // trechos contínuos: junta segmentos coladinhos (gap ≤ 3s) para o auto-advance
        const GAP_TOL = 3000;
        const runs = [];
        for (const iv of intervals) {
            const last = runs[runs.length - 1];
            if (last && new Date(iv.start).getTime() - new Date(last.end).getTime() <= GAP_TOL) {
                last.end = iv.end;
            }
            else {
                runs.push({ start: iv.start, end: iv.end });
            }
        }
        res.json({ intervals, runs });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ═════════════════════════════════════════════════════════════════════════════
// Grupos (pastas da árvore do videowall) e layouts de mosaico salvos
// Leitura liberada a qualquer operador; escrita também (é preferência de
// operação da portaria, não configuração de sistema).
// ═════════════════════════════════════════════════════════════════════════════
// ── GET /api/vms/groups ──────────────────────────────────────────────────────
router.get('/groups', async (_req, res) => {
    try {
        const groups = await database_1.prisma.cameraGroup.findMany({
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
        res.json({ groups });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/vms/groups ─────────────────────────────────────────────────────
router.post('/groups', async (req, res) => {
    try {
        const { name, sortOrder } = req.body;
        if (!name) {
            res.status(400).json({ error: 'name é obrigatório' });
            return;
        }
        const group = await database_1.prisma.cameraGroup.create({
            data: { name: String(name).trim(), sortOrder: sortOrder ?? 0 },
        });
        res.status(201).json({ success: true, group });
    }
    catch (err) {
        res.status(err.code === 'P2002' ? 409 : 500)
            .json({ error: err.code === 'P2002' ? 'Já existe um grupo com esse nome' : err.message });
    }
});
// ── PUT /api/vms/groups/:id ──────────────────────────────────────────────────
router.put('/groups/:id', async (req, res) => {
    try {
        const { name, sortOrder } = req.body;
        const group = await database_1.prisma.cameraGroup.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name: String(name).trim() }),
                ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
            },
        });
        res.json({ success: true, group });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : err.code === 'P2002' ? 409 : 500).json({ error: err.message });
    }
});
// ── DELETE /api/vms/groups/:id — canais voltam para "sem grupo" ─────────────
router.delete('/groups/:id', async (req, res) => {
    try {
        await database_1.prisma.cameraGroup.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── PUT /api/vms/channels/:id/group — move o canal para um grupo (ou nenhum) ─
router.put('/channels/:id/group', async (req, res) => {
    try {
        const { groupId } = req.body;
        const channel = await database_1.prisma.videoChannel.update({
            where: { id: req.params.id },
            data: { groupId: groupId || null },
        });
        res.json({ success: true, channel });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── GET /api/vms/layouts ─────────────────────────────────────────────────────
router.get('/layouts', async (_req, res) => {
    try {
        const layouts = await database_1.prisma.videoLayout.findMany({
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        });
        res.json({ layouts });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
const VALID_LAYOUT_SIZES = [1, 4, 9, 16, 25];
/** slots = array de channelId|null, do tamanho do mosaico. */
function normalizeSlots(slots, size) {
    const arr = Array.isArray(slots) ? slots : [];
    return Array.from({ length: size }, (_, i) => {
        const v = arr[i];
        return typeof v === 'string' && v ? v : null;
    });
}
// ── POST /api/vms/layouts — cria ou sobrescreve pelo nome ───────────────────
router.post('/layouts', async (req, res) => {
    try {
        const { name, size, slots, isDefault, cols } = req.body;
        if (!name) {
            res.status(400).json({ error: 'name é obrigatório' });
            return;
        }
        // 1 a 36 quadros (cobre presets 1/2/3/4/9/16 e o mosaico personalizado)
        if (!Number.isInteger(Number(size)) || Number(size) < 1 || Number(size) > 36) {
            res.status(400).json({ error: 'size deve estar entre 1 e 36' });
            return;
        }
        const cleanCols = cols != null && Number(cols) >= 1 && Number(cols) <= 8 ? Number(cols) : null;
        const cleanSlots = normalizeSlots(slots, Number(size));
        if (isDefault) {
            await database_1.prisma.videoLayout.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        const layout = await database_1.prisma.videoLayout.upsert({
            where: { name: String(name).trim() },
            create: {
                name: String(name).trim(),
                size: Number(size),
                cols: cleanCols,
                slots: cleanSlots,
                isDefault: Boolean(isDefault),
            },
            update: {
                size: Number(size),
                cols: cleanCols,
                slots: cleanSlots,
                ...(isDefault !== undefined && { isDefault: Boolean(isDefault) }),
            },
        });
        res.status(201).json({ success: true, layout });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── PUT /api/vms/layouts/:id/default — marca como mosaico padrão ────────────
router.put('/layouts/:id/default', async (req, res) => {
    try {
        await database_1.prisma.videoLayout.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        const layout = await database_1.prisma.videoLayout.update({
            where: { id: req.params.id },
            data: { isDefault: true },
        });
        res.json({ success: true, layout });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── DELETE /api/vms/layouts/:id ──────────────────────────────────────────────
router.delete('/layouts/:id', async (req, res) => {
    try {
        await database_1.prisma.videoLayout.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ═════════════════════════════════════════════════════════════════════════════
// Destinos de storage (rclone) — admin only
// ═════════════════════════════════════════════════════════════════════════════
const RCLONE_TYPES = {
    drive: { oauth: true, params: [], obscure: [] },
    onedrive: { oauth: true, params: [], obscure: [] },
    smb: { oauth: false, params: ['host', 'user', 'port', 'domain', 'spn'], obscure: ['pass'] },
    ftp: { oauth: false, params: ['host', 'user', 'port', 'tls', 'explicit_tls'], obscure: ['pass'] },
    sftp: { oauth: false, params: ['host', 'user', 'port'], obscure: ['pass'] },
};
function rcloneArgs(extra) {
    return RCLONE_CONFIG ? [...extra, '--config', RCLONE_CONFIG] : extra;
}
/**
 * Enfileira as gravações que JÁ existem no disco para um destino recém-criado.
 *
 * Sem isto, um destino só recebe o que for gravado dali para frente — tudo que
 * já estava no servidor ficaria fora da nuvem para sempre, sem nenhum aviso.
 */
async function enqueueExistingRecordings(destinationId) {
    const segments = await database_1.prisma.recordingSegment.findMany({
        where: { status: 'closed' }, // só o que ainda está no disco
        select: { id: true },
    });
    if (segments.length === 0)
        return 0;
    const { count } = await database_1.prisma.recordingUpload.createMany({
        data: segments.map((s) => ({ segmentId: s.id, destinationId })),
        skipDuplicates: true,
    });
    return count;
}
async function uniqueRcloneRemote(base) {
    let candidate = base;
    for (let i = 2;; i++) {
        const existing = await database_1.prisma.storageDestination.findUnique({ where: { rcloneRemote: candidate } });
        if (!existing)
            return candidate;
        candidate = `${base}-${i}`;
    }
}
// ── GET /api/vms/storage ─────────────────────────────────────────────────────
router.get('/storage', auth_1.adminMiddleware, async (_req, res) => {
    try {
        const destinations = await database_1.prisma.storageDestination.findMany({ orderBy: { name: 'asc' } });
        const counts = await database_1.prisma.recordingUpload.groupBy({
            by: ['destinationId', 'status'],
            _count: { _all: true },
        });
        const queue = {};
        for (const c of counts) {
            queue[c.destinationId] = queue[c.destinationId] || {};
            queue[c.destinationId][c.status] = c._count._all;
        }
        res.json({ destinations: destinations.map((d) => ({ ...d, queue: queue[d.id] || {} })) });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/vms/storage (admin) — cria destino não-OAuth (smb/ftp/sftp) ────
router.post('/storage', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, rcloneType, remoteBasePath, uploadMode, params } = req.body;
        if (!name || !rcloneType) {
            res.status(400).json({ error: 'name e rcloneType são obrigatórios' });
            return;
        }
        const typeDef = RCLONE_TYPES[rcloneType];
        if (!typeDef) {
            res.status(400).json({ error: `rcloneType deve ser um de: ${Object.keys(RCLONE_TYPES).join(', ')}` });
            return;
        }
        if (typeDef.oauth) {
            res.status(400).json({ error: `${rcloneType} usa OAuth — use /api/vms/storage/oauth/start ou /oauth/token` });
            return;
        }
        const remote = await uniqueRcloneRemote(slugify(name));
        const args = ['config', 'create', remote, rcloneType, '--non-interactive'];
        const shown = {};
        for (const key of typeDef.params) {
            const value = params?.[key];
            if (value !== undefined && value !== null && value !== '') {
                args.push(`${key}=${value}`);
                shown[key] = String(value);
            }
        }
        for (const key of typeDef.obscure) {
            const value = params?.[key];
            if (value)
                args.push(`${key}=${value}`, '--obscure');
        }
        await execFileAsync(RCLONE_PATH, rcloneArgs(args), { timeout: 30000, windowsHide: true });
        const destination = await database_1.prisma.storageDestination.create({
            data: {
                name,
                kind: 'rclone',
                rcloneType,
                rcloneRemote: remote,
                remoteBasePath: remoteBasePath ?? null,
                uploadMode: uploadMode === 'move' ? 'move' : 'copy',
                configJson: shown,
            },
        });
        // as gravações que já estão no disco também sobem para o novo destino
        const queued = await enqueueExistingRecordings(destination.id);
        res.status(201).json({ success: true, destination, queued });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
const oauthSessions = new Map();
router.post('/storage/oauth/start', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { rcloneType } = req.body;
        if (!RCLONE_TYPES[rcloneType]?.oauth) {
            res.status(400).json({ error: 'rcloneType deve ser "drive" ou "onedrive"' });
            return;
        }
        const sessionId = (0, crypto_1.randomBytes)(8).toString('hex');
        const proc = (0, child_process_1.spawn)(RCLONE_PATH, rcloneArgs(['authorize', rcloneType, '--auth-no-open-browser']), { windowsHide: true });
        const session = { proc, rcloneType, url: null, token: null, error: null, output: '' };
        oauthSessions.set(sessionId, session);
        const onData = (chunk) => {
            session.output += chunk.toString('utf-8');
            if (!session.url) {
                session.url = session.output.match(/(http:\/\/127\.0\.0\.1:53682\/auth\S*)/)?.[1] ?? null;
            }
            // token JSON aparece entre "--->" e "<---End paste"
            const tokenMatch = session.output.match(/--->\s*(\{[\s\S]*?\})\s*<---/);
            if (tokenMatch)
                session.token = tokenMatch[1].trim();
        };
        proc.stdout?.on('data', onData);
        proc.stderr?.on('data', onData);
        proc.on('error', (err) => { session.error = err.message; });
        proc.on('exit', (code) => {
            if (!session.token && code !== 0 && !session.error) {
                session.error = `rclone authorize terminou com código ${code}`;
            }
        });
        setTimeout(() => {
            if (!session.token) {
                try {
                    proc.kill();
                }
                catch { /* já morreu */ }
            }
            oauthSessions.delete(sessionId);
        }, 10 * 60 * 1000).unref();
        // espera a URL aparecer (alguns ms)
        for (let i = 0; i < 50 && !session.url && !session.error; i++) {
            await new Promise((r) => setTimeout(r, 100));
        }
        if (session.error) {
            res.status(500).json({ error: session.error });
            return;
        }
        res.json({ sessionId, authUrl: session.url, note: 'Abra a URL num navegador NA MÁQUINA DO SERVIDOR. Se o servidor não tem navegador, use o modo "colar token".' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.get('/storage/oauth/status/:sessionId', auth_1.adminMiddleware, (req, res) => {
    const session = oauthSessions.get(req.params.sessionId);
    if (!session) {
        res.status(404).json({ error: 'Sessão OAuth não encontrada ou expirada' });
        return;
    }
    res.json({ authUrl: session.url, hasToken: Boolean(session.token), error: session.error });
});
// finaliza (tanto com sessionId do /start quanto com token colado manualmente)
router.post('/storage/oauth/token', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, rcloneType, remoteBasePath, uploadMode, sessionId, token } = req.body;
        if (!name || !RCLONE_TYPES[rcloneType]?.oauth) {
            res.status(400).json({ error: 'name e rcloneType (drive/onedrive) são obrigatórios' });
            return;
        }
        let tokenJson = token ?? null;
        if (!tokenJson && sessionId) {
            tokenJson = oauthSessions.get(sessionId)?.token ?? null;
        }
        if (!tokenJson) {
            res.status(400).json({ error: 'Token OAuth ausente — conclua a autorização no navegador ou cole o token' });
            return;
        }
        try {
            JSON.parse(tokenJson);
        }
        catch {
            res.status(400).json({ error: 'Token inválido — cole exatamente o JSON exibido pelo rclone authorize' });
            return;
        }
        const remote = await uniqueRcloneRemote(slugify(name));
        await execFileAsync(RCLONE_PATH, rcloneArgs(['config', 'create', remote, rcloneType, `token=${tokenJson}`, '--non-interactive']), { timeout: 30000, windowsHide: true });
        const destination = await database_1.prisma.storageDestination.create({
            data: {
                name,
                kind: 'rclone',
                rcloneType,
                rcloneRemote: remote,
                remoteBasePath: remoteBasePath ?? null,
                uploadMode: uploadMode === 'move' ? 'move' : 'copy',
            },
        });
        if (sessionId)
            oauthSessions.delete(sessionId);
        // as gravações que já estão no disco também sobem para o novo destino
        const queued = await enqueueExistingRecordings(destination.id);
        res.status(201).json({ success: true, destination, queued });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/vms/storage/:id/backfill — enviar as gravações já existentes ───
router.post('/storage/:id/backfill', auth_1.adminMiddleware, async (req, res) => {
    try {
        const destination = await database_1.prisma.storageDestination.findUnique({ where: { id: req.params.id } });
        if (!destination) {
            res.status(404).json({ error: 'Destino não encontrado' });
            return;
        }
        const queued = await enqueueExistingRecordings(destination.id);
        res.json({ success: true, queued });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── PUT /api/vms/storage/:id (admin) ─────────────────────────────────────────
router.put('/storage/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, remoteBasePath, uploadMode, enabled } = req.body;
        const destination = await database_1.prisma.storageDestination.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(remoteBasePath !== undefined && { remoteBasePath }),
                ...(uploadMode !== undefined && { uploadMode: uploadMode === 'move' ? 'move' : 'copy' }),
                ...(enabled !== undefined && { enabled }),
            },
        });
        res.json({ success: true, destination });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── DELETE /api/vms/storage/:id (admin) ──────────────────────────────────────
router.delete('/storage/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const destination = await database_1.prisma.storageDestination.delete({ where: { id: req.params.id } });
        if (destination.rcloneRemote) {
            execFileAsync(RCLONE_PATH, rcloneArgs(['config', 'delete', destination.rcloneRemote]), { timeout: 15000, windowsHide: true })
                .catch(() => { });
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── POST /api/vms/storage/:id/test (admin) ───────────────────────────────────
router.post('/storage/:id/test', auth_1.adminMiddleware, async (req, res) => {
    try {
        const destination = await database_1.prisma.storageDestination.findUnique({ where: { id: req.params.id } });
        if (!destination?.rcloneRemote) {
            res.status(404).json({ error: 'Destino não encontrado' });
            return;
        }
        try {
            await execFileAsync(RCLONE_PATH, rcloneArgs(['lsd', `${destination.rcloneRemote}:`, '--max-depth', '1']), { timeout: 30000, windowsHide: true });
            res.json({ reachable: true });
        }
        catch (err) {
            res.json({ reachable: false, error: String(err.stderr || err.message).slice(0, 500) });
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
