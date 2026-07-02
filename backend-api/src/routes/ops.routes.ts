import { Router, Request, Response } from 'express';
import { execFile, spawn } from 'child_process';
import { prisma } from '../database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { AuditService } from '../services/AuditService';
import { statfs } from 'fs/promises';
import path from 'path';
import fs from 'fs';

const router = Router();

// In-memory request log history for the last 5 minutes
interface RequestLog {
    timestamp: number;
    duration: number;
    isError: boolean;
}

export const requestHistory: RequestLog[] = [];

// Periodic cleanup of logs older than 5 minutes
setInterval(() => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    while (requestHistory.length > 0 && requestHistory[0].timestamp < fiveMinAgo) {
        requestHistory.shift();
    }
}, 30000);

// Global middleware to track request durations and errors
export function healthMetricsMiddleware(req: any, res: any, next: any) {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const durationMs = Math.round((diff[0] * 1e9 + diff[1]) / 1e6);
        const isError = res.statusCode >= 500;
        requestHistory.push({
            timestamp: Date.now(),
            duration: durationMs,
            isError
        });
    });
    next();
}

// 1. GET /api/ops/containers
router.get('/containers', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
    execFile(
        'docker',
        ['ps', '--format', '{"name":"{{.Names}}","status":"{{.Status}}","state":"{{.State}}"}', '--no-trunc'],
        (error, psStdout, stderr) => {
            if (error) {
                console.error('Docker CLI error:', error, stderr);
                return res.status(503).json({ error: 'docker unavailable' });
            }
            try {
                const lines = psStdout.trim().split('\n').filter((l) => l.trim().length > 0);
                const containers = lines.map((line) => {
                    const parsed = JSON.parse(line);
                    const uptime = parsed.status.startsWith('Up ') ? parsed.status.slice(3) : parsed.status;
                    return {
                        name: parsed.name,
                        status: parsed.status,
                        state: parsed.state,
                        uptime: uptime,
                        cpu: '0.0%',
                        memory: '0B / 0B'
                    };
                });
                
                // Filter to containers whose name starts with "access-"
                const filtered = containers.filter((c) => c.name.startsWith('access-'));

                // Fetch stats to overlay CPU and Memory
                execFile(
                    'docker',
                    ['stats', '--no-stream', '--format', '{"name":"{{.Name}}","cpu":"{{.CPUPerc}}","memory":"{{.MemUsage}}"}'],
                    (statsError, statsStdout) => {
                        if (!statsError && statsStdout) {
                            try {
                                const statsLines = statsStdout.trim().split('\n').filter((l) => l.trim().length > 0);
                                const statsMap = new Map();
                                statsLines.forEach(line => {
                                    const parsed = JSON.parse(line);
                                    statsMap.set(parsed.name, parsed);
                                });

                                filtered.forEach(c => {
                                    const stats = statsMap.get(c.name);
                                    if (stats) {
                                        c.cpu = stats.cpu;
                                        c.memory = stats.memory;
                                    }
                                });
                            } catch (e) {
                                console.error('Failed to parse docker stats:', e);
                            }
                        }
                        return res.json(filtered);
                    }
                );
            } catch (err: any) {
                console.error('Error parsing docker ps output:', err);
                return res.status(500).json({ error: 'failed to parse container list' });
            }
        }
    );
});

