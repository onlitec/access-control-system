"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertService = void 0;
const db_1 = require("../db");
class AlertService {
    /**
     * Scan recent audit logs for security threats.
     * Triggered by cron or after login failures.
     */
    static async detectThreats() {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        // 1. Detect brute force (many failures from same IP)
        const bruteForceAttempts = await db_1.prisma.sessionAuditEvent.groupBy({
            by: ['ipAddress'],
            where: {
                eventType: 'login',
                success: false,
                createdAt: { gte: fiveMinutesAgo },
                ipAddress: { not: null }
            },
            _count: {
                _all: true
            },
            having: {
                ipAddress: {
                    _count: {
                        gt: 5
                    }
                }
            }
        });
        for (const attempt of bruteForceAttempts) {
            this.triggerAlert({
                type: 'SECURITY',
                severity: 'HIGH',
                message: `Possível ataque de força bruta detectado do IP: ${attempt.ipAddress} (${attempt._count?._all || 0} falhas nos últimos 5 min)`,
            });
        }
        // 2. Detect multiple account failures (same IP, different emails)
        // ... more complex logic ...
    }
    static triggerAlert(payload) {
        const alert = {
            ...payload,
            id: crypto.randomUUID(),
            timestamp: new Date(),
            resolved: false
        };
        // In production, this would send an email, webhook, or push notification.
        console.error(`[ALERT][${alert.severity}] ${alert.message}`);
        // We could also store alerts in a DB table if it existed.
        return alert;
    }
    /**
     * Check HikCentral connectivity and response times.
     */
    static async checkHikCentralHealth(responseTimeMs) {
        if (responseTimeMs > 5000) {
            this.triggerAlert({
                type: 'HIKCENTRAL',
                severity: 'MEDIUM',
                message: `Latência alta detectada na integração HikCentral: ${responseTimeMs}ms`,
            });
        }
    }
}
exports.AlertService = AlertService;
