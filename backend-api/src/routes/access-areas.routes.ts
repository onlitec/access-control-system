import { Router, Request, Response } from 'express';
import { prisma } from '../database';
import { authMiddleware } from '../middleware/auth';
import { FacialAccessService } from '../services/FacialAccessService';

const router = Router();
router.use(authMiddleware);

// GET /api/access-areas — lista todas as áreas ativas (painel e admin)
router.get('/', async (req: Request, res: Response) => {
    try {
        const { all } = req.query;
        const where = all === 'true' ? {} : { isActive: true };
        const areas = await prisma.accessArea.findMany({
            where,
            orderBy: { order: 'asc' },
        });
        res.json({ data: areas });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/access-areas — cria nova área (admin)
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, description, icon, isActive, order } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });

        const maxOrder = await prisma.accessArea.aggregate({ _max: { order: true } });
        const area = await prisma.accessArea.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                icon: icon?.trim() || '🏠',
                isActive: isActive !== undefined ? Boolean(isActive) : true,
                order: order !== undefined ? Number(order) : (maxOrder._max.order ?? 0) + 1,
            },
        });
        res.status(201).json({ success: true, data: area });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/access-areas/:id — atualiza área (admin)
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, description, icon, isActive, order } = req.body;

        const existing = await prisma.accessArea.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Área não encontrada' });

        const area = await prisma.accessArea.update({
            where: { id },
            data: {
                name: name?.trim() ?? existing.name,
                description: description !== undefined ? (description?.trim() || null) : existing.description,
                icon: icon?.trim() ?? existing.icon,
                isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
                order: order !== undefined ? Number(order) : existing.order,
            },
        });
        res.json({ success: true, data: area });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/access-areas/:id — remove área (admin)
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.accessArea.delete({ where: { id } });
        res.json({ success: true });
    } catch (error: any) {
        if (error?.code === 'P2025') return res.status(404).json({ error: 'Área não encontrada' });
        res.status(500).json({ error: error.message });
    }
});

// GET /api/access-areas/resident/:personId — áreas do morador
router.get('/resident/:personId', async (req: Request, res: Response) => {
    try {
        const { personId } = req.params;
        const records = await prisma.residentAccessArea.findMany({
            where: { personId },
            include: { area: true },
        });
        res.json({ data: records.map(r => r.areaId) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/access-areas/resident/:personId — substitui áreas do morador
router.put('/resident/:personId', async (req: Request, res: Response) => {
    try {
        const { personId } = req.params;
        const { areaIds }: { areaIds: string[] } = req.body;

        if (!Array.isArray(areaIds)) return res.status(400).json({ error: 'areaIds deve ser um array' });

        const person = await prisma.person.findFirst({
            where: { OR: [{ id: personId }, { hikPersonId: personId }] },
        });
        if (!person) return res.status(404).json({ error: 'Morador não encontrado' });

        await prisma.$transaction([
            prisma.residentAccessArea.deleteMany({ where: { personId: person.id } }),
            ...areaIds.map(areaId =>
                prisma.residentAccessArea.create({
                    data: { personId: person.id, areaId },
                })
            ),
        ]);

        // Best-effort: reflete o novo nível de acesso nos terminais faciais
        void FacialAccessService.syncPersonEverywhere(person.id).catch((err: any) =>
            console.warn(`[FacialAccess] Re-sync do morador ${person.id} falhou:`, err?.message || err));

        res.json({ success: true, areaIds });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/access-areas/:id/doors — portas faciais vinculadas a este nível de acesso
router.get('/:id/doors', async (req: Request, res: Response) => {
    try {
        const records = await prisma.accessAreaDoor.findMany({
            where: { areaId: req.params.id },
            include: { door: { include: { device: true, readers: true } } },
        });
        res.json({ data: records.map(r => r.door) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/access-areas/:id/doors — substitui as portas que este nível de acesso libera
router.put('/:id/doors', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { doorIds }: { doorIds: string[] } = req.body;

        if (!Array.isArray(doorIds)) return res.status(400).json({ error: 'doorIds deve ser um array' });

        const area = await prisma.accessArea.findUnique({ where: { id } });
        if (!area) return res.status(404).json({ error: 'Área não encontrada' });

        const affectedDoors = await prisma.facialAccessDoor.findMany({
            where: { OR: [{ id: { in: doorIds } }, { areas: { some: { areaId: id } } }] },
            select: { deviceId: true },
        });

        await prisma.$transaction([
            prisma.accessAreaDoor.deleteMany({ where: { areaId: id } }),
            ...doorIds.map(doorId =>
                prisma.accessAreaDoor.create({
                    data: { areaId: id, doorId },
                })
            ),
        ]);

        // Best-effort: re-sincroniza os equipamentos cujas portas entraram/saíram do nível
        const affectedDeviceIds = [...new Set(affectedDoors.map(d => d.deviceId))];
        void (async () => {
            for (const deviceId of affectedDeviceIds) {
                await FacialAccessService.syncAllToDevice(deviceId).catch((err: any) =>
                    console.warn(`[FacialAccess] Re-sync do dispositivo ${deviceId} falhou:`, err?.message || err));
            }
        })();

        res.json({ success: true, doorIds });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
