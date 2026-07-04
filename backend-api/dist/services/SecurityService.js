"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityService = void 0;
const db_1 = require("../db");
const SESSION_AUDIT_RETENTION_DAYS = Number(process.env.SESSION_AUDIT_RETENTION_DAYS || '90');
class SecurityService {
    static async pruneSessionAuditEvents() {
        const now = new Date();
        const cutoff = new Date(now.getTime() - SESSION_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const deleted = await db_1.prisma.sessionAuditEvent.deleteMany({
            where: {
                createdAt: {
                    lt: cutoff,
                },
            },
        });
        console.log(JSON.stringify({
            action: 'prune_session_audit_events',
            retentionDays: SESSION_AUDIT_RETENTION_DAYS,
            cutoff: cutoff.toISOString(),
            deleted: deleted.count,
            timestamp: now.toISOString(),
        }));
    }
}
exports.SecurityService = SecurityService;
