import { app, prisma } from './index';
import { AuditService } from './services/AuditService';
import { config } from './config/unifiedConfig';
import { initProviders } from './providers/ProviderFactory';
import {
    createSecurityMetricsSnapshot,
    pruneSecurityMetricsSnapshots
} from './services/securityMetrics';
import { guaritaEventServer } from './services/NiceGuaritaProtocol';
import { NiceGuaritaService, setPassbackBroadcast } from './services/NiceGuaritaService';
import { broadcastPassbackAlert } from './routes/guarita-passback.routes';
import { facialAccessEventWatcher } from './services/FacialAccessEventWatcher';
import { DeviceStatusService } from './services/DeviceStatusService';
import { HikCentralSyncQueueService } from './services/HikCentralSyncQueueService';

const port = process.env.PORT || 3001;

// Global settings from process.env (passed from index.ts or handled here)
const SESSION_AUDIT_PRUNE_INTERVAL_MINUTES = Number(process.env.SESSION_AUDIT_PRUNE_INTERVAL_MINUTES || '60');
const SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES = Number(process.env.SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES || '15');
const SECURITY_METRICS_WINDOW_HOURS = Number(process.env.SECURITY_METRICS_WINDOW_HOURS || '24');
const SECURITY_METRICS_TOP_N = Number(process.env.SECURITY_METRICS_TOP_N || '10');
const SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS = Number(process.env.SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS || '30');

initProviders();

app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Backend API running on http://0.0.0.0:${port}`);

    // ── Start Nice Guarita MG3000 event listener ─────────────────────────
    setPassbackBroadcast(broadcastPassbackAlert);
    guaritaEventServer.start();
    guaritaEventServer.on('access_event', (event) => {
        void NiceGuaritaService.handleAccessEvent(event);
    });
    guaritaEventServer.on('server_error', (err: Error) => {
        console.error('[NiceGuarita] Event server error:', err.message);
    });
    // ─────────────────────────────────────────────────────────────────────

    // ── Cache de status de dispositivos (dashboard/página de status) ──────
    DeviceStatusService.startBackgroundRefresh();
    // ─────────────────────────────────────────────────────────────────────

    // ── Terminais/controladoras faciais Hikvision: alertStream por device ─
    void facialAccessEventWatcher.sync().catch((err: any) =>
        console.error('[FacialAccess] Falha ao iniciar event watchers:', err?.message || err));
    setInterval(() => {
        void facialAccessEventWatcher.sync().catch((err: any) =>
            console.error('[FacialAccess] Falha ao reconciliar event watchers:', err?.message || err));
    }, 60_000);
    // ─────────────────────────────────────────────────────────────────────

    // ── Fila de sincronização assíncrona com o HikCentral (push local -> HikCentral) ──
    void HikCentralSyncQueueService.drainOnce().catch((err: any) =>
        console.error('[HikCentralSyncQueue] Falha no drain inicial:', err?.message || err));
    setInterval(() => {
        void HikCentralSyncQueueService.drainOnce().catch((err: any) =>
            console.error('[HikCentralSyncQueue] Falha no drain periódico:', err?.message || err));
    }, 30_000);
    // ─────────────────────────────────────────────────────────────────────

    if (SESSION_AUDIT_PRUNE_INTERVAL_MINUTES === 0) {
        console.log('Session audit retention job disabled (SESSION_AUDIT_PRUNE_INTERVAL_MINUTES=0)');
    } else {
        let pruneInFlight = false;
        const runPrune = async () => {
            if (pruneInFlight) return;
            pruneInFlight = true;
            try {
                await AuditService.pruneSessionAuditEvents(prisma, config.SESSION_AUDIT.RETENTION_DAYS);
            } catch (error: any) {
                console.error('Session audit prune job error:', error?.message || error);
            } finally {
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
    } else {
        let snapshotInFlight = false;
        const runSnapshot = async () => {
            if (snapshotInFlight) return;
            snapshotInFlight = true;
            try {
                const { snapshot, metrics } = await createSecurityMetricsSnapshot(prisma, {
                    windowHours: SECURITY_METRICS_WINDOW_HOURS,
                    topN: SECURITY_METRICS_TOP_N,
                });
                const pruneResult = await pruneSecurityMetricsSnapshots(
                    prisma,
                    SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS,
                );
                console.log(
                    JSON.stringify({
                        action: 'collect_security_metrics_snapshot',
                        snapshotId: snapshot.id,
                        windowHours: snapshot.windowHours,
                        topN: snapshot.topN,
                        attempts: metrics.login.attempts,
                        failedAttempts: metrics.login.failedAttempts,
                        failureRate: metrics.login.failureRate,
                        prunedSnapshots: pruneResult.deleted,
                        timestamp: new Date().toISOString(),
                    }),
                );
            } catch (error: any) {
                console.error('Security metrics snapshot job error:', error?.message || error);
            } finally {
                snapshotInFlight = false;
            }
        };

        void runSnapshot();
        setInterval(() => {
            void runSnapshot();
        }, SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES * 60 * 1000);
    }
});
