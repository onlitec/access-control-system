"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityController = void 0;
const database_1 = require("../database");
const securityMetrics_1 = require("../services/securityMetrics");
const unifiedConfig_1 = require("../config/unifiedConfig");
class SecurityController {
    static async getMetrics(req, res) {
        try {
            const { windowHours, topN } = req.query;
            const requestedWindowHours = Number.parseInt(windowHours || '', 10);
            const requestedTopN = Number.parseInt(topN || '', 10);
            const effectiveWindowHours = Number.isFinite(requestedWindowHours) && requestedWindowHours > 0
                ? Math.min(24 * 14, requestedWindowHours)
                : unifiedConfig_1.config.SECURITY_METRICS.WINDOW_HOURS;
            const effectiveTopN = Number.isFinite(requestedTopN) && requestedTopN > 0
                ? Math.min(100, requestedTopN)
                : unifiedConfig_1.config.SECURITY_METRICS.TOP_N;
            const metrics = await (0, securityMetrics_1.calculateSecurityMetrics)(database_1.prisma, {
                windowHours: effectiveWindowHours,
                topN: effectiveTopN,
            });
            return res.json(metrics);
        }
        catch (error) {
            console.error('[Security] getMetrics error:', error);
            return res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
    static async getMetricsHistory(req, res) {
        try {
            const { windowHours, limit, startTime, endTime } = req.query;
            const requestedWindowHours = Number.parseInt(windowHours || '', 10);
            const effectiveWindowHours = Number.isFinite(requestedWindowHours) && requestedWindowHours > 0
                ? Math.min(24 * 14, requestedWindowHours)
                : undefined;
            const metrics = await (0, securityMetrics_1.listSecurityMetricsHistory)(database_1.prisma, {
                windowHours: effectiveWindowHours,
                limit: Number.parseInt(limit || '50', 10),
                startTime: startTime ? new Date(startTime) : undefined,
                endTime: endTime ? new Date(endTime) : undefined,
            });
            return res.json(metrics);
        }
        catch (error) {
            console.error('[Security] getMetricsHistory error:', error);
            return res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
    static async createSnapshot(req, res) {
        try {
            const snapshot = await (0, securityMetrics_1.createSecurityMetricsSnapshot)(database_1.prisma, {
                windowHours: unifiedConfig_1.config.SECURITY_METRICS.WINDOW_HOURS,
                topN: unifiedConfig_1.config.SECURITY_METRICS.TOP_N,
            });
            return res.status(201).json(snapshot);
        }
        catch (error) {
            console.error('[Security] createSnapshot error:', error);
            return res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
}
exports.SecurityController = SecurityController;
