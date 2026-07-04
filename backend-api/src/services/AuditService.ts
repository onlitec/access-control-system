import { Request } from 'express';
import { prisma } from '../database';
import { getClientIp, getUserAgent } from '../utils/request.utils';

export class AuditService {
    static async logSessionAuditEvent(params: {
        eventType: string;
        success: boolean;
        req: Request;
        userId?: string | null;
        userEmail?: string | null;
        sessionId?: string | null;
        details?: string;
    }) {
        try {
            await prisma.sessionAuditEvent.create({
                data: {
                    eventType: params.eventType,
                    success: params.success,
                    userId: params.userId ?? null,
                    userEmail: params.userEmail ?? null,
                    sessionId: params.sessionId ?? null,
                    ipAddress: getClientIp(params.req),
                    userAgent: getUserAgent(params.req),
                    details: params.details?.slice(0, 1000),
                },
            });
        } catch (error: any) {
            console.error('Session audit log error:', error);
        }
    }

    static parseSessionAuditWhere(query: Record<string, any>) {
        const { userEmail, eventType, success, startTime, endTime, ipAddress, sessionId } = query;
        const where: any = {};

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

    static async pruneSessionAuditEvents(prismaInstance: any, retentionDays: number) {
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

    static async logAdminAuditEvent(params: {
        action: string;
        status: string;
        req: Request;
        userId?: string | null;
        userEmail?: string | null;
        details?: string;
    }) {
        try {
            await prisma.adminAuditEvent.create({
                data: {
                    action: params.action,
                    status: params.status,
                    userId: params.userId ?? null,
                    userEmail: params.userEmail ?? null,
                    ipAddress: getClientIp(params.req),
                    details: params.details?.slice(0, 1000),
                },
            });
        } catch (error: any) {
            console.error('Admin audit log error:', error);
        }
    }
}
