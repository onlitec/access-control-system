import { Router, Request, Response } from 'express';
import { AuditController } from '../controllers/AuditController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { prisma } from '../database';

const router = Router();

router.get('/sessions', authMiddleware, adminMiddleware, AuditController.getSessions);
router.get('/export/meta', authMiddleware, adminMiddleware, AuditController.getExportMeta);

// GET /api/audit/access - Query access events logs
router.get('/access', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { from, to, search, type, status, page, limit } = req.query;
        
        const filter: any = {};
        
        // Date range filtering
        if (from || to) {
            filter.occurredAt = {};
            if (from) {
                filter.occurredAt.gte = new Date(from as string);
            }
            if (to) {
                filter.occurredAt.lte = new Date(to as string);
            }
        }
        
        // Search by name
        if (search) {
            filter.personName = {
                contains: String(search),
                mode: 'insensitive',
            };
        }
        
        // Map Portuguese UI types to model values
        if (type && type !== 'Todos') {
            if (type === 'Morador') filter.personType = 'resident';
            else if (type === 'Visitante') filter.personType = 'visitor';
            else if (type === 'Prestador (condomínio)') filter.personType = 'provider_condo';
            else if (type === 'Prestador (morador)') filter.personType = 'provider_resident';
            else filter.personType = String(type);
        }
        
        // Map Portuguese UI status to model values
        if (status && status !== 'Todos') {
            if (status === 'Autorizado') filter.status = 'authorized';
            else if (status === 'Negado') filter.status = 'denied';
            else if (status === 'Pendente') filter.status = 'pending';
            else filter.status = String(status);
        }

        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 25;
        const skip = (pageNum - 1) * limitNum;

        const [items, total] = await Promise.all([
            prisma.accessEvent.findMany({
                where: filter,
                orderBy: { occurredAt: 'desc' },
                skip,
                take: limitNum,
            }),
            prisma.accessEvent.count({ where: filter }),
        ]);

        return res.json({
            items,
            total,
            page: pageNum,
            limit: limitNum,
        });
    } catch (err: any) {
        console.error('Error fetching access events audit:', err);
        return res.status(500).json({ error: 'Erro ao buscar auditoria de acessos' });
    }
});

// GET /api/audit/access/export - Export access events as CSV
router.get('/access/export', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { from, to, search, type, status } = req.query;
        
        const filter: any = {};
        
        if (from || to) {
            filter.occurredAt = {};
            if (from) filter.occurredAt.gte = new Date(from as string);
            if (to) filter.occurredAt.lte = new Date(to as string);
        }
        
        if (search) {
            filter.personName = {
                contains: String(search),
                mode: 'insensitive',
            };
        }
        
        if (type && type !== 'Todos') {
            if (type === 'Morador') filter.personType = 'resident';
            else if (type === 'Visitante') filter.personType = 'visitor';
            else if (type === 'Prestador (condomínio)') filter.personType = 'provider_condo';
            else if (type === 'Prestador (morador)') filter.personType = 'provider_resident';
            else filter.personType = String(type);
        }
        
        if (status && status !== 'Todos') {
            if (status === 'Autorizado') filter.status = 'authorized';
            else if (status === 'Negado') filter.status = 'denied';
            else if (status === 'Pendente') filter.status = 'pending';
            else filter.status = String(status);
        }

        const items = await prisma.accessEvent.findMany({
            where: filter,
            orderBy: { occurredAt: 'desc' },
        });

        // Generate CSV file (UTF-8 BOM to display accented characters in Excel)
        let csvContent = '\uFEFF';
        csvContent += 'data_hora,nome,tipo,unidade,porteiro,dispositivo,status,observacoes\n';

        const escapeCSV = (str: string | null | undefined) => {
            if (!str) return '';
            const cleaned = str.replace(/"/g, '""');
            return cleaned.includes(',') || cleaned.includes('\n') || cleaned.includes('"') ? `"${cleaned}"` : cleaned;
        };

        const getPersonTypeLabel = (pType: string) => {
            if (pType === 'resident') return 'Morador';
            if (pType === 'visitor') return 'Visitante';
            if (pType === 'provider_condo') return 'Prestador (condomínio)';
            if (pType === 'provider_resident') return 'Prestador (morador)';
            return pType;
        };

        const getStatusLabel = (st: string) => {
            if (st === 'authorized') return 'Autorizado';
            if (st === 'denied') return 'Negado';
            if (st === 'pending') return 'Pendente';
            return st;
        };

        items.forEach((item) => {
            const formattedDate = new Date(item.occurredAt).toLocaleString('pt-BR');
            const row = [
                escapeCSV(formattedDate),
                escapeCSV(item.personName),
                escapeCSV(getPersonTypeLabel(item.personType)),
                escapeCSV(item.unit),
                escapeCSV(item.operatorId),
                escapeCSV(item.deviceName),
                escapeCSV(getStatusLabel(item.status)),
                escapeCSV(item.notes),
            ].join(',');
            csvContent += row + '\n';
        });

        const dateStr = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="acessos-${dateStr}.csv"`);
        return res.status(200).send(csvContent);
    } catch (err: any) {
        console.error('Error exporting access events CSV:', err);
        return res.status(500).json({ error: 'Erro ao exportar arquivo CSV' });
    }
});

// GET /api/audit/admin - Query admin audit logs
router.get('/admin', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { from, to, search, action, status, page, limit } = req.query;
        
        const filter: any = {};
        
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.gte = new Date(from as string);
            if (to) filter.createdAt.lte = new Date(to as string);
        }
        
        if (search) {
            filter.OR = [
                { userEmail: { contains: String(search), mode: 'insensitive' } },
                { details: { contains: String(search), mode: 'insensitive' } },
            ];
        }
        
        if (action && action !== 'Todos') {
            filter.action = String(action);
        }
        
        if (status && status !== 'Todos') {
            filter.status = String(status);
        }

        const pageNum = parseInt(page as string) || 1;
        const limitNum = parseInt(limit as string) || 25;
        const skip = (pageNum - 1) * limitNum;

        const [items, total] = await Promise.all([
            prisma.adminAuditEvent.findMany({
                where: filter,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
            }),
            prisma.adminAuditEvent.count({ where: filter }),
        ]);

        return res.json({
            items,
            total,
            page: pageNum,
            limit: limitNum,
        });
    } catch (err: any) {
        console.error('Error fetching admin audit logs:', err);
        return res.status(500).json({ error: 'Erro ao buscar logs administrativos' });
    }
});

export default router;
