"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// GET /api/access-areas — lista todas as áreas ativas (painel e admin)
router.get('/', async (req, res) => {
    try {
        const { all } = req.query;
        const where = all === 'true' ? {} : { isActive: true };
        const areas = await database_1.prisma.accessArea.findMany({
            where,
            orderBy: { order: 'asc' },
        });
        res.json({ data: areas });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/access-areas — cria nova área (admin)
router.post('/', async (req, res) => {
    try {
        const { name, description, icon, isActive, order } = req.body;
        if (!name?.trim())
            return res.status(400).json({ error: 'Nome é obrigatório' });
        const maxOrder = await database_1.prisma.accessArea.aggregate({ _max: { order: true } });
        const area = await database_1.prisma.accessArea.create({
            data: {
                name: name.trim(),
                description: description?.trim() || null,
                icon: icon?.trim() || '🏠',
                isActive: isActive !== undefined ? Boolean(isActive) : true,
                order: order !== undefined ? Number(order) : (maxOrder._max.order ?? 0) + 1,
            },
        });
        res.status(201).json({ success: true, data: area });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/access-areas/:id — atualiza área (admin)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, icon, isActive, order } = req.body;
        const existing = await database_1.prisma.accessArea.findUnique({ where: { id } });
        if (!existing)
            return res.status(404).json({ error: 'Área não encontrada' });
        const area = await database_1.prisma.accessArea.update({
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/access-areas/:id — remove área (admin)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await database_1.prisma.accessArea.delete({ where: { id } });
        res.json({ success: true });
    }
    catch (error) {
        if (error?.code === 'P2025')
            return res.status(404).json({ error: 'Área não encontrada' });
        res.status(500).json({ error: error.message });
    }
});
// GET /api/access-areas/resident/:personId — áreas do morador
router.get('/resident/:personId', async (req, res) => {
    try {
        const { personId } = req.params;
        const records = await database_1.prisma.residentAccessArea.findMany({
            where: { personId },
            include: { area: true },
        });
        res.json({ data: records.map(r => r.areaId) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/access-areas/resident/:personId — substitui áreas do morador
router.put('/resident/:personId', async (req, res) => {
    try {
        const { personId } = req.params;
        const { areaIds } = req.body;
        if (!Array.isArray(areaIds))
            return res.status(400).json({ error: 'areaIds deve ser um array' });
        const person = await database_1.prisma.person.findFirst({
            where: { OR: [{ id: personId }, { hikPersonId: personId }] },
        });
        if (!person)
            return res.status(404).json({ error: 'Morador não encontrado' });
        await database_1.prisma.$transaction([
            database_1.prisma.residentAccessArea.deleteMany({ where: { personId: person.id } }),
            ...areaIds.map(areaId => database_1.prisma.residentAccessArea.create({
                data: { personId: person.id, areaId },
            })),
        ]);
        res.json({ success: true, areaIds });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
