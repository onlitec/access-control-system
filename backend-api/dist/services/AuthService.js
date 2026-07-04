"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const db_1 = require("../db");
const auth_1 = require("../utils/auth");
class AuthService {
    static async logSessionAuditEvent(params) {
        try {
            await db_1.prisma.sessionAuditEvent.create({
                data: {
                    eventType: params.eventType,
                    success: params.success,
                    userId: params.userId ?? null,
                    userEmail: params.userEmail ?? null,
                    sessionId: params.sessionId ?? null,
                    ipAddress: (0, auth_1.getClientIp)(params.req),
                    userAgent: (0, auth_1.getUserAgent)(params.req),
                    details: params.details?.slice(0, 1000),
                },
            });
        }
        catch (error) {
            console.error('Session audit log error:', error);
        }
    }
    static async revokeExcessActiveSessions(userId, maxActiveSessions) {
        const sessions = await db_1.prisma.refreshSession.findMany({
            where: {
                userId,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
        });
        if (sessions.length <= maxActiveSessions) {
            return 0;
        }
        const toRevoke = sessions.slice(maxActiveSessions).map((session) => session.id);
        const result = await db_1.prisma.refreshSession.updateMany({
            where: { id: { in: toRevoke } },
            data: { revokedAt: new Date() },
        });
        return result.count;
    }
}
exports.AuthService = AuthService;
