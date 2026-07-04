import { Router, Request, Response } from 'express';
import { prisma } from '../database';
import { authMiddleware, adminMiddleware, portariaMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// Helper for parsing CSV manually
function parseCSV(content: string): any[] {
    const lines = content.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length === 0) return [];
    
    const headers = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const values: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let charIndex = 0; charIndex < line.length; charIndex++) {
            const char = line[charIndex];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim().replace(/^"|"$/g, ''));
        
        const obj: any = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        result.push(obj);
    }
    return result;
}

// 1. GET /api/condominium/settings - Retrieve settings metadata
router.get('/settings', portariaMiddleware, async (req: Request, res: Response) => {
    try {
        let settings = await prisma.condominiumSettings.findUnique({
            where: { id: 'singleton' },
        });
        if (!settings) {
            settings = await prisma.condominiumSettings.create({
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
    } catch (err: any) {
        console.error('Error fetching settings:', err);
        return res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
});

// 2. PUT /api/condominium/settings - Update settings metadata
router.put('/settings', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { name, cnpj, address, phone, email, logoUrl, type } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome do condomínio é obrigatório' });
        
        const settings = await prisma.condominiumSettings.upsert({
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
    } catch (err: any) {
        console.error('Error updating settings:', err);
        return res.status(500).json({ error: 'Erro ao atualizar configurações' });
    }
});

// 3. GET /api/condominium/towers - List all towers
router.get('/towers', portariaMiddleware, async (req: Request, res: Response) => {
    try {
        const towers = await prisma.tower.findMany({
            include: { blocks: true },
            orderBy: { name: 'asc' },
        });
        return res.json(towers);
    } catch (err: any) {
        console.error('Error listing towers:', err);
        return res.status(500).json({ error: 'Erro ao listar torres' });
    }
});

// 4. POST /api/condominium/towers - Create tower
router.post('/towers', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { name, floors } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome da torre é obrigatório' });
        
        const tower = await prisma.tower.create({
            data: {
                name,
                floors: floors ? parseInt(floors) : 1,
            },
        });
        return res.status(201).json(tower);
    } catch (err: any) {
        console.error('Error creating tower:', err);
        return res.status(500).json({ error: 'Erro ao criar torre' });
    }
});

// 5. PUT /api/condominium/towers/:id - Update tower
router.put('/towers/:id', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, floors } = req.body;
        
        const tower = await prisma.tower.update({
            where: { id },
            data: {
                name,
                floors: floors ? parseInt(floors) : undefined,
            },
        });
        return res.json(tower);
    } catch (err: any) {
        console.error('Error updating tower:', err);
        return res.status(500).json({ error: 'Erro ao atualizar torre' });
    }
});

// 6. DELETE /api/condominium/towers/:id - Delete tower
router.delete('/towers/:id', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        // Deleting cascade should be handled automatically by cascade rules or manually if needed
        await prisma.tower.delete({
            where: { id },
        });
        return res.json({ success: true, message: 'Torre excluída com sucesso' });
    } catch (err: any) {
        console.error('Error deleting tower:', err);
        return res.status(500).json({ error: 'Erro ao excluir torre' });
    }
});

// 7. POST /api/condominium/towers/:towerId/blocks - Add block to tower
router.post('/towers/:towerId/blocks', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { towerId } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Nome do bloco é obrigatório' });
        
        const block = await prisma.block.create({
            data: {
                name,
                towerId,
            },
        });
        return res.status(201).json(block);
    } catch (err: any) {
        console.error('Error creating block:', err);
        return res.status(500).json({ error: 'Erro ao criar bloco' });
    }
});

// 8. DELETE /api/condominium/blocks/:id - Delete block
router.delete('/blocks/:id', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.block.delete({
            where: { id },
        });
        return res.json({ success: true, message: 'Bloco excluído com sucesso' });
    } catch (err: any) {
        console.error('Error deleting block:', err);
        return res.status(500).json({ error: 'Erro ao excluir bloco' });
    }
});

// 9. GET /api/condominium/units - List units
router.get('/units', portariaMiddleware, async (req: Request, res: Response) => {
    try {
        const { towerId } = req.query;
        const filter: any = {};
        if (towerId) filter.towerId = String(towerId);
        
        const units = await prisma.unit.findMany({
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
    } catch (err: any) {
        console.error('Error listing units:', err);
        return res.status(500).json({ error: 'Erro ao listar unidades' });
    }
});

// 10. POST /api/condominium/units - Create unit
router.post('/units', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { number, towerId, blockId, floor, status, parkingSpaces } = req.body;
        if (!number || !towerId) return res.status(400).json({ error: 'Número e torre são obrigatórios' });
        
        const unit = await prisma.unit.create({
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
    } catch (err: any) {
        console.error('Error creating unit:', err);
        return res.status(500).json({ error: 'Erro ao criar unidade' });
    }
});

// 11. PUT /api/condominium/units/:id - Update unit
router.put('/units/:id', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { number, towerId, blockId, floor, status, parkingSpaces } = req.body;
        
        const unit = await prisma.unit.update({
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
    } catch (err: any) {
        console.error('Error updating unit:', err);
        return res.status(500).json({ error: 'Erro ao atualizar unidade' });
    }
});

// 12. DELETE /api/condominium/units/:id - Delete unit
router.delete('/units/:id', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.unit.delete({
            where: { id },
        });
        return res.json({ success: true, message: 'Unidade excluída com sucesso' });
    } catch (err: any) {
        console.error('Error deleting unit:', err);
        return res.status(500).json({ error: 'Erro ao excluir unidade' });
    }
});

