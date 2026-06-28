import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { VideoDoorbellService } from '../services/VideoDoorbellService';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// All doorbell routes require authentication
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
