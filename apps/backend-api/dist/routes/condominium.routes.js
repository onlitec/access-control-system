"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// Helper for parsing CSV manually
function parseCSV(content) {
    const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0)
        return [];
    const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let charIndex = 0; charIndex < line.length; charIndex++) {
            const char = line[charIndex];
            if (char === '"') {
                inQuotes = !inQuotes;
            }
            else if (char === ',' && !inQuotes) {
                values.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            }
            else {
                current += char;
            }
        }
        values.push(current.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        result.push(obj);
    }
    return result;
}
// 1. GET /api/condominium/settings - Retrieve settings metadata
router.get('/settings', auth_1.portariaMiddleware, async (req, res) => {
    try {
        let settings = await database_1.prisma.condominiumSettings.findUnique({
            where: { id: 'singleton' },
        });
        if (!settings) {
            settings = await database_1.prisma.condominiumSettings.create({
                data: {
                    id: 'singleton',
                    name: 'Condomínio Calabasas',
                    cnpj: '00.000.000/0001-00',
                    address: 'Av. das Flores, 123',
                    phone: '(11) 99999-9999',
                    email: 'contato@calabasas.com',
                    logoUrl: null,
                    type: 'vertical',
                },
            });
        }
        return res.json(settings);
    }
    catch (err) {
        console.error('Error fetching settings:', err);
        return res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
});
// 2. PUT /api/condominium/settings - Update settings metadata
router.put('/settings', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, cnpj, address, phone, email, logoUrl, type } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Nome do condomínio é obrigatório' });
        const settings = await database_1.prisma.condominiumSettings.upsert({
            where: { id: 'singleton' },
            create: {
                id: 'singleton',
                name,
                cnpj,
                address,
                phone,
                email,
                logoUrl,
                type: type || 'vertical',
            },
            update: {
                name,
                cnpj,
                address,
                phone,
                email,
                logoUrl,
                type: type || 'vertical',
            },
        });
        return res.json(settings);
    }
    catch (err) {
        console.error('Error updating settings:', err);
        return res.status(500).json({ error: 'Erro ao atualizar configurações' });
    }
});
// 3. GET /api/condominium/towers - List all towers
router.get('/towers', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const towers = await database_1.prisma.tower.findMany({
            include: { blocks: true },
            orderBy: { name: 'asc' },
        });
        return res.json(towers);
    }
    catch (err) {
        console.error('Error listing towers:', err);
        return res.status(500).json({ error: 'Erro ao listar torres' });
    }
});
// 4. POST /api/condominium/towers - Create tower
router.post('/towers', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, floors } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Nome da torre é obrigatório' });
        const tower = await database_1.prisma.tower.create({
            data: {
                name,
                floors: floors ? parseInt(floors) : 1,
            },
        });
        return res.status(201).json(tower);
    }
    catch (err) {
        console.error('Error creating tower:', err);
        return res.status(500).json({ error: 'Erro ao criar torre' });
    }
});
// 5. PUT /api/condominium/towers/:id - Update tower
router.put('/towers/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, floors } = req.body;
        const tower = await database_1.prisma.tower.update({
            where: { id },
            data: {
                name,
                floors: floors ? parseInt(floors) : undefined,
            },
        });
        return res.json(tower);
    }
    catch (err) {
        console.error('Error updating tower:', err);
        return res.status(500).json({ error: 'Erro ao atualizar torre' });
    }
});
// 6. DELETE /api/condominium/towers/:id - Delete tower
router.delete('/towers/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        // Deleting cascade should be handled automatically by cascade rules or manually if needed
        await database_1.prisma.tower.delete({
            where: { id },
        });
        return res.json({ success: true, message: 'Torre excluída com sucesso' });
    }
    catch (err) {
        console.error('Error deleting tower:', err);
        return res.status(500).json({ error: 'Erro ao excluir torre' });
    }
});
// 7. POST /api/condominium/towers/:towerId/blocks - Add block to tower
router.post('/towers/:towerId/blocks', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { towerId } = req.params;
        const { name } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Nome do bloco é obrigatório' });
        const block = await database_1.prisma.block.create({
            data: {
                name,
                towerId,
            },
        });
        return res.status(201).json(block);
    }
    catch (err) {
        console.error('Error creating block:', err);
        return res.status(500).json({ error: 'Erro ao criar bloco' });
    }
});
// 8. DELETE /api/condominium/blocks/:id - Delete block
router.delete('/blocks/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await database_1.prisma.block.delete({
            where: { id },
        });
        return res.json({ success: true, message: 'Bloco excluído com sucesso' });
    }
    catch (err) {
        console.error('Error deleting block:', err);
        return res.status(500).json({ error: 'Erro ao excluir bloco' });
    }
});
// 9. GET /api/condominium/units - List units
router.get('/units', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const { towerId } = req.query;
        const filter = {};
        if (towerId)
            filter.towerId = String(towerId);
        const units = await database_1.prisma.unit.findMany({
            where: filter,
            include: {
                tower: true,
                block: true,
            },
            orderBy: [
                { tower: { name: 'asc' } },
                { number: 'asc' },
            ],
        });
        return res.json(units);
    }
    catch (err) {
        console.error('Error listing units:', err);
        return res.status(500).json({ error: 'Erro ao listar unidades' });
    }
});
// 10. POST /api/condominium/units - Create unit
router.post('/units', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { number, towerId, blockId, floor, status, parkingSpaces } = req.body;
        if (!number || !towerId)
            return res.status(400).json({ error: 'Número e torre são obrigatórios' });
        const unit = await database_1.prisma.unit.create({
            data: {
                number,
                towerId,
                blockId: blockId || null,
                floor: floor ? parseInt(floor) : null,
                status: status || 'vacant',
                parkingSpaces: parkingSpaces !== undefined ? parseInt(parkingSpaces) : 0,
            },
            include: {
                tower: true,
                block: true,
            },
        });
        return res.status(201).json(unit);
    }
    catch (err) {
        console.error('Error creating unit:', err);
        return res.status(500).json({ error: 'Erro ao criar unidade' });
    }
});
// 11. PUT /api/condominium/units/:id - Update unit
router.put('/units/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { number, towerId, blockId, floor, status, parkingSpaces } = req.body;
        const unit = await database_1.prisma.unit.update({
            where: { id },
            data: {
                number,
                towerId,
                blockId: blockId !== undefined ? blockId : undefined,
                floor: floor !== undefined ? (floor ? parseInt(floor) : null) : undefined,
                status,
                parkingSpaces: parkingSpaces !== undefined ? (parkingSpaces ? parseInt(parkingSpaces) : 0) : undefined,
            },
            include: {
                tower: true,
                block: true,
            },
        });
        return res.json(unit);
    }
    catch (err) {
        console.error('Error updating unit:', err);
        return res.status(500).json({ error: 'Erro ao atualizar unidade' });
    }
});
// 12. DELETE /api/condominium/units/:id - Delete unit
router.delete('/units/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await database_1.prisma.unit.delete({
            where: { id },
        });
        return res.json({ success: true, message: 'Unidade excluída com sucesso' });
    }
    catch (err) {
        console.error('Error deleting unit:', err);
        return res.status(500).json({ error: 'Erro ao excluir unidade' });
    }
});
// 13. POST /api/condominium/units/import - Import units via CSV
router.post('/units/import', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { csvContent } = req.body;
        if (!csvContent)
            return res.status(400).json({ error: 'Conteúdo CSV ausente' });
        const parsed = parseCSV(csvContent);
        let importedCount = 0;
        for (const row of parsed) {
            const { numero, torre, bloco, andar } = row;
            if (!numero || !torre)
                continue;
            // Find or create Tower
            let towerObj = await database_1.prisma.tower.findFirst({ where: { name: torre } });
            if (!towerObj) {
                towerObj = await database_1.prisma.tower.create({
                    data: {
                        name: torre,
                        floors: andar ? parseInt(andar) : 1,
                    },
                });
            }
            // Find or create Block if provided
            let blockId = null;
            if (bloco) {
                let blockObj = await database_1.prisma.block.findFirst({
                    where: { name: bloco, towerId: towerObj.id },
                });
                if (!blockObj) {
                    blockObj = await database_1.prisma.block.create({
                        data: {
                            name: bloco,
                            towerId: towerObj.id,
                        },
                    });
                }
                blockId = blockObj.id;
            }
            // Create Unit
            await database_1.prisma.unit.create({
                data: {
                    number: numero,
                    floor: andar ? parseInt(andar) : null,
                    towerId: towerObj.id,
                    blockId,
                    status: 'vacant',
                },
            });
            importedCount++;
        }
        return res.json({ success: true, imported: importedCount });
    }
    catch (err) {
        console.error('Error importing CSV units:', err);
        return res.status(500).json({ error: `Erro na importação: ${err.message}` });
    }
});
// 14. GET /api/condominium/requirements - Get registration requirements
router.get('/requirements', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const reqs = await database_1.prisma.registrationRequirement.findMany();
        return res.json(reqs);
    }
    catch (err) {
        console.error('Error fetching requirements:', err);
        return res.status(500).json({ error: 'Erro ao buscar requisitos' });
    }
});
// 15. PUT /api/condominium/requirements - Update registration requirements
router.put('/requirements', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { requirements } = req.body; // Array of { id, status }
        if (!requirements || !Array.isArray(requirements)) {
            return res.status(400).json({ error: 'Lista de requisitos inválida' });
        }
        for (const reqObj of requirements) {
            await database_1.prisma.registrationRequirement.update({
                where: { id: reqObj.id },
                data: { status: reqObj.status }
            });
        }
        return res.json({ success: true });
    }
    catch (err) {
        console.error('Error updating requirements:', err);
        return res.status(500).json({ error: 'Erro ao atualizar requisitos' });
    }
});
// 16. GET /api/condominium/blacklist - Get blacklist records
router.get('/blacklist', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const records = await database_1.prisma.blacklist.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return res.json(records);
    }
    catch (err) {
        console.error('Error fetching blacklist:', err);
        return res.status(500).json({ error: 'Erro ao obter blacklist' });
    }
});
// 17. POST /api/condominium/blacklist - Add person to blacklist
router.post('/blacklist', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, document, reason, createdBy } = req.body;
        if (!name || !document) {
            return res.status(400).json({ error: 'Nome e Documento são obrigatórios' });
        }
        const record = await database_1.prisma.blacklist.create({
            data: {
                name,
                document,
                reason: reason || '',
                createdBy: createdBy || 'admin'
            }
        });
        return res.status(201).json(record);
    }
    catch (err) {
        console.error('Error adding to blacklist:', err);
        return res.status(500).json({ error: 'Erro ao adicionar na blacklist' });
    }
});
// 18. DELETE /api/condominium/blacklist/:id - Remove from blacklist
router.delete('/blacklist/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        await database_1.prisma.blacklist.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (err) {
        console.error('Error removing from blacklist:', err);
        return res.status(500).json({ error: 'Erro ao remover da blacklist' });
    }
});
// 19. GET /api/condominium/schedules - Get access schedules
router.get('/schedules', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const schedules = await database_1.prisma.accessSchedule.findMany();
        return res.json(schedules);
    }
    catch (err) {
        console.error('Error fetching schedules:', err);
        return res.status(500).json({ error: 'Erro ao buscar agendas de acesso' });
    }
});
// 20. PUT /api/condominium/schedules - Update access schedules
router.put('/schedules', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { schedules } = req.body;
        if (!schedules || !Array.isArray(schedules)) {
            return res.status(400).json({ error: 'Lista de agendas inválida' });
        }
        await database_1.prisma.$transaction(async (tx) => {
            await tx.accessSchedule.deleteMany();
            for (const sch of schedules) {
                await tx.accessSchedule.create({
                    data: {
                        type: sch.type,
                        dayOfWeek: parseInt(sch.dayOfWeek),
                        startTime: sch.startTime,
                        endTime: sch.endTime,
                        isActive: sch.isActive !== undefined ? sch.isActive : true
                    }
                });
            }
        });
        const updated = await database_1.prisma.accessSchedule.findMany();
        return res.json(updated);
    }
    catch (err) {
        console.error('Error updating schedules:', err);
        return res.status(500).json({ error: 'Erro ao atualizar agendas de acesso' });
    }
});
exports.default = router;
