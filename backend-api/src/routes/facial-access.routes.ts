import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { FacialAccessService } from '../services/FacialAccessService';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// ── GET /api/facial-access/devices ────────────────────────────────────────
router.get('/devices', async (_req: Request, res: Response): Promise<void> => {
  try {
    const devices = await FacialAccessService.listDevices();
    res.json({ devices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/facial-access/devices (admin only) ──────────────────────────
router.post('/devices', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/facial-access/devices/:id (admin only) ───────────────────────
router.put('/devices/:id', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
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
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── DELETE /api/facial-access/devices/:id (admin only) ────────────────────
router.delete('/devices/:id', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.facialAccessDevice.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── GET /api/facial-access/devices/:id/ping ───────────────────────────────
router.get('/devices/:id/ping', async (req: Request, res: Response): Promise<void> => {
  try {
    const device = await prisma.facialAccessDevice.findUnique({ where: { id: req.params.id } });
    if (!device) { res.status(404).json({ error: 'Dispositivo não encontrado' }); return; }
    const online = await FacialAccessService.testConnection(device.ip, device.port, device.username, device.password);
    res.json({ online });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/facial-access/test ──────────────────────────────────────────
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ip, port, username, password } = req.body;
    if (!ip || !username || !password) {
      res.status(400).json({ error: 'ip, username e password são obrigatórios' });
      return;
    }
    const reachable = await FacialAccessService.testConnection(ip, port ?? 80, username, password);
    res.json({ reachable });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/facial-access/devices/:id/doors (admin only) ────────────────
router.post('/devices/:id/doors', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
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
  } catch (err: any) {
    res.status(err.code === 'P2002' ? 409 : 500).json({ error: err.message });
  }
});

// ── PUT /api/facial-access/doors/:doorId (admin only) ──────────────────────
router.put('/doors/:doorId', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
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
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── DELETE /api/facial-access/doors/:doorId (admin only) ──────────────────
router.delete('/doors/:doorId', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.facialAccessDoor.delete({ where: { id: req.params.doorId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── POST /api/facial-access/doors/:doorId/readers (admin only) ────────────
router.post('/doors/:doorId/readers', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
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
  } catch (err: any) {
    res.status(err.code === 'P2002' ? 409 : 500).json({ error: err.message });
  }
});

// ── PUT /api/facial-access/readers/:readerId (admin only) ─────────────────
router.put('/readers/:readerId', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
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
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── DELETE /api/facial-access/readers/:readerId (admin only) ──────────────
router.delete('/readers/:readerId', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.facialAccessReader.delete({ where: { id: req.params.readerId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

export default router;