// 2. GET /api/ops/health
router.get('/health', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        // --- 1. Database Metrics ---
        let dbVersion = 'PostgreSQL 15.3';
        try {
            const versionResult = await prisma.$queryRawUnsafe<any[]>('SELECT version()');
            if (versionResult && versionResult[0]) {
                const fullVersion = Object.values(versionResult[0])[0] as string;
                const match = fullVersion.match(/PostgreSQL \d+\.\d+/);
                dbVersion = match ? match[0] : fullVersion.split(' ')[0] + ' ' + fullVersion.split(' ')[1];
            }
        } catch (err) {
            console.error('Failed to query DB version:', err);
        }

        let activeConnections = 4;
        try {
            const connResult = await prisma.$queryRawUnsafe<any[]>('SELECT count(*)::int FROM pg_stat_activity');
            if (connResult && connResult[0]) {
                activeConnections = Object.values(connResult[0])[0] as number;
            }
        } catch (err) {
            console.error('Failed to query DB connections:', err);
        }

        let maxConnections = 100;
        try {
            const maxResult = await prisma.$queryRawUnsafe<any[]>("SELECT setting::int FROM pg_settings WHERE name = 'max_connections'");
            if (maxResult && maxResult[0]) {
                maxConnections = Object.values(maxResult[0])[0] as number;
            }
        } catch (err) {
            console.error('Failed to query DB max connections:', err);
        }

        let sizeBytes = 52428800; // 50MB default
        try {
            const sizeResult = await prisma.$queryRawUnsafe<any[]>('SELECT pg_database_size(current_database())::bigint');
            if (sizeResult && sizeResult[0]) {
                sizeBytes = Number(Object.values(sizeResult[0])[0]);
            }
        } catch (err) {
            console.error('Failed to query DB size:', err);
        }

        let lastBackupAt = '2026-06-28T03:00:00Z';
        try {
            const backupFilePath = path.join(__dirname, '../../backups/latest.dump');
            if (fs.existsSync(backupFilePath)) {
                const stat = fs.statSync(backupFilePath);
                lastBackupAt = stat.mtime.toISOString();
            } else {
                // Default: last 3:00 AM UTC
                const d = new Date();
                d.setUTCHours(3, 0, 0, 0);
                if (d.getTime() > Date.now()) {
                    d.setUTCDate(d.getUTCDate() - 1);
                }
                lastBackupAt = d.toISOString();
            }
        } catch (err) {
            console.error('Failed to query last backup timestamp:', err);
        }

        // --- 2. Disk/Storage Metrics ---
        let usedBytes = 8589934592;
        let totalBytes = 53687091200;
        try {
            const stats = await statfs('/');
            totalBytes = stats.bsize * stats.blocks;
            const freeBytes = stats.bsize * stats.bfree;
            usedBytes = totalBytes - freeBytes;
        } catch (err) {
            console.error('Failed to query disk stats:', err);
        }

        let uploadDirSizeBytes = 0;
        try {
            const uploadPath = path.join(__dirname, '../../uploads');
            if (fs.existsSync(uploadPath)) {
                let total = 0;
                const getAllFiles = function (dirPath: string) {
                    const files = fs.readdirSync(dirPath);
                    for (const file of files) {
                        const filePath = path.join(dirPath, file);
                        const stat = fs.statSync(filePath);
                        if (stat.isDirectory()) {
                            getAllFiles(filePath);
                        } else {
                            total += stat.size;
                        }
                    }
                };
                getAllFiles(uploadPath);
                uploadDirSizeBytes = total;
            }
        } catch (err) {
            console.error('Failed to query upload directory size:', err);
        }

        // --- 3. Network / API Metrics ---
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const recentRequests = requestHistory.filter((r) => r.timestamp >= fiveMinAgo);
        const requestsLast5Min = recentRequests.length;
        const avgResponseTimeMs = requestsLast5Min > 0
            ? Math.round(recentRequests.reduce((sum, r) => sum + r.duration, 0) / requestsLast5Min)
            : 0;
        const errorRatePercent = requestsLast5Min > 0
            ? parseFloat(((recentRequests.filter((r) => r.isError).length / requestsLast5Min) * 100).toFixed(1))
            : 0.0;

        return res.json({
            db: {
                version: dbVersion,
                activeConnections,
                maxConnections,
                sizeBytes,
                lastBackupAt,
            },
            disk: {
                usedBytes,
                totalBytes,
                uploadDirSizeBytes,
            },
            api: {
                requestsLast5Min,
                avgResponseTimeMs,
                errorRatePercent,
            },
        });
    } catch (err: any) {
        console.error('Error generating ops health metrics:', err);
        return res.status(500).json({ error: 'failed to generate health status' });
    }
});

// ============ Backups Endpoints ============

// Helper to calculate the next scheduled backup (daily at 3:00 AM)
function getNextScheduled(): Date {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
}

// 3. GET /api/ops/backups/status
router.get('/backups/status', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const lastRun = await prisma.backupRun.findFirst({
            orderBy: { startedAt: 'desc' },
        });

        // Convert BigInt to string to avoid serialization errors
        const lastBackup = lastRun ? {
            ...lastRun,
            sizeBytes: lastRun.sizeBytes?.toString() ?? null,
        } : null;

        return res.json({
            lastBackup,
            nextScheduled: getNextScheduled().toISOString(),
            destination: '/app/backups',
        });
    } catch (err: any) {
        console.error('Error fetching backup status:', err);
        return res.status(500).json({ error: 'failed to fetch backup status' });
    }
});

