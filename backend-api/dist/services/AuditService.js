"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const database_1 = require("../database");
const request_utils_1 = require("../utils/request.utils");
class AuditService {
    static async logSessionAuditEvent(params) {
        try {
            await database_1.prisma.sessionAuditEvent.create({
                data: {
                    eventType: params.eventType,
                    success: params.success,
                    userId: params.userId ?? null,
                    userEmail: params.userEmail ?? null,
                    sessionId: params.sessionId ?? null,
                    ipAddress: (0, request_utils_1.getClientIp)(params.req),
                    userAgent: (0, request_utils_1.getUserAgent)(params.req),
                    details: params.details?.slice(0, 1000),
                },
            });
        }
        catch (error) {
            console.error('Session audit log error:', error);
        }
    }
    static parseSessionAuditWhere(query) {
        const { userEmail, eventType, success, startTime, endTime, ipAddress, sessionId } = query;
        const where = {};
        if (userEmail) {
            where.userEmail = { contains: userEmail, mode: 'insensitive' };
        }
        if (eventType) {
            where.eventType = eventType;
        }
        if (ipAddress) {
            where.ipAddress = { contains: ipAddress, mode: 'insensitive' };
        }
        if (sessionId) {
            where.sessionId = { contains: sessionId };
        }
        if (success === 'true' || success === 'false') {
            where.success = success === 'true';
        }
        if (startTime || endTime) {
            where.createdAt = {};
            if (startTime) {
                const startDate = new Date(startTime);
                if (!Number.isNaN(startDate.getTime())) {
                    where.createdAt.gte = startDate;
                }
            }
            if (endTime) {
                const endDate = new Date(endTime);
                if (!Number.isNaN(endDate.getTime())) {
                    where.createdAt.lte = endDate;
                }
            }
        }
        return where;
    }
    static async pruneSessionAuditEvents(prismaInstance, retentionDays) {
        const now = new Date();
        const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
        const deleted = await prismaInstance.sessionAuditEvent.deleteMany({
            where: {
                createdAt: {
                    lt: cutoff,
                },
            },
        });
        return { deleted: deleted.count, cutoff };
    }
    static async logAdminAuditEvent(params) {
        try {
            await database_1.prisma.adminAuditEvent.create({
                data: {
                    action: params.action,
                    status: params.status,
                    userId: params.userId ?? null,
                    userEmail: params.userEmail ?? null,
                    ipAddress: (0, request_utils_1.getClientIp)(params.req),
                    details: params.details?.slice(0, 1000),
                },
            });
        }
        catch (error) {
            console.error('Admin audit log error:', error);
        }
    }
}
exports.AuditService = AuditService;
