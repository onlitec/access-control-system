import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { NiceGuaritaService, ServiceUnavailableError } from '../services/NiceGuaritaService';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

// ── GET /api/guarita/status ───────────────────────────────────────────────
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    sdkAvailable: NiceGuaritaService.isSdkAvailable(),
    message: NiceGuaritaService.isSdkAvailable()
      ? 'Nice Guarita IP SDK disponível'
      : 'Nice Guarita IP: aguardando SDK. Controle de portão indisponível.',
  });
});

// ── GET /api/guarita/devices ──────────────────────────────────────────────
router.get('/devices', async (_req: Request, res: Response): Promise<void> => {
  try {
    const devices = await NiceGuaritaService.listDevices();
    res.json({ devices, sdkAvailable: NiceGuaritaService.isSdkAvailable() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/guarita/devices ─────────────────────────────────────────────
router.post('/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, ip, port, location } = req.body;
    if (!name || !ip) {
      res.status(400).json({ error: 'nome e ip são obrigatórios' });
      return;
    }
    const device = await prisma.guaritaDevice.create({
      data: { name, ip, port: port ?? 80, location: location ?? null },
    });
    res.status(201).json({ success: true, device });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/guarita/devices/:id ──────────────────────────────────────────
router.put('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, ip, port, location, enabled } = req.body;
    const device = await prisma.guaritaDevice.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(ip !== undefined && { ip }),
        ...(port !== undefined && { port }),
        ...(location !== undefined && { location }),
        ...(enabled !== undefined && { enabled }),
      },
    });
    res.json({ success: true, device });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── DELETE /api/guarita/devices/:id ───────────────────────────────────────
router.delete('/devices/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.guaritaDevice.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── POST /api/guarita/devices/:id/open ────────────────────────────────────
router.post('/devices/:id/open', async (req: Request, res: Response): Promise<void> => {
  try {
    await NiceGuaritaService.openGate(req.params.id);
    res.json({ success: true, action: 'open' });
  } catch (err: any) {
    if (err instanceof ServiceUnavailableError) {
      res.status(503).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/guarita/devices/:id/close ───────────────────────────────────
router.post('/devices/:id/close', async (req: Request, res: Response): Promise<void> => {
  try {
    await NiceGuaritaService.closeGate(req.params.id);
    res.json({ success: true, action: 'close' });
  } catch (err: any) {
    if (err instanceof ServiceUnavailableError) {
      res.status(503).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/guarita/devices/:id/status ──────────────────────────────────
router.get('/devices/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await NiceGuaritaService.getGateStatus(req.params.id);
    res.json({ deviceId: req.params.id, status, sdkAvailable: NiceGuaritaService.isSdkAvailable() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