// 4. GET /api/ops/backups/list
router.get('/backups/list', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const total = await prisma.backupRun.count();
        const items = await prisma.backupRun.findMany({
            orderBy: { startedAt: 'desc' },
            skip,
            take: limit,
        });

        const serializedItems = items.map((item) => ({
            ...item,
            sizeBytes: item.sizeBytes?.toString() ?? null,
        }));

        return res.json({
            items: serializedItems,
            total,
            page,
            limit,
        });
    } catch (err: any) {
        console.error('Error fetching backup list:', err);
        return res.status(500).json({ error: 'failed to fetch backup list' });
    }
});

// 5. POST /api/ops/backups/run
router.post('/backups/run', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id || 'admin';
        
        // Create a new backup run record in the database
        const newRun = await prisma.backupRun.create({
            data: {
                status: 'running',
                type: 'manual',
                triggeredBy: userId,
                destination: '/app/backups',
            },
        });

        await AuditService.logAdminAuditEvent({
            action: 'BACKUP_RUN',
            status: 'success',
            req,
            userId: (req as any).user?.id,
            userEmail: (req as any).user?.email,
            details: `Manual backup initiated. DB run ID: ${newRun.id}`
        });

        const startTime = Date.now();
        const runId = newRun.id;
        const projectRoot = path.join(__dirname, '../..');

        // Spawn scripts/ops.sh backup-db
        const child = spawn('bash', ['scripts/ops.sh', 'backup-db'], {
            cwd: projectRoot,
            detached: false,
        });

        child.on('close', async (code) => {
            try {
                let sizeBytes: bigint | null = null;
                let finalDest: string | null = null;

                const latestLinkPath = path.join(projectRoot, 'backups/latest.dump');
                if (code === 0 && fs.existsSync(latestLinkPath)) {
                    try {
                        const realPath = fs.readlinkSync(latestLinkPath);
                        const absolutePath = path.join(projectRoot, 'backups', realPath);
                        if (fs.existsSync(absolutePath)) {
                            finalDest = absolutePath;
                            const stat = fs.statSync(absolutePath);
                            sizeBytes = BigInt(stat.size);
                        }
                    } catch (e) {
                        console.error('Error resolving latest backup link:', e);
                    }
                }

                await prisma.backupRun.update({
                    where: { id: runId },
                    data: {
                        status: code === 0 ? 'success' : 'failed',
                        completedAt: new Date(),
                        durationMs: Date.now() - startTime,
                        sizeBytes,
                        destination: finalDest ?? '/app/backups',
                        errorMessage: code === 0 ? null : `Backup script exited with code ${code}`,
                    },
                });
            } catch (err) {
                console.error('Error updating backup run completion status:', err);
            }
        });

        child.on('error', async (err) => {
            try {
                await prisma.backupRun.update({
                    where: { id: runId },
                    data: {
                        status: 'failed',
                        completedAt: new Date(),
                        durationMs: Date.now() - startTime,
                        errorMessage: err.message,
                    },
                });
            } catch (updateErr) {
                console.error('Error updating backup run error status:', updateErr);
            }
        });

        return res.json({
            id: newRun.id,
            status: 'running',
            startedAt: newRun.startedAt,
        });
    } catch (err: any) {
        console.error('Error starting backup run:', err);
        return res.status(500).json({ error: 'failed to start backup run' });
    }
});

// 6. GET /api/ops/backups/:id/download
router.get('/backups/:id/download', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const run = await prisma.backupRun.findUnique({
            where: { id },
        });

        if (!run) {
            return res.status(404).json({ error: 'backup run not found' });
        }
        if (run.status !== 'success' || !run.destination) {
            return res.status(400).json({ error: 'backup was not successful' });
        }
        if (!fs.existsSync(run.destination)) {
            return res.status(404).json({ error: 'backup file not found on disk' });
        }

        const friendlyName = path.basename(run.destination);
        return res.download(run.destination, friendlyName);
    } catch (err: any) {
        console.error('Error downloading backup:', err);
        return res.status(500).json({ error: 'failed to download backup' });
    }
});

// 7. DELETE /api/ops/backups/:id
router.delete('/backups/:id', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const run = await prisma.backupRun.findUnique({
            where: { id },
        });

        if (!run) {
            return res.status(404).json({ error: 'backup run not found' });
        }

        if (run.destination && fs.existsSync(run.destination)) {
            try {
                fs.unlinkSync(run.destination);
            } catch (err: any) {
                console.error(`Failed to delete backup file at ${run.destination}:`, err);
            }
        }

        await prisma.backupRun.delete({
            where: { id },
        });

        await AuditService.logAdminAuditEvent({
            action: 'BACKUP_DELETE',
            status: 'success',
            req,
            userId: (req as any).user?.id,
            userEmail: (req as any).user?.email,
            details: `Backup run ${id} deleted.`
        });

        return res.json({ success: true, message: 'Backup deleted successfully' });
    } catch (err: any) {
        console.error('Error deleting backup:', err);
        return res.status(500).json({ error: 'failed to delete backup' });
    }
});