// 13. POST /api/condominium/units/import - Import units via CSV
router.post('/units/import', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { csvContent } = req.body;
        if (!csvContent) return res.status(400).json({ error: 'Conteúdo CSV ausente' });
        
        const parsed = parseCSV(csvContent);
        let importedCount = 0;
        
        for (const row of parsed) {
            const { numero, torre, bloco, andar } = row;
            if (!numero || !torre) continue;
            
            // Find or create Tower
            let towerObj = await prisma.tower.findFirst({ where: { name: torre } });
            if (!towerObj) {
                towerObj = await prisma.tower.create({
                    data: {
                        name: torre,
                        floors: andar ? parseInt(andar) : 1,
                    },
                });
            }
            
            // Find or create Block if provided
            let blockId = null;
            if (bloco) {
                let blockObj = await prisma.block.findFirst({
                    where: { name: bloco, towerId: towerObj.id },
                });
                if (!blockObj) {
                    blockObj = await prisma.block.create({
                        data: {
                            name: bloco,
                            towerId: towerObj.id,
                        },
                    });
                }
                blockId = blockObj.id;
            }
            
            // Create Unit
            await prisma.unit.create({
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
    } catch (err: any) {
        console.error('Error importing CSV units:', err);
        return res.status(500).json({ error: `Erro na importação: ${err.message}` });
    }
});

// 14. GET /api/condominium/requirements - Get registration requirements
router.get('/requirements', portariaMiddleware, async (req: Request, res: Response) => {
    try {
        const reqs = await prisma.registrationRequirement.findMany();
        return res.json(reqs);
    } catch (err: any) {
        console.error('Error fetching requirements:', err);
        return res.status(500).json({ error: 'Erro ao buscar requisitos' });
    }
});

// 15. PUT /api/condominium/requirements - Update registration requirements
router.put('/requirements', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { requirements } = req.body; // Array of { id, status }
        if (!requirements || !Array.isArray(requirements)) {
            return res.status(400).json({ error: 'Lista de requisitos inválida' });
        }

        for (const reqObj of requirements) {
            await prisma.registrationRequirement.update({
                where: { id: reqObj.id },
                data: { status: reqObj.status }
            });
        }

        return res.json({ success: true });
    } catch (err: any) {
        console.error('Error updating requirements:', err);
        return res.status(500).json({ error: 'Erro ao atualizar requisitos' });
    }
});

// 16. GET /api/condominium/blacklist - Get blacklist records
router.get('/blacklist', portariaMiddleware, async (req: Request, res: Response) => {
    try {
        const records = await prisma.blacklist.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return res.json(records);
    } catch (err: any) {
        console.error('Error fetching blacklist:', err);
        return res.status(500).json({ error: 'Erro ao obter blacklist' });
    }
});

// 17. POST /api/condominium/blacklist - Add person to blacklist
router.post('/blacklist', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { name, document, reason, createdBy } = req.body;
        if (!name || !document) {
            return res.status(400).json({ error: 'Nome e Documento são obrigatórios' });
        }

        const record = await prisma.blacklist.create({
            data: {
                name,
                document,
                reason: reason || '',
                createdBy: createdBy || 'admin'
            }
        });
        return res.status(201).json(record);
    } catch (err: any) {
        console.error('Error adding to blacklist:', err);
        return res.status(500).json({ error: 'Erro ao adicionar na blacklist' });
    }
});

// 18. DELETE /api/condominium/blacklist/:id - Remove from blacklist
router.delete('/blacklist/:id', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.blacklist.delete({ where: { id } });
        return res.json({ success: true });
    } catch (err: any) {
        console.error('Error removing from blacklist:', err);
        return res.status(500).json({ error: 'Erro ao remover da blacklist' });
    }
});

// 19. GET /api/condominium/schedules - Get access schedules
router.get('/schedules', portariaMiddleware, async (req: Request, res: Response) => {
    try {
        const schedules = await prisma.accessSchedule.findMany();
        return res.json(schedules);
    } catch (err: any) {
        console.error('Error fetching schedules:', err);
        return res.status(500).json({ error: 'Erro ao buscar agendas de acesso' });
    }
});

// 20. PUT /api/condominium/schedules - Update access schedules
router.put('/schedules', adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { schedules } = req.body;
        if (!schedules || !Array.isArray(schedules)) {
            return res.status(400).json({ error: 'Lista de agendas inválida' });
        }

        await prisma.$transaction(async (tx) => {
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

        const updated = await prisma.accessSchedule.findMany();
        return res.json(updated);
    } catch (err: any) {
        console.error('Error updating schedules:', err);
        return res.status(500).json({ error: 'Erro ao atualizar agendas de acesso' });
    }
});

export default router;
