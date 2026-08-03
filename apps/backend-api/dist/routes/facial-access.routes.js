"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const FacialAccessService_1 = require("../services/FacialAccessService");
const auth_1 = require("../middleware/auth");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const unifiedConfig_1 = require("../config/unifiedConfig");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
/** Checks if ffmpeg is available in PATH */
async function hasFfmpeg() {
    try {
        await execFileAsync('ffmpeg', ['-version']);
        return true;
    }
    catch {
        return false;
    }
}
const ffmpegAvailable = hasFfmpeg();
// ── GET /api/facial-access/devices/:id/stream  (MJPEG — auth via ?token=) ──
// Preview ao vivo da câmera do terminal para a captura de foto no painel do
// operador. Mesmo desenho do stream do videoporteiro (doorbell.routes.ts):
// registrado ANTES do authMiddleware porque <img src> não envia header —
// o JWT vem por query param. RTSP → FFmpeg quando disponível; fallback para
// polling de snapshots ISAPI.
router.get('/devices/:id/stream', async (req, res) => {
    const token = req.query.token || '';
    if (!token) {
        res.status(401).end();
        return;
    }
    try {
        jsonwebtoken_1.default.verify(token, unifiedConfig_1.config.JWT.SECRET);
    }
    catch {
        res.status(401).end();
        return;
    }
    const device = await prisma.facialAccessDevice.findUnique({ where: { id: req.params.id } }).catch(() => null);
    if (!device || !device.enabled) {
        res.status(404).end();
        return;
    }
    if (await ffmpegAvailable) {
        // ── RTSP path (low latency, H.264 → MJPEG via FFmpeg) ──────────────────
        const pass = encodeURIComponent(device.password);
        // Sub-stream (102) por padrão — validado no DS-K1T673 (640x480), latência
        // bem menor que o main stream 101 (1280x720). Sobreponível por ?channel=.
        const rawChannel = req.query.channel || process.env.FACIAL_STREAM_CHANNEL || '102';
        const channel = /^\d{1,3}$/.test(rawChannel) ? rawChannel : '102';
        const rtspUrl = `rtsp://${device.username}:${pass}@${device.ip}:554/Streaming/Channels/${channel}`;
        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=ffmpeg');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no');
        const proc = (0, child_process_1.spawn)('ffmpeg', [
            '-loglevel', 'error',
            '-fflags', 'nobuffer',
            '-flags', 'low_delay',
            '-probesize', '65536',
            '-analyzeduration', '0',
            '-max_delay', '0',
            '-reorder_queue_size', '0',
            '-use_wallclock_as_timestamps', '1',
            '-rtsp_transport', 'tcp',
            '-i', rtspUrl,
            '-an',
            '-f', 'mpjpeg',
            '-q:v', '4',
            '-vf', 'scale=w=min(iw\\,960):h=-2',
            '-fps_mode', 'passthrough',
            '-flush_packets', '1',
            'pipe:1',
        ]);
        proc.stdout.pipe(res, { end: true });
        proc.stderr.on('data', () => { });
        const cleanup = () => { try {
            proc.kill('SIGTERM');
        }
        catch { } };
        req.on('close', cleanup);
        req.on('error', cleanup);
        proc.on('exit', () => { if (!res.writableEnded)
            res.end(); });
        proc.on('error', () => { if (!res.writableEnded)
            res.end(); });
        return;
    }
    // ── Fallback: ISAPI snapshot polling ────────────────────────────────────
    const BOUNDARY = 'hikframe';
    res.setHeader('Content-Type', `multipart/x-mixed-replace; boundary=${BOUNDARY}`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    let active = true;
    const sendFrame = async () => {
        if (!active || res.destroyed)
            return;
        try {
            const buf = await FacialAccessService_1.FacialAccessService.getSnapshot(req.params.id);
            if (!active || res.destroyed)
                return;
            res.write(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`);
            res.write(buf);
            res.write('\r\n');
        }
        catch { /* skip frame */ }
    };
    await sendFrame();
    const timer = setInterval(sendFrame, 200); // 5 FPS fallback
    req.on('close', () => { active = false; clearInterval(timer); });
    req.on('error', () => { active = false; clearInterval(timer); });
});
router.use(auth_1.authMiddleware);
// ── GET /api/facial-access/devices ────────────────────────────────────────
router.get('/devices', async (_req, res) => {
    try {
        const devices = await FacialAccessService_1.FacialAccessService.listDevices();
        res.json({ devices });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/facial-access/devices (admin only) ──────────────────────────
router.post('/devices', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, role, ip, port, username, password, location, sdkConfig } = req.body;
        if (!name || !ip || !username || !password) {
            res.status(400).json({ error: 'nome, ip, username e password são obrigatórios' });
            return;
        }
        if (role && role !== 'standalone_terminal' && role !== 'controller') {
            res.status(400).json({ error: 'role deve ser "standalone_terminal" ou "controller"' });
            return;
        }
        const device = await prisma.facialAccessDevice.create({
            data: {
                name, ip, username, password,
                role: role ?? 'standalone_terminal',
                port: port ?? 80,
                location: location ?? null,
                sdkConfig: sdkConfig ?? null,
            },
        });
        // Terminal standalone = sempre 1 porta implícita, já criada no cadastro
        if (device.role === 'standalone_terminal') {
            await prisma.facialAccessDoor.create({
                data: { deviceId: device.id, doorNo: 1, name, actuatorType: 'door' },
            });
        }
        const full = await prisma.facialAccessDevice.findUnique({
            where: { id: device.id },
            include: { doors: { include: { readers: true } } },
        });
        res.status(201).json({ success: true, device: full });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── PUT /api/facial-access/devices/:id (admin only) ───────────────────────
router.put('/devices/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, role, ip, port, username, password, location, enabled, sdkConfig } = req.body;
        const device = await prisma.facialAccessDevice.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(role !== undefined && { role }),
                ...(ip !== undefined && { ip }),
                ...(port !== undefined && { port }),
                ...(username !== undefined && { username }),
                ...(password !== undefined && { password }),
                ...(location !== undefined && { location }),
                ...(enabled !== undefined && { enabled }),
                ...(sdkConfig !== undefined && { sdkConfig }),
            },
            include: { doors: { include: { readers: true } } },
        });
        res.json({ success: true, device });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── DELETE /api/facial-access/devices/:id (admin only) ────────────────────
router.delete('/devices/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        await prisma.facialAccessDevice.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── GET /api/facial-access/devices/:id/ping ───────────────────────────────
router.get('/devices/:id/ping', async (req, res) => {
    try {
        const device = await prisma.facialAccessDevice.findUnique({ where: { id: req.params.id } });
        if (!device) {
            res.status(404).json({ error: 'Dispositivo não encontrado' });
            return;
        }
        const online = await FacialAccessService_1.FacialAccessService.testConnection(device.ip, device.port, device.username, device.password);
        res.json({ online });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/facial-access/test ──────────────────────────────────────────
router.post('/test', async (req, res) => {
    try {
        const { ip, port, username, password } = req.body;
        if (!ip || !username || !password) {
            res.status(400).json({ error: 'ip, username e password são obrigatórios' });
            return;
        }
        const reachable = await FacialAccessService_1.FacialAccessService.testConnection(ip, port ?? 80, username, password);
        res.json({ reachable });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/facial-access/devices/:id/doors (admin only) ────────────────
router.post('/devices/:id/doors', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { doorNo, name, actuatorType, direction } = req.body;
        if (doorNo === undefined || !name) {
            res.status(400).json({ error: 'doorNo e name são obrigatórios' });
            return;
        }
        const door = await prisma.facialAccessDoor.create({
            data: {
                deviceId: req.params.id,
                doorNo: Number(doorNo),
                name,
                actuatorType: actuatorType ?? 'door',
                direction: direction ?? null,
            },
            include: { readers: true },
        });
        res.status(201).json({ success: true, door });
    }
    catch (err) {
        res.status(err.code === 'P2002' ? 409 : 500).json({ error: err.message });
    }
});
// ── PUT /api/facial-access/doors/:doorId (admin only) ──────────────────────
router.put('/doors/:doorId', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, actuatorType, direction, doorNo } = req.body;
        const door = await prisma.facialAccessDoor.update({
            where: { id: req.params.doorId },
            data: {
                ...(name !== undefined && { name }),
                ...(actuatorType !== undefined && { actuatorType }),
                ...(direction !== undefined && { direction }),
                ...(doorNo !== undefined && { doorNo: Number(doorNo) }),
            },
            include: { readers: true },
        });
        res.json({ success: true, door });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── DELETE /api/facial-access/doors/:doorId (admin only) ──────────────────
router.delete('/doors/:doorId', auth_1.adminMiddleware, async (req, res) => {
    try {
        await prisma.facialAccessDoor.delete({ where: { id: req.params.doorId } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── POST /api/facial-access/doors/:doorId/readers (admin only) ────────────
router.post('/doors/:doorId/readers', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { readerNo, type, wiring, busAddress } = req.body;
        if (readerNo === undefined || !type) {
            res.status(400).json({ error: 'readerNo e type são obrigatórios' });
            return;
        }
        const reader = await prisma.facialAccessReader.create({
            data: {
                doorId: req.params.doorId,
                readerNo: Number(readerNo),
                type,
                wiring: wiring ?? 'rs485',
                busAddress: busAddress !== undefined && busAddress !== null ? Number(busAddress) : null,
            },
        });
        res.status(201).json({ success: true, reader });
    }
    catch (err) {
        res.status(err.code === 'P2002' ? 409 : 500).json({ error: err.message });
    }
});
// ── PUT /api/facial-access/readers/:readerId (admin only) ─────────────────
router.put('/readers/:readerId', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { type, wiring, busAddress, readerNo } = req.body;
        const reader = await prisma.facialAccessReader.update({
            where: { id: req.params.readerId },
            data: {
                ...(type !== undefined && { type }),
                ...(wiring !== undefined && { wiring }),
                ...(busAddress !== undefined && { busAddress: busAddress === null ? null : Number(busAddress) }),
                ...(readerNo !== undefined && { readerNo: Number(readerNo) }),
            },
        });
        res.json({ success: true, reader });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── GET /api/facial-access/devices/:id/snapshot ───────────────────────────
// JPEG da câmera do terminal (captura de foto de cadastro pelo operador).
router.get('/devices/:id/snapshot', async (req, res) => {
    try {
        const buffer = await FacialAccessService_1.FacialAccessService.getSnapshot(req.params.id);
        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Length', buffer.length.toString());
        res.send(buffer);
    }
    catch (err) {
        res.status(502).json({ error: `Falha na captura: ${err.message}` });
    }
});
// ── POST /api/facial-access/devices/:id/capture-face ──────────────────────
// Captura assistida: o terminal entra em modo de cadastro (círculo na tela)
// e devolve a foto capturada pelo motor facial do equipamento.
// Body opcional: { timeoutSec } (5–60, padrão 45).
router.post('/devices/:id/capture-face', async (req, res) => {
    try {
        const timeoutSec = Math.min(60, Math.max(5, Number(req.body?.timeoutSec) || 45));
        const buffer = await FacialAccessService_1.FacialAccessService.captureFaceFromTerminal(req.params.id, timeoutSec * 1000);
        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Length', buffer.length.toString());
        res.send(buffer);
    }
    catch (err) {
        const timeout = /Tempo esgotado/.test(err.message);
        res.status(timeout ? 408 : 502).json({ error: err.message });
    }
});
// ── POST /api/facial-access/devices/:id/sync-persons (admin only) ─────────
// Sincroniza todas as pessoas relevantes (áreas ↔ portas) com o equipamento.
router.post('/devices/:id/sync-persons', auth_1.adminMiddleware, async (req, res) => {
    try {
        const results = await FacialAccessService_1.FacialAccessService.syncAllToDevice(req.params.id);
        res.json({ success: true, results });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/facial-access/persons/:personId/sync ────────────────────────
// Sincroniza um morador (cadastro + face + portas) com todos os equipamentos.
router.post('/persons/:personId/sync', async (req, res) => {
    try {
        const results = await FacialAccessService_1.FacialAccessService.syncPersonEverywhere(req.params.personId);
        res.json({ success: true, results });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/facial-access/doors/:doorId/control ─────────────────────────
// Aciona a porta remotamente: { cmd: "open" | "close" | "alwaysOpen" | "alwaysClose" }
router.post('/doors/:doorId/control', async (req, res) => {
    try {
        const cmd = req.body?.cmd ?? 'open';
        if (!['open', 'close', 'alwaysOpen', 'alwaysClose'].includes(cmd)) {
            res.status(400).json({ error: 'cmd deve ser open, close, alwaysOpen ou alwaysClose' });
            return;
        }
        const door = await prisma.facialAccessDoor.findUnique({ where: { id: req.params.doorId } });
        if (!door) {
            res.status(404).json({ error: 'Porta não encontrada' });
            return;
        }
        await FacialAccessService_1.FacialAccessService.controlDoor(door.deviceId, door.doorNo, cmd);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/facial-access/devices/:id/import-events (admin only) ────────
// Importa o histórico de eventos do equipamento (job em segundo plano, idempotente).
router.post('/devices/:id/import-events', auth_1.adminMiddleware, async (req, res) => {
    try {
        const device = await prisma.facialAccessDevice.findUnique({ where: { id: req.params.id } });
        if (!device) {
            res.status(404).json({ error: 'Dispositivo não encontrado' });
            return;
        }
        const progress = FacialAccessService_1.FacialAccessService.startImportEvents(device.id);
        res.status(202).json({ success: true, progress });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/facial-access/devices/:id/import-events ──────────────────────
router.get('/devices/:id/import-events', async (req, res) => {
    const progress = FacialAccessService_1.FacialAccessService.importJobs.get(req.params.id);
    if (!progress) {
        res.status(404).json({ error: 'Nenhuma importação iniciada para este dispositivo' });
        return;
    }
    res.json({ progress });
});
// ── DELETE /api/facial-access/readers/:readerId (admin only) ──────────────
router.delete('/readers/:readerId', auth_1.adminMiddleware, async (req, res) => {
    try {
        await prisma.facialAccessReader.delete({ where: { id: req.params.readerId } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
exports.default = router;