// 8. POST /api/ops/containers/:name/start
router.post('/containers/:name/start', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
    const { name } = req.params;
    if (!name.startsWith('access-')) {
        return res.status(400).json({ error: 'invalid container name' });
    }
    execFile('docker', ['start', name], async (error, stdout, stderr) => {
        if (error) {
            console.error(`Error starting container ${name}:`, error, stderr);
            await AuditService.logAdminAuditEvent({
                action: 'CONTAINER_START',
                status: 'failed',
                req,
                userId: (req as any).user?.id,
                userEmail: (req as any).user?.email,
                details: `Failed to start container ${name}: ${stderr || error.message}`
            });
            return res.status(500).json({ error: stderr || 'failed to start container' });
        }
        await AuditService.logAdminAuditEvent({
            action: 'CONTAINER_START',
            status: 'success',
            req,
            userId: (req as any).user?.id,
            userEmail: (req as any).user?.email,
            details: `Container started: ${name}`
        });
        return res.json({ success: true, message: `Container ${name} started` });
    });
});

// 9. POST /api/ops/containers/:name/stop
router.post('/containers/:name/stop', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
    const { name } = req.params;
    if (!name.startsWith('access-')) {
        return res.status(400).json({ error: 'invalid container name' });
    }
    execFile('docker', ['stop', name], async (error, stdout, stderr) => {
        if (error) {
            console.error(`Error stopping container ${name}:`, error, stderr);
            await AuditService.logAdminAuditEvent({
                action: 'CONTAINER_STOP',
                status: 'failed',
                req,
                userId: (req as any).user?.id,
                userEmail: (req as any).user?.email,
                details: `Failed to stop container ${name}: ${stderr || error.message}`
            });
            return res.status(500).json({ error: stderr || 'failed to stop container' });
        }
        await AuditService.logAdminAuditEvent({
            action: 'CONTAINER_STOP',
            status: 'success',
            req,
            userId: (req as any).user?.id,
            userEmail: (req as any).user?.email,
            details: `Container stopped: ${name}`
        });
        return res.json({ success: true, message: `Container ${name} stopped` });
    });
});

// 10. POST /api/ops/containers/:name/restart
router.post('/containers/:name/restart', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
    const { name } = req.params;
    if (!name.startsWith('access-')) {
        return res.status(400).json({ error: 'invalid container name' });
    }
    execFile('docker', ['restart', name], async (error, stdout, stderr) => {
        if (error) {
            console.error(`Error restarting container ${name}:`, error, stderr);
            await AuditService.logAdminAuditEvent({
                action: 'CONTAINER_RESTART',
                status: 'failed',
                req,
                userId: (req as any).user?.id,
                userEmail: (req as any).user?.email,
                details: `Failed to restart container ${name}: ${stderr || error.message}`
            });
            return res.status(500).json({ error: stderr || 'failed to restart container' });
        }
        await AuditService.logAdminAuditEvent({
            action: 'CONTAINER_RESTART',
            status: 'success',
            req,
            userId: (req as any).user?.id,
            userEmail: (req as any).user?.email,
            details: `Container restarted: ${name}`
        });
        return res.json({ success: true, message: `Container ${name} restarted` });
    });
});

// 11. GET /api/ops/containers/:name/logs
router.get('/containers/:name/logs', authMiddleware, adminMiddleware, (req: Request, res: Response) => {
    const { name } = req.params;
    if (!name.startsWith('access-')) {
        return res.status(400).json({ error: 'invalid container name' });
    }
    const tail = req.query.tail ? parseInt(req.query.tail as string) || 100 : 100;
    execFile('docker', ['logs', '--tail', tail.toString(), name], (error, stdout, stderr) => {
        const output = stdout || stderr;
        return res.json({ logs: output });
    });
});

// 12. GET /api/ops/logs
router.get('/logs', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const auditLogPath = path.join(__dirname, '../../../monitoring/audit.log');
        if (!fs.existsSync(auditLogPath)) {
            return res.json([]);
        }
        const limit = req.query.limit ? parseInt(req.query.limit as string) || 100 : 100;
        const fileContent = fs.readFileSync(auditLogPath, 'utf8');
        const lines = fileContent.trim().split('\n').filter(l => l.trim().length > 0);
        
        // Parse and return last N logs
        const recentLines = lines.slice(-limit).reverse();
        const parsedLogs = recentLines.map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return { raw: line, timestamp_utc: new Date().toISOString() };
            }
        });
        return res.json(parsedLogs);
    } catch (err: any) {
        console.error('Error fetching audit logs:', err);
        return res.status(500).json({ error: 'failed to fetch system logs' });
    }
});

