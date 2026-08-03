"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditController = void 0;
const database_1 = require("../database");
const AuditService_1 = require("../services/AuditService");
const unifiedConfig_1 = require("../config/unifiedConfig");
class AuditController {
    static async getSessions(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 50, 100);
            const where = AuditService_1.AuditService.parseSessionAuditWhere(req.query);
            // Note: Sort parsing logic from index.ts can be simplified or moved here
            const orderBy = { createdAt: 'desc' };
            const [data, total] = await Promise.all([
                database_1.prisma.sessionAuditEvent.findMany({
                    where,
                    skip: (page - 1) * limit,
                    take: limit,
                    orderBy,
                }),
                database_1.prisma.sessionAuditEvent.count({ where })
            ]);
            res.json({ data, total, page, limit });
        }
        catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
    static async getExportMeta(req, res) {
        try {
            const where = AuditService_1.AuditService.parseSessionAuditWhere(req.query);
            const count = await database_1.prisma.sessionAuditEvent.count({ where });
            res.json({
                count,
                maxLimit: unifiedConfig_1.config.SESSION_AUDIT.EXPORT_MAX_LIMIT,
                canExport: count <= unifiedConfig_1.config.SESSION_AUDIT.EXPORT_MAX_LIMIT
            });
        }
        catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
exports.AuditController = AuditController;
