import { Request, Response } from 'express';
import { prisma } from '../database';
import { 
    calculateSecurityMetrics, 
    createSecurityMetricsSnapshot, 
    listSecurityMetricsHistory 
} from '../services/securityMetrics';
import { config } from '../config/unifiedConfig';

export class SecurityController {
    static async getMetrics(req: Request, res: Response) {
        try {
            const { windowHours, topN } = req.query as Record<string, string | undefined>;
            const requestedWindowHours = Number.parseInt(windowHours || '', 10);
            const requestedTopN = Number.parseInt(topN || '', 10);
            
            const effectiveWindowHours = Number.isFinite(requestedWindowHours) && requestedWindowHours > 0
                ? Math.min(24 * 14, requestedWindowHours)
                : config.SECURITY_METRICS.WINDOW_HOURS;
            const effectiveTopN = Number.isFinite(requestedTopN) && requestedTopN > 0
                ? Math.min(100, requestedTopN)
                : config.SECURITY_METRICS.TOP_N;

            const metrics = await calculateSecurityMetrics(prisma, {
                windowHours: effectiveWindowHours,
                topN: effectiveTopN,
            });

            return res.json(metrics);
        } catch (error: any) {
            console.error('[Security] getMetrics error:', error);
            return res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    static async getMetricsHistory(req: Request, res: Response) {
        try {
            const { windowHours, limit, startTime, endTime } = req.query as Record<string, string | undefined>;
            const requestedWindowHours = Number.parseInt(windowHours || '', 10);
            const effectiveWindowHours = Number.isFinite(requestedWindowHours) && requestedWindowHours > 0
                ? Math.min(24 * 14, requestedWindowHours)
                : undefined;

            const metrics = await listSecurityMetricsHistory(prisma, {
                windowHours: effectiveWindowHours,
                limit: Number.parseInt(limit || '50', 10),
                startTime: startTime ? new Date(startTime) : undefined,
                endTime: endTime ? new Date(endTime) : undefined,
            });

            return res.json(metrics);
        } catch (error: any) {
            console.error('[Security] getMetricsHistory error:', error);
            return res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    static async createSnapshot(req: Request, res: Response) {
        try {
            const snapshot = await createSecurityMetricsSnapshot(prisma, {
                windowHours: config.SECURITY_METRICS.WINDOW_HOURS,
                topN: config.SECURITY_METRICS.TOP_N,
            });
            return res.status(201).json(snapshot);
        } catch (error: any) {
            console.error('[Security] createSnapshot error:', error);
            return res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
}
