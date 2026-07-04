import { Router, Request, Response } from 'express';
import { prisma } from '../database';
import { authMiddleware, portariaMiddleware } from '../middleware/auth';
import { config } from '../config/unifiedConfig';
import { NiceGuaritaService } from '../services/NiceGuaritaService';
import { verify } from 'jsonwebtoken';
import { emitEvent } from '../services/EventBusService';

const router = Router();

// ── SSE client registry ────────────────────────────────────────────────────────
const sseClients = new Map<string, Response>();

export function broadcastPassbackAlert(alert: {
    id: string;
    personId: string | null;
    personName: string;
    serial: string;
    deviceId: string | null;
    deviceName: string | null;
    unit: string | null;
    photoUrl: string | null;
    occurredAt: Date;
    resolved: boolean;
}) {
    const payload = `data: ${JSON.stringify({ type: 'passback_alert', data: alert })}\n\n`;
    for (const [clientId, res] of sseClients) {
        try {
            res.write(payload);
        } catch {
            sseClients.delete(clientId);
        }
    }
}

function sendHeartbeat() {
    const payload = 'data: {"type":"ping"}\n\n';
    for (const [clientId, res] of sseClients) {
        try {
            res.write(payload);
        } catch {
            sseClients.delete(clientId);
        }
    }
}

setInterval(sendHeartbeat, 30_000);

// ── SSE endpoint (token via query param — EventSource não suporta headers) ────
router.get('/events', (req: Request, res: Response) => {
    const token = req.query.token as string;
    if (!token) return res.status(401).end();

    try {
        verify(token, config.JWT.SECRET);
    } catch {
        return res.status(401).end();
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx: desativa buffering de SSE
    res.flushHeaders();

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sseClients.set(clientId, res);

    res.write('data: {"type":"connected"}\n\n');

    req.on('close', () => {
        sseClients.delete(clientId);
    });
});

// ── Todas as rotas abaixo exigem auth middleware ──────────────────────────────
router.use(authMiddleware);

// GET /api/guarita/passback/settings
router.get('/settings', async (_req: Request, res: Response) => {
    try {
        const settings = await prisma.condominiumSettings.findUnique({ where: { id: 'singleton' } });
        res.json({ antiPassbackEnabled: settings?.antiPassbackEnabled ?? false });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/guarita/passback/settings
router.put('/settings', async (req: Request, res: Response) => {
    try {
        const { antiPassbackEnabled } = req.body;
        const settings = await prisma.condominiumSettings.upsert({
            where: { id: 'singleton' },
            create: {
                id: 'singleton',
                name: 'Condomínio',
                type: 'vertical',
                antiPassbackEnabled: Boolean(antiPassbackEnabled),
            },
            update: { antiPassbackEnabled: Boolean(antiPassbackEnabled) },
        });
        res.json({ antiPassbackEnabled: settings.antiPassbackEnabled });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/guarita/passback/alerts — alertas pendentes
router.get('/alerts', async (_req: Request, res: Response) => {
    try {
        const alerts = await prisma.guaritaPassbackAlert.findMany({
            where: { resolved: false },
            orderBy: { occurredAt: 'desc' },
        });
        res.json({ data: alerts });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/guarita/passback/alerts/:id/release — libera entrada + abre portão (portaria only)
router.post('/alerts/:id/release', portariaMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const operatorId = (req as any).user?.id;

        const alert = await prisma.guaritaPassbackAlert.findUnique({ where: { id } });
        if (!alert) return res.status(404).json({ error: 'Alerta não encontrado' });

        // Abrir portão se deviceId disponível
        if (alert.deviceId) {
            try {
                await NiceGuaritaService.openGate(alert.deviceId);
                const user = (req as any).user || {};
                await emitEvent({
                    personName: 'Portão aberto manualmente',
                    personType: 'system',
                    operatorId: user.id ?? null,
                    deviceName: alert.deviceName ?? 'Portão',
                    status: 'authorized',
                    notes: `Liberação anti-passback: ${alert.personName}`,
                    category: 'gate',
                    source: 'manual',
                    metadata: { deviceId: alert.deviceId, action: 'open', passbackAlertId: alert.id },
                }).catch(() => {});
            } catch (gateErr: any) {
                console.warn('[APB] Falha ao abrir portão na liberação:', gateErr.message);
            }
        }

        // Resetar estado APB do morador
        if (alert.personId) {
            await prisma.guaritaPassbackState.upsert({
                where: { personId: alert.personId },
                create: {
                    personId: alert.personId,
                    serial: alert.serial,
                    direction: 'OUT',
                    occurredAt: new Date(),
                },
                update: { direction: 'OUT', occurredAt: new Date() },
            });
        }

        // Marcar alerta como resolvido
        await prisma.guaritaPassbackAlert.update({
            where: { id },
            data: {
                resolved: true,
                resolvedAt: new Date(),
                resolvedBy: operatorId ?? null,
            },
        });

        res.json({ success: true, action: 'released' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/guarita/passback/alerts/:id/dismiss — dispensa sem abrir portão
router.post('/alerts/:id/dismiss', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const operatorId = (req as any).user?.id;

        await prisma.guaritaPassbackAlert.update({
            where: { id },
            data: {
                resolved: true,
                resolvedAt: new Date(),
                resolvedBy: operatorId ?? null,
            },
        });

        res.json({ success: true, action: 'dismissed' });
    } catch (error: any) {
        if (error?.code === 'P2025') return res.status(404).json({ error: 'Alerta não encontrado' });
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/guarita/passback/state/:personId — admin reseta estado APB de morador
router.delete('/state/:personId', portariaMiddleware, async (req: Request, res: Response) => {
    try {
        const { personId } = req.params;
        await prisma.guaritaPassbackState.deleteMany({ where: { personId } });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/guarita/passback/states — lista moradores com estado IN (admin)
router.get('/states', async (_req: Request, res: Response) => {
    try {
        const states = await prisma.guaritaPassbackState.findMany({
            where: { direction: 'IN' },
            include: {
                person: {
                    select: { id: true, firstName: true, lastName: true, unit_number: true, tower: true, photoUrl: true },
                },
            },
            orderBy: { occurredAt: 'desc' },
        });
        res.json({
            data: states.map(s => ({
                id: s.id,
                personId: s.personId,
                personName: `${s.person.firstName} ${s.person.lastName}`.trim(),
                unit: s.person.unit_number,
                tower: s.person.tower,
                photoUrl: s.person.photoUrl,
                serial: s.serial,
                direction: s.direction,
                occurredAt: s.occurredAt,
            })),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
