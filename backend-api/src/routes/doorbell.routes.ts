import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { VideoDoorbellService } from '../services/VideoDoorbellService';
import { authMiddleware } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { config } from '../config/unifiedConfig';
import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const router = Router();
const prisma = new PrismaClient();

/** Checks if ffmpeg is available in PATH */
async function hasFfmpeg(): Promise<boolean> {
  try { await execFileAsync('ffmpeg', ['-version']); return true; } catch { return false; }
}
const ffmpegAvailable = hasFfmpeg();

// ── GET /api/doorbell/devices/:id/stream  (MJPEG — auth via ?token=) ─────────
// Uses RTSP → FFmpeg when available (low latency), falls back to ISAPI snapshots.
// Token passed as query param because <img> src cannot set Authorization headers.
router.get('/devices/:id/stream', async (req: Request, res: Response): Promise<void> => {
  const token = (req.query.token as string) || '';
  if (!token) { res.status(401).end(); return; }
  try { jwt.verify(token, config.JWT.SECRET); } catch { res.status(401).end(); return; }

  const device = await prisma.doorbellDevice.findUnique({ where: { id: req.params.id } }).catch(() => null);
  if (!device || !device.enabled) { res.status(404).end(); return; }

  if (await ffmpegAvailable) {
    // ── RTSP path (low latency, H.264 → MJPEG via FFmpeg) ──────────────────
    const pass = encodeURIComponent(device.password);
    // Sub-stream (102) por padrão: resolução/GOP menores = latência muito
    // menor que o main stream (101). Sobreponível por ?channel= ou env.
    const rawChannel = (req.query.channel as string) || process.env.DOORBELL_STREAM_CHANNEL || '102';
    const channel = /^\d{1,3}$/.test(rawChannel) ? rawChannel : '102';
    const rtspUrl = `rtsp://${device.username}:${pass}@${device.ip}:554/Streaming/Channels/${channel}`;

    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=ffmpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const proc = spawn('ffmpeg', [
      '-loglevel',   'error',
      // baixa latência: sem pre-buffer de análise nem fila de reordenação
      '-fflags',     'nobuffer',
      '-flags',      'low_delay',
      '-probesize',  '65536',
      '-analyzeduration', '0',
      '-max_delay',  '0',
      '-reorder_queue_size', '0',
      '-use_wallclock_as_timestamps', '1',
      '-rtsp_transport', 'tcp',
      '-i',          rtspUrl,
      '-an',                      // sem áudio no MJPEG
      '-f',          'mpjpeg',    // multipart JPEG stream
      '-q:v',        '4',         // JPEG quality 2=best 31=worst
      // reduz para no máximo 960px de largura, mas NUNCA amplia (upscale
      // borra o OSD e não acrescenta detalhe ao sub-stream)
      '-vf',         'scale=w=min(iw\\,960):h=-2',
      '-fps_mode',   'passthrough',   // 1 JPEG por frame recebido, sem repique de relógio
      '-flush_packets', '1',      // envia cada frame imediatamente
      'pipe:1',
    ]);

    proc.stdout.pipe(res, { end: true });
    proc.stderr.on('data', () => {}); // suppress ffmpeg logs

    const cleanup = () => { try { proc.kill('SIGTERM'); } catch {} };
    req.on('close', cleanup);
    req.on('error', cleanup);
    proc.on('exit', () => { if (!res.writableEnded) res.end(); });
    proc.on('error', () => { if (!res.writableEnded) res.end(); });
    return;
  }

  // ── Fallback: ISAPI snapshot polling ────────────────────────────────────
  const BOUNDARY = 'hikframe';
  res.setHeader('Content-Type', `multipart/x-mixed-replace; boundary=${BOUNDARY}`);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  let active = true;

  const sendFrame = async () => {
    if (!active || res.destroyed) return;
    try {
      const buf = await VideoDoorbellService.getSnapshot(req.params.id);
      if (!active || res.destroyed) return;
      res.write(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`);
      res.write(buf);
      res.write('\r\n');
    } catch { /* skip frame */ }
  };

  await sendFrame();
  const timer = setInterval(sendFrame, 200); // 5 FPS fallback

  req.on('close', () => { active = false; clearInterval(timer); });
  req.on('error', () => { active = false; clearInterval(timer); });
});

// All other doorbell routes require authentication via header
router.use(authMiddleware);

// ── GET /api/doorbell/devices ─────────────────────────────────────────────
router.get('/devices', async (_req: Request, res: Response): Promise<void> => {
  try {
    const devices = await VideoDoorbellService.listDevices();
    res.json({ devices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/doorbell/devices/:id ─────────────────────────────────────────
router.get('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const device = await prisma.doorbellDevice.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, location: true, ip: true, port: true, enabled: true, createdAt: true },
    });
    if (!device) {
      res.status(404).json({ error: 'Videoporteiro não encontrado' });
      return;
    }
    res.json(device);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/doorbell/devices ────────────────────────────────────────────
router.post('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, ip, port, username, password, location } = req.body;
    if (!name || !ip || !username || !password) {
      res.status(400).json({ error: 'nome, ip, username e password são obrigatórios' });
      return;
    }
    const device = await prisma.doorbellDevice.create({
      data: { name, ip, port: port ?? 80, username, password, location: location ?? null },
    });
    res.status(201).json({ success: true, device: { id: device.id, name: device.name, ip: device.ip, location: device.location } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/doorbell/devices/:id ─────────────────────────────────────────
router.put('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, ip, port, username, password, location, enabled } = req.body;
    const device = await prisma.doorbellDevice.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(ip !== undefined && { ip }),
        ...(port !== undefined && { port }),
        ...(username !== undefined && { username }),
        ...(password !== undefined && { password }),
        ...(location !== undefined && { location }),
        ...(enabled !== undefined && { enabled }),
      },
    });
    res.json({ success: true, device });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── DELETE /api/doorbell/devices/:id ──────────────────────────────────────
router.delete('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.doorbellDevice.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── GET /api/doorbell/devices/:id/snapshot ────────────────────────────────
// Captures a JPEG from the doorbell camera and returns it as image/jpeg
router.get('/devices/:id/snapshot', async (req: Request, res: Response): Promise<void> => {
  try {
    const buffer = await VideoDoorbellService.getSnapshot(req.params.id);
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Length', buffer.length.toString());
    res.send(buffer);
  } catch (err: any) {
    res.status(502).json({ error: `Falha na captura: ${err.message}` });
  }
});

// ── GET /api/doorbell/devices/:id/info ────────────────────────────────────
router.get('/devices/:id/info', async (req: Request, res: Response): Promise<void> => {
  try {
    const info = await VideoDoorbellService.getDeviceInfo(req.params.id);
    res.json(info);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// ── POST /api/doorbell/test ───────────────────────────────────────────────
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ip, port, username, password } = req.body;
    if (!ip || !username || !password) {
      res.status(400).json({ error: 'ip, username e password são obrigatórios' });
      return;
    }
    const reachable = await VideoDoorbellService.testConnection(ip, port ?? 80, username, password);
    res.json({ reachable });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