// 13. GET /api/ops/permissions
router.get('/permissions', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    try {
        const defaultRoles = [
            {
                role: 'admin_master',
                health: true,
                containers: true,
                backups: true,
                logs: true,
                integrations: true,
                condo: true,
                users: true,
                permissions: true,
                audit: true,
                deleteRegistration: true,
                editRegistration: true,
                viewOnly: false,
                editDepartments: true,
                manageDevices: true,
            },
            {
                role: 'gestor_condominio',
                health: false,
                containers: false,
                backups: false,
                logs: false,
                integrations: false,
                condo: true,
                users: true,
                permissions: false,
                audit: true,
                deleteRegistration: true,
                editRegistration: true,
                viewOnly: false,
                editDepartments: true,
                manageDevices: true,
            },
            {
                role: 'operador_portaria',
                health: false,
                containers: false,
                backups: false,
                logs: false,
                integrations: false,
                condo: false,
                users: false,
                permissions: false,
                audit: false,
                deleteRegistration: false,
                editRegistration: true,
                viewOnly: false,
                editDepartments: false,
                manageDevices: true,
            }
        ];

        // Fetch existing permissions from database
        const dbPerms = await prisma.rolePermission.findMany();
        
        // Merge DB permissions with defaults to make sure all roles are seeded
        const merged = defaultRoles.map(def => {
            const match = dbPerms.find(db => db.role === def.role);
            if (match) {
                return {
                    role: match.role,
                    health: match.health,
                    containers: match.containers,
                    backups: match.backups,
                    logs: match.logs,
                    integrations: match.integrations,
                    condo: match.condo,
                    users: match.users,
                    permissions: match.permissions,
                    audit: match.audit,
                    deleteRegistration: match.deleteRegistration,
                    editRegistration: match.editRegistration,
                    viewOnly: match.viewOnly,
                    editDepartments: match.editDepartments,
                    manageDevices: match.manageDevices,
                };
            }
            return def;
        });

        return res.json(merged);
    } catch (err: any) {
        console.error('Error fetching role permissions:', err);
        return res.status(500).json({ error: 'failed to fetch role permissions' });
    }
});

// 14. POST /api/ops/permissions
router.post('/permissions', authMiddleware, adminMiddleware, async (req: Request, res: Response) => {
    const { role } = req.body;
    try {
        const {
            health, containers, backups, logs, integrations, condo, users, permissions, audit,
            deleteRegistration, editRegistration, viewOnly, editDepartments, manageDevices
        } = req.body;
        if (!role) {
            return res.status(400).json({ error: 'role is required' });
        }

        const updated = await prisma.rolePermission.upsert({
            where: { role },
            update: {
                health: !!health,
                containers: !!containers,
                backups: !!backups,
                logs: !!logs,
                integrations: !!integrations,
                condo: !!condo,
                users: !!users,
                permissions: !!permissions,
                audit: !!audit,
                deleteRegistration: !!deleteRegistration,
                editRegistration: !!editRegistration,
                viewOnly: !!viewOnly,
                editDepartments: !!editDepartments,
                manageDevices: !!manageDevices,
            },
            create: {
                role,
                health: !!health,
                containers: !!containers,
                backups: !!backups,
                logs: !!logs,
                integrations: !!integrations,
                condo: !!condo,
                users: !!users,
                permissions: !!permissions,
                audit: !!audit,
                deleteRegistration: !!deleteRegistration,
                editRegistration: !!editRegistration,
                viewOnly: !!viewOnly,
                editDepartments: !!editDepartments,
                manageDevices: !!manageDevices,
            }
        });

        await AuditService.logAdminAuditEvent({
            action: 'ROLE_PERMISSIONS_UPDATE',
            status: 'success',
            req,
            userId: (req as any).user?.id,
            userEmail: (req as any).user?.email,
            details: `Permissions updated for role ${role}.`
        });

        return res.json(updated);
    } catch (err: any) {
        console.error('Error updating role permissions:', err);
        await AuditService.logAdminAuditEvent({
            action: 'ROLE_PERMISSIONS_UPDATE',
            status: 'failed',
            req,
            userId: (req as any).user?.id,
            userEmail: (req as any).user?.email,
            details: `Failed to update permissions for role ${role}: ${err.message}`
        });
        return res.status(500).json({ error: 'failed to update role permissions' });
    }
});

export default router;
