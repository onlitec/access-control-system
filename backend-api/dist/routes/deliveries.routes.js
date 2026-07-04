"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const EventBusService_1 = require("../services/EventBusService");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
function deliveryLabel(d) {
    return [d.company, d.orderRef].filter(Boolean).join(' ') || 'Encomenda';
}
// ── POST /api/deliveries — registrar entrega ─────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { courierName, company, orderRef, unit, residentId, photoUrl, notes } = req.body;
        if (!unit)
            return res.status(400).json({ error: 'Unidade de destino é obrigatória' });
        const user = req.user || {};
        const delivery = await database_1.prisma.delivery.create({
            data: {
                courierName: courierName || null,
                company: company || null,
                orderRef: orderRef || null,
                unit,
                residentId: residentId || null,
                photoUrl: photoUrl || null,
                notes: notes || null,
                receivedById: user.id ?? null,
            },
        });
        await (0, EventBusService_1.emitEvent)({
            personName: `Entrega registrada ${deliveryLabel(delivery)} → ${unit}`,
            personType: 'system',
            unit,
            operatorId: user.id ?? null,
            deviceName: 'Portaria Principal',
            status: 'authorized',
            photoUrl: delivery.photoUrl,
            notes: courierName ? `Entregador: ${courierName}` : null,
            category: 'delivery',
            source: 'manual',
            metadata: { deliveryId: delivery.id, company: delivery.company, orderRef: delivery.orderRef, action: 'registered' },
        }).catch(e => console.error('[Deliveries] Falha ao emitir evento:', e.message));
        res.json({ success: true, data: delivery });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ── GET /api/deliveries — lista paginada ─────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { page = '1', limit = '50', status, unit, q } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {};
        if (status && status !== 'all')
            where.status = status;
        if (unit)
            where.unit = { contains: unit, mode: 'insensitive' };
        if (q) {
            const term = q;
            where.OR = [
                { unit: { contains: term, mode: 'insensitive' } },
                { company: { contains: term, mode: 'insensitive' } },
                { orderRef: { contains: term, mode: 'insensitive' } },
                { courierName: { contains: term, mode: 'insensitive' } },
                { pickedUpBy: { contains: term, mode: 'insensitive' } },
            ];
        }
        const [total, data] = await Promise.all([
            database_1.prisma.delivery.count({ where }),
            database_1.prisma.delivery.findMany({ where, orderBy: { receivedAt: 'desc' }, skip, take }),
        ]);
        res.json({ total, page: Number(page), limit: take, totalPages: Math.ceil(total / take), data });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ── GET /api/deliveries/stats ────────────────────────────────────────────────
router.get('/stats', async (_req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const [awaiting, receivedToday, pickedUpToday, pickedUpAll] = await Promise.all([
            database_1.prisma.delivery.count({ where: { status: 'awaiting' } }),
            database_1.prisma.delivery.count({ where: { receivedAt: { gte: startOfDay } } }),
            database_1.prisma.delivery.count({ where: { status: 'picked_up', pickedUpAt: { gte: startOfDay } } }),
            database_1.prisma.delivery.findMany({
                where: { status: 'picked_up', pickedUpAt: { not: null } },
                select: { receivedAt: true, pickedUpAt: true },
                orderBy: { pickedUpAt: 'desc' },
                take: 100,
            }),
        ]);
        const avgPickupMinutes = pickedUpAll.length > 0
            ? Math.round(pickedUpAll.reduce((acc, d) => acc + (d.pickedUpAt.getTime() - d.receivedAt.getTime()), 0) / pickedUpAll.length / 60000)
            : null;
        res.json({ success: true, data: { awaiting, receivedToday, pickedUpToday, avgPickupMinutes } });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ── PATCH /api/deliveries/:id/pickup — registrar retirada ────────────────────
router.patch('/:id/pickup', async (req, res) => {
    try {
        const { pickedUpBy } = req.body;
        if (!pickedUpBy)
            return res.status(400).json({ error: 'Informe quem retirou a encomenda' });
        const existing = await database_1.prisma.delivery.findUnique({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: 'Entrega não encontrada' });
        if (existing.status === 'picked_up')
            return res.status(409).json({ error: 'Entrega já retirada' });
        const user = req.user || {};
        const delivery = await database_1.prisma.delivery.update({
            where: { id: req.params.id },
            data: { status: 'picked_up', pickedUpAt: new Date(), pickedUpBy },
        });
        await (0, EventBusService_1.emitEvent)({
            personName: `Entrega retirada ${deliveryLabel(delivery)} → ${delivery.unit}`,
            personType: 'system',
            unit: delivery.unit,
            operatorId: user.id ?? null,
            deviceName: 'Portaria Principal',
            status: 'authorized',
            notes: `Retirada por: ${pickedUpBy}`,
            category: 'delivery',
            source: 'manual',
            metadata: { deliveryId: delivery.id, company: delivery.company, orderRef: delivery.orderRef, action: 'picked_up', pickedUpBy },
        }).catch(e => console.error('[Deliveries] Falha ao emitir evento:', e.message));
        res.json({ success: true, data: delivery });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ── PATCH /api/deliveries/:id — editar/estornar ──────────────────────────────
router.patch('/:id', async (req, res) => {
    try {
        const { courierName, company, orderRef, unit, residentId, photoUrl, notes, status } = req.body;
        const data = {};
        if (courierName !== undefined)
            data.courierName = courierName || null;
        if (company !== undefined)
            data.company = company || null;
        if (orderRef !== undefined)
            data.orderRef = orderRef || null;
        if (unit !== undefined)
            data.unit = unit;
        if (residentId !== undefined)
            data.residentId = residentId || null;
        if (photoUrl !== undefined)
            data.photoUrl = photoUrl || null;
        if (notes !== undefined)
            data.notes = notes || null;
        if (status !== undefined) {
            data.status = status;
            if (status === 'awaiting') {
                data.pickedUpAt = null;
                data.pickedUpBy = null;
            }
        }
        const delivery = await database_1.prisma.delivery.update({ where: { id: req.params.id }, data });
        res.json({ success: true, data: delivery });
    }
    catch (error) {
        if (error?.code === 'P2025')
            return res.status(404).json({ error: 'Entrega não encontrada' });
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
