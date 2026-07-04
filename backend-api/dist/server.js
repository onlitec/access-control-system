"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const AuditService_1 = require("./services/AuditService");
const unifiedConfig_1 = require("./config/unifiedConfig");
const ProviderFactory_1 = require("./providers/ProviderFactory");
const securityMetrics_1 = require("./services/securityMetrics");
const NiceGuaritaProtocol_1 = require("./services/NiceGuaritaProtocol");
const NiceGuaritaService_1 = require("./services/NiceGuaritaService");
const guarita_passback_routes_1 = require("./routes/guarita-passback.routes");
const port = process.env.PORT || 3001;
// Global settings from process.env (passed from index.ts or handled here)
const SESSION_AUDIT_PRUNE_INTERVAL_MINUTES = Number(process.env.SESSION_AUDIT_PRUNE_INTERVAL_MINUTES || '60');
const SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES = Number(process.env.SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES || '15');
const SECURITY_METRICS_WINDOW_HOURS = Number(process.env.SECURITY_METRICS_WINDOW_HOURS || '24');
const SECURITY_METRICS_TOP_N = Number(process.env.SECURITY_METRICS_TOP_N || '10');
const SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS = Number(process.env.SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS || '30');
(0, ProviderFactory_1.initProviders)();
index_1.app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Backend API running on http://0.0.0.0:${port}`);
    // ── Start Nice Guarita MG3000 event listener ─────────────────────────
    (0, NiceGuaritaService_1.setPassbackBroadcast)(guarita_passback_routes_1.broadcastPassbackAlert);
    NiceGuaritaProtocol_1.guaritaEventServer.start();
    NiceGuaritaProtocol_1.guaritaEventServer.on('access_event', (event) => {
        void NiceGuaritaService_1.NiceGuaritaService.handleAccessEvent(event);
    });
    NiceGuaritaProtocol_1.guaritaEventServer.on('server_error', (err) => {
        console.error('[NiceGuarita] Event server error:', err.message);
    });
    // ─────────────────────────────────────────────────────────────────────
    if (SESSION_AUDIT_PRUNE_INTERVAL_MINUTES === 0) {
        console.log('Session audit retention job disabled (SESSION_AUDIT_PRUNE_INTERVAL_MINUTES=0)');
    }
    else {
        let pruneInFlight = false;
        const runPrune = async () => {
            if (pruneInFlight)
                return;
            pruneInFlight = true;
            try {
                await AuditService_1.AuditService.pruneSessionAuditEvents(index_1.prisma, unifiedConfig_1.config.SESSION_AUDIT.RETENTION_DAYS);
            }
            catch (error) {
                console.error('Session audit prune job error:', error?.message || error);
            }
            finally {
                pruneInFlight = false;
            }
        };
        void runPrune();
        setInterval(() => {
            void runPrune();
        }, SESSION_AUDIT_PRUNE_INTERVAL_MINUTES * 60 * 1000);
    }
    if (SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES === 0) {
        console.log('Security metrics snapshot job disabled (SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES=0)');
    }
    else {
        let snapshotInFlight = false;
        const runSnapshot = async () => {
            if (snapshotInFlight)
                return;
            snapshotInFlight = true;
            try {
                const { snapshot, metrics } = await (0, securityMetrics_1.createSecurityMetricsSnapshot)(index_1.prisma, {
                    windowHours: SECURITY_METRICS_WINDOW_HOURS,
                    topN: SECURITY_METRICS_TOP_N,
                });
                const pruneResult = await (0, securityMetrics_1.pruneSecurityMetricsSnapshots)(index_1.prisma, SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS);
                console.log(JSON.stringify({
                    action: 'collect_security_metrics_snapshot',
                    snapshotId: snapshot.id,
                    windowHours: snapshot.windowHours,
                    topN: snapshot.topN,
                    attempts: metrics.login.attempts,
                    failedAttempts: metrics.login.failedAttempts,
                    failureRate: metrics.login.failureRate,
                    prunedSnapshots: pruneResult.deleted,
                    timestamp: new Date().toISOString(),
                }));
            }
            catch (error) {
                console.error('Security metrics snapshot job error:', error?.message || error);
            }
            finally {
                snapshotInFlight = false;
            }
        };
        void runSnapshot();
        setInterval(() => {
            void runSnapshot();
        }, SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES * 60 * 1000);
    }
});
