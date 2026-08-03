"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const FacialAccessService_1 = require("../services/FacialAccessService");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// Helper recursivo para formatar a árvore
async function buildAreaTree(parentId) {
    const areas = await database_1.prisma.accessArea.findMany({
        where: { parentId },
        orderBy: { order: 'asc' },
        include: {
            devices: { select: { id: true } }
        }
    });
    const tree = [];
    for (const area of areas) {
        const children = await buildAreaTree(area.id);
        let deviceCount = area.devices.length;
        children.forEach(c => {
            deviceCount += c.deviceCount;
        });
        tree.push({
            id: area.id,
            name: area.name,
            description: area.description,
            icon: area.icon,
            isActive: area.isActive,
            isFavorite: area.isFavorite,
            order: area.order,
            parentId: area.parentId,
            deviceCount,
            children
        });
    }
    return tree;
}
// GET /api/access-areas/tree — retorna a árvore hierárquica
router.get('/tree', async (req, res) => {
    try {
        const tree = await buildAreaTree(null);
        res.json({ data: tree });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
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
        const { name, description, icon, isActive, order, parentId } = req.body;
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
                parentId: parentId || null,
            },
        });
        res.status(201).json({ success: true, data: area });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/access-areas/:id/favorite — favorita/desfavorita área
router.put('/:id/favorite', async (req, res) => {
    try {
        const { id } = req.params;
        const { isFavorite } = req.body;
        const area = await database_1.prisma.accessArea.update({
            where: { id },
            data: { isFavorite: Boolean(isFavorite) }
        });
        res.json({ success: true, data: area });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/access-areas/:id/devices — associa dispositivos em lote
router.put('/:id/devices', async (req, res) => {
    try {
        const { id } = req.params;
        const { deviceIds } = req.body;
        if (!Array.isArray(deviceIds))
            return res.status(400).json({ error: 'deviceIds deve ser um array' });
        const area = await database_1.prisma.accessArea.findUnique({ where: { id } });
        if (!area)
            return res.status(404).json({ error: 'Área não encontrada' });
        await database_1.prisma.networkDevice.updateMany({
            where: { id: { in: deviceIds } },
            data: { areaId: id }
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/access-areas/:id/devices — lista dispositivos de uma área
router.get('/:id/devices', async (req, res) => {
    try {
        const { id } = req.params;
        const devices = await database_1.prisma.networkDevice.findMany({
            where: { areaId: id },
            orderBy: { friendlyName: 'asc' }
        });
        res.json({ success: true, data: devices });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/access-areas/:id — atualiza área (admin)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, icon, isActive, order, parentId, isFavorite } = req.body;
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
                parentId: parentId !== undefined ? (parentId || null) : existing.parentId,
                isFavorite: isFavorite !== undefined ? Boolean(isFavorite) : existing.isFavorite,
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
        const { moveDevicesTo } = req.query;
        const targetAreaId = moveDevicesTo && moveDevicesTo !== 'null' ? String(moveDevicesTo) : null;
        await database_1.prisma.networkDevice.updateMany({
            where: { areaId: id },
            data: { areaId: targetAreaId }
        });
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
        // Best-effort: reflete o novo nível de acesso nos terminais faciais
        void FacialAccessService_1.FacialAccessService.syncPersonEverywhere(person.id).catch((err) => console.warn(`[FacialAccess] Re-sync do morador ${person.id} falhou:`, err?.message || err));
        res.json({ success: true, areaIds });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/access-areas/:id/doors — portas faciais vinculadas a este nível de acesso
router.get('/:id/doors', async (req, res) => {
    try {
        const records = await database_1.prisma.accessAreaDoor.findMany({
            where: { areaId: req.params.id },
            include: { door: { include: { device: true, readers: true } } },
        });
        res.json({ data: records.map(r => r.door) });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/access-areas/:id/doors — substitui as portas que este nível de acesso libera
router.put('/:id/doors', async (req, res) => {
    try {
        const { id } = req.params;
        const { doorIds } = req.body;
        if (!Array.isArray(doorIds))
            return res.status(400).json({ error: 'doorIds deve ser um array' });
        const area = await database_1.prisma.accessArea.findUnique({ where: { id } });
        if (!area)
            return res.status(404).json({ error: 'Área não encontrada' });
        const affectedDoors = await database_1.prisma.facialAccessDoor.findMany({
            where: { OR: [{ id: { in: doorIds } }, { areas: { some: { areaId: id } } }] },
            select: { deviceId: true },
        });
        await database_1.prisma.$transaction([
            database_1.prisma.accessAreaDoor.deleteMany({ where: { areaId: id } }),
            ...doorIds.map(doorId => database_1.prisma.accessAreaDoor.create({
                data: { areaId: id, doorId },
            })),
        ]);
        // Best-effort: re-sincroniza os equipamentos cujas portas entraram/saíram do nível
        const affectedDeviceIds = [...new Set(affectedDoors.map(d => d.deviceId))];
        void (async () => {
            for (const deviceId of affectedDeviceIds) {
                await FacialAccessService_1.FacialAccessService.syncAllToDevice(deviceId).catch((err) => console.warn(`[FacialAccess] Re-sync do dispositivo ${deviceId} falhou:`, err?.message || err));
            }
        })();
        res.json({ success: true, doorIds });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
