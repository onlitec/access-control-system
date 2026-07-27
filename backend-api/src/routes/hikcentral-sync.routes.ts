import { Router } from 'express';
import { prisma } from '../database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware, adminMiddleware);

/**
 * Lista itens da fila de sincronização assíncrona com o HikCentral.
 * Uso: tela de ops/admin para diagnosticar prestadores/pessoas pendentes ou com erro.
 */
router.get('/queue', async (req, res) => {
    try {
        const { status, entityType, page = '1', limit = '50' } = req.query as Record<string, string | undefined>;
        const pageNum = Math.max(1, Number.parseInt(page || '1', 10) || 1);
        const limitNum = Math.min(200, Math.max(1, Number.parseInt(limit || '50', 10) || 50));

        const where: Record<string, unknown> = {};
        if (status) where.status = status;
        if (entityType) where.entityType = entityType;

        const [data, count] = await Promise.all([
            prisma.hikCentralSyncQueue.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
            }),
            prisma.hikCentralSyncQueue.count({ where }),
        ]);

        res.json({ data, count });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Erro ao consultar fila de sincronização' });
    }
});

/**
 * Força o reprocessamento imediato de um item da fila (reset de tentativas/erro).
 */
router.post('/:id/retry', async (req, res) => {
    try {
        const row = await prisma.hikCentralSyncQueue.update({
            where: { id: req.params.id },
            data: { status: 'pending', attempts: 0, lastError: null, nextAttemptAt: new Date() },
        });
        res.json(row);
    } catch (error: any) {
        if (error?.code === 'P2025') {
            return res.status(404).json({ error: 'Registro não encontrado na fila' });
        }
        res.status(500).json({ error: error.message || 'Erro ao reprocessar item da fila' });
    }
});

export default router;
