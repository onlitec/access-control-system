import { Request, Response } from 'express';
import { prisma } from '../database';
import { AuditService } from '../services/AuditService';
import { config } from '../config/unifiedConfig';

export class AuditController {
    static async getSessions(req: Request, res: Response) {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
            const where = AuditService.parseSessionAuditWhere(req.query as Record<string, any>);
            
            // Note: Sort parsing logic from index.ts can be simplified or moved here
            const orderBy = { createdAt: 'desc' as const };

            const [data, total] = await Promise.all([
                prisma.sessionAuditEvent.findMany({
                    where,
                    skip: (page - 1) * limit,
                    take: limit,
                    orderBy,
                }),
                prisma.sessionAuditEvent.count({ where })
            ]);

            res.json({ data, total, page, limit });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async getExportMeta(req: Request, res: Response) {
        try {
            const where = AuditService.parseSessionAuditWhere(req.query as Record<string, any>);
            const count = await prisma.sessionAuditEvent.count({ where });
            res.json({ 
                count, 
                maxLimit: config.SESSION_AUDIT.EXPORT_MAX_LIMIT,
                canExport: count <= config.SESSION_AUDIT.EXPORT_MAX_LIMIT 
            });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
