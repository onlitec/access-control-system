"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestHistory = void 0;
exports.healthMetricsMiddleware = healthMetricsMiddleware;
const express_1 = require("express");
const child_process_1 = require("child_process");
const node_fetch_1 = __importDefault(require("node-fetch"));
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const AuditService_1 = require("../services/AuditService");
const WindowsServiceControl_1 = require("../services/WindowsServiceControl");
const unifiedConfig_1 = require("../config/unifiedConfig");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const router = (0, express_1.Router)();
// Layout da instalação Windows (C:\OnliAcesso): o serviço da API roda com
// cwd = <install>\apps\backend-api, então <install> = ../.. do cwd.
// Tudo é sobreponível por env (gerado pelo install.ps1).
const BACKUP_DIR = process.env.BACKUP_DIR || path_1.default.resolve(process.cwd(), '../../backups');
const PG_BIN = process.env.PG_BIN || path_1.default.resolve(process.cwd(), '../../binaries/pgsql/bin');
// WinSW v3 grava <serviço>.out.log/.err.log ao lado do exe do serviço
const SERVICE_LOGS_DIR = process.env.SERVICE_LOGS_DIR || path_1.default.resolve(process.cwd(), '../../services');
exports.requestHistory = [];
// Periodic cleanup of logs older than 5 minutes
setInterval(() => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    while (exports.requestHistory.length > 0 && exports.requestHistory[0].timestamp < fiveMinAgo) {
        exports.requestHistory.shift();
    }
}, 30000);
// Global middleware to track request durations and errors
function healthMetricsMiddleware(req, res, next) {
    const start = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(start);
        const durationMs = Math.round((diff[0] * 1e9 + diff[1]) / 1e6);
        const isError = res.statusCode >= 500;
        exports.requestHistory.push({
            timestamp: Date.now(),
            duration: durationMs,
            isError
        });
    });
    next();
}
// 1. GET /api/ops/services — status dos serviços Windows do OnliAcesso
router.get('/services', auth_1.authMiddleware, auth_1.adminMiddleware, async (_req, res) => {
    try {
        const services = await (0, WindowsServiceControl_1.listServices)();
        return res.json(services);
    }
    catch (err) {
        console.error('Error listing Windows services:', err?.message || err);
        return res.status(500).json({ error: 'falha ao consultar os serviços do Windows' });
    }
});
// 2. POST /api/ops/services/:name/restart
router.post('/services/:name/restart', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
    const { name } = req.params;
    if (!(0, WindowsServiceControl_1.isAllowedService)(name)) {
        return res.status(400).json({ error: 'serviço inválido' });
    }
    try {
        const result = await (0, WindowsServiceControl_1.restartService)(name);
        await AuditService_1.AuditService.logAdminAuditEvent({
            action: 'SERVICE_RESTART',
            status: 'success',
            req,
            userId: req.user?.id,
            userEmail: req.user?.email,
            details: `Serviço ${name} reiniciado (${result.mode}).`,
        });
        return res.status(result.mode === 'deferred' ? 202 : 200).json({
            success: true,
            mode: result.mode,
            message: result.message,
        });
    }
    catch (err) {
        console.error(`Error restarting service ${name}:`, err?.message || err);
        await AuditService_1.AuditService.logAdminAuditEvent({
            action: 'SERVICE_RESTART',
            status: 'failed',
            req,
            userId: req.user?.id,
            userEmail: req.user?.email,
            details: `Falha ao reiniciar ${name}: ${err?.message || err}`,
        });
        return res.status(500).json({ error: `falha ao reiniciar o serviço ${name}` });
    }
});
// 2. GET /api/ops/health
router.get('/health', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
    try {
        // --- 1. Database Metrics ---
        let dbVersion = 'PostgreSQL 15.3';
        try {
            const versionResult = await database_1.prisma.$queryRawUnsafe('SELECT version()');
            if (versionResult && versionResult[0]) {
                const fullVersion = Object.values(versionResult[0])[0];
                const match = fullVersion.match(/PostgreSQL \d+\.\d+/);
                dbVersion = match ? match[0] : fullVersion.split(' ')[0] + ' ' + fullVersion.split(' ')[1];
            }
        }
        catch (err) {
            console.error('Failed to query DB version:', err);
        }
        let activeConnections = 4;
        try {
            const connResult = await database_1.prisma.$queryRawUnsafe('SELECT count(*)::int FROM pg_stat_activity');
            if (connResult && connResult[0]) {
                activeConnections = Object.values(connResult[0])[0];
            }
        }
        catch (err) {
            console.error('Failed to query DB connections:', err);
        }
        let maxConnections = 100;
        try {
            const maxResult = await database_1.prisma.$queryRawUnsafe("SELECT setting::int FROM pg_settings WHERE name = 'max_connections'");
            if (maxResult && maxResult[0]) {
                maxConnections = Object.values(maxResult[0])[0];
            }
        }
        catch (err) {
            console.error('Failed to query DB max connections:', err);
        }
        let sizeBytes = 52428800; // 50MB default
        try {
            const sizeResult = await database_1.prisma.$queryRawUnsafe('SELECT pg_database_size(current_database())::bigint');
            if (sizeResult && sizeResult[0]) {
                sizeBytes = Number(Object.values(sizeResult[0])[0]);
            }
        }
        catch (err) {
            console.error('Failed to query DB size:', err);
        }
        let lastBackupAt = null;
        try {
            const lastSuccess = await database_1.prisma.backupRun.findFirst({
                where: { status: 'success' },
                orderBy: { completedAt: 'desc' },
                select: { completedAt: true },
            });
            lastBackupAt = lastSuccess?.completedAt?.toISOString() ?? null;
        }
        catch (err) {
            console.error('Failed to query last backup timestamp:', err);
        }
        // --- 2. Disk/Storage Metrics ---
        let usedBytes = 8589934592;
        let totalBytes = 53687091200;
        try {
            // raiz do drive onde a aplicação está instalada (ex.: C:\)
            const driveRoot = path_1.default.parse(process.cwd()).root || '/';
            const stats = await (0, promises_1.statfs)(driveRoot);
            totalBytes = stats.bsize * stats.blocks;
            const freeBytes = stats.bsize * stats.bfree;
            usedBytes = totalBytes - freeBytes;
        }
        catch (err) {
            console.error('Failed to query disk stats:', err);
        }
        let uploadDirSizeBytes = 0;
        try {
            const uploadPath = path_1.default.join(__dirname, '../../uploads');
            if (fs_1.default.existsSync(uploadPath)) {
                let total = 0;
                const getAllFiles = function (dirPath) {
                    const files = fs_1.default.readdirSync(dirPath);
                    for (const file of files) {
                        const filePath = path_1.default.join(dirPath, file);
                        const stat = fs_1.default.statSync(filePath);
                        if (stat.isDirectory()) {
                            getAllFiles(filePath);
                        }
                        else {
                            total += stat.size;
                        }
                    }
                };
                getAllFiles(uploadPath);
                uploadDirSizeBytes = total;
            }
        }
        catch (err) {
            console.error('Failed to query upload directory size:', err);
        }
        // --- 3. Network / API Metrics ---
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const recentRequests = exports.requestHistory.filter((r) => r.timestamp >= fiveMinAgo);
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
    }
    catch (err) {
        console.error('Error generating ops health metrics:', err);
        return res.status(500).json({ error: 'failed to generate health status' });
    }
});
// ============ Backups Endpoints ============
// Helper to calculate the next scheduled backup (daily at 3:00 AM)
function getNextScheduled() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 0, 0, 0);
    if (next <= now)
        next.setDate(next.getDate() + 1);
    return next;
}
// 3. GET /api/ops/backups/status
router.get('/backups/status', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
    try {
        const lastRun = await database_1.prisma.backupRun.findFirst({
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
            destination: BACKUP_DIR,
        });
    }
    catch (err) {
        console.error('Error fetching backup status:', err);
        return res.status(500).json({ error: 'failed to fetch backup status' });
    }
});
// 4. GET /api/ops/backups/list
router.get('/backups/list', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const total = await database_1.prisma.backupRun.count();
        const items = await database_1.prisma.backupRun.findMany({
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
    }
    catch (err) {
        console.error('Error fetching backup list:', err);
        return res.status(500).json({ error: 'failed to fetch backup list' });
    }
});
// 5. POST /api/ops/backups/run — pg_dump.exe nativo (sem docker/bash)
// TODO: restore de backups pela interface (fora do escopo desta versão)
router.post('/backups/run', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id || 'admin';
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
            return res.status(500).json({ error: 'DATABASE_URL não configurada' });
        }
        const pgDumpExe = path_1.default.join(PG_BIN, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
        if (!fs_1.default.existsSync(pgDumpExe)) {
            return res.status(500).json({ error: `pg_dump não encontrado em ${PG_BIN}` });
        }
        const url = new URL(dbUrl);
        const dbHost = url.hostname || '127.0.0.1';
        const dbPort = url.port || '5432';
        const dbUser = decodeURIComponent(url.username || 'postgres');
        const dbPassword = decodeURIComponent(url.password || '');
        const dbName = (url.pathname || '/onliacesso').replace(/^\//, '') || 'onliacesso';
        fs_1.default.mkdirSync(BACKUP_DIR, { recursive: true });
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
        const outFile = path_1.default.join(BACKUP_DIR, `onliacesso-${ts}.dump`);
        const newRun = await database_1.prisma.backupRun.create({
            data: {
                status: 'running',
                type: 'manual',
                triggeredBy: userId,
                destination: outFile,
            },
        });
        await AuditService_1.AuditService.logAdminAuditEvent({
            action: 'BACKUP_RUN',
            status: 'success',
            req,
            userId: req.user?.id,
            userEmail: req.user?.email,
            details: `Manual backup initiated. DB run ID: ${newRun.id}`
        });
        const startTime = Date.now();
        const runId = newRun.id;
        const child = (0, child_process_1.spawn)(pgDumpExe, ['-h', dbHost, '-p', dbPort, '-U', dbUser, '-Fc', '-f', outFile, dbName], {
            env: { ...process.env, PGPASSWORD: dbPassword },
            windowsHide: true,
        });
        let stderrTail = '';
        child.stderr?.on('data', (chunk) => {
            stderrTail = (stderrTail + chunk.toString()).slice(-2000);
        });
        child.on('close', async (code) => {
            try {
                let sizeBytes = null;
                const ok = code === 0 && fs_1.default.existsSync(outFile);
                if (ok) {
                    sizeBytes = BigInt(fs_1.default.statSync(outFile).size);
                }
                await database_1.prisma.backupRun.update({
                    where: { id: runId },
                    data: {
                        status: ok ? 'success' : 'failed',
                        completedAt: new Date(),
                        durationMs: Date.now() - startTime,
                        sizeBytes,
                        destination: outFile,
                        errorMessage: ok ? null : `pg_dump saiu com código ${code}: ${stderrTail.trim()}`.slice(0, 1000),
                    },
                });
            }
            catch (err) {
                console.error('Error updating backup run completion status:', err);
            }
        });
        child.on('error', async (err) => {
            try {
                await database_1.prisma.backupRun.update({
                    where: { id: runId },
                    data: {
                        status: 'failed',
                        completedAt: new Date(),
                        durationMs: Date.now() - startTime,
                        errorMessage: err.message,
                    },
                });
            }
            catch (updateErr) {
                console.error('Error updating backup run error status:', updateErr);
            }
        });
        return res.json({
            id: newRun.id,
            status: 'running',
            startedAt: newRun.startedAt,
        });
    }
    catch (err) {
        console.error('Error starting backup run:', err);
        return res.status(500).json({ error: 'failed to start backup run' });
    }
});
// Garante que um destination registrado no banco aponte para dentro do
// diretório de backups (defesa contra registros adulterados)
function isInsideBackupDir(dest) {
    const resolved = path_1.default.resolve(dest);
    const base = path_1.default.resolve(BACKUP_DIR);
    return resolved === base || resolved.startsWith(base + path_1.default.sep);
}
// 6. GET /api/ops/backups/:id/download
router.get('/backups/:id/download', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const run = await database_1.prisma.backupRun.findUnique({
            where: { id },
        });
        if (!run) {
            return res.status(404).json({ error: 'backup run not found' });
        }
        if (run.status !== 'success' || !run.destination) {
            return res.status(400).json({ error: 'backup was not successful' });
        }
        if (!isInsideBackupDir(run.destination)) {
            return res.status(400).json({ error: 'invalid backup destination' });
        }
        if (!fs_1.default.existsSync(run.destination)) {
            return res.status(404).json({ error: 'backup file not found on disk' });
        }
        const friendlyName = path_1.default.basename(run.destination);
        return res.download(run.destination, friendlyName);
    }
    catch (err) {
        console.error('Error downloading backup:', err);
        return res.status(500).json({ error: 'failed to download backup' });
    }
});
// 7. DELETE /api/ops/backups/:id
router.delete('/backups/:id', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const run = await database_1.prisma.backupRun.findUnique({
            where: { id },
        });
        if (!run) {
            return res.status(404).json({ error: 'backup run not found' });
        }
        if (run.destination && isInsideBackupDir(run.destination) && fs_1.default.existsSync(run.destination)) {
            try {
                fs_1.default.unlinkSync(run.destination);
            }
            catch (err) {
                console.error(`Failed to delete backup file at ${run.destination}:`, err);
            }
        }
        await database_1.prisma.backupRun.delete({
            where: { id },
        });
        await AuditService_1.AuditService.logAdminAuditEvent({
            action: 'BACKUP_DELETE',
            status: 'success',
            req,
            userId: req.user?.id,
            userEmail: req.user?.email,
            details: `Backup run ${id} deleted.`
        });
        return res.json({ success: true, message: 'Backup deleted successfully' });
    }
    catch (err) {
        console.error('Error deleting backup:', err);
        return res.status(500).json({ error: 'failed to delete backup' });
    }
});
// 8. GET /api/ops/logs — logs dos serviços Windows (WinSW roll-by-size)
//    ?service=onliacesso-api&stream=out|err&limit=200
router.get('/logs', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
    try {
        const service = req.query.service || 'onliacesso-api';
        const stream = req.query.stream === 'err' ? 'err' : 'out';
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 1000);
        // allowlist evita path traversal via nome do serviço
        if (!(0, WindowsServiceControl_1.isAllowedService)(service)) {
            return res.status(400).json({ error: 'serviço inválido' });
        }
        const logPath = path_1.default.join(SERVICE_LOGS_DIR, `${service}.${stream}.log`);
        if (!fs_1.default.existsSync(logPath)) {
            return res.json([]);
        }
        const stat = fs_1.default.statSync(logPath);
        // lê no máximo os últimos 512 KB (suficiente para 1000 linhas)
        const readBytes = Math.min(stat.size, 512 * 1024);
        const fd = fs_1.default.openSync(logPath, 'r');
        const buf = Buffer.alloc(readBytes);
        try {
            fs_1.default.readSync(fd, buf, 0, readBytes, stat.size - readBytes);
        }
        finally {
            fs_1.default.closeSync(fd);
        }
        const fileMtime = stat.mtime.toISOString();
        const lines = buf.toString('utf8').split(/\r?\n/).filter((l) => l.trim().length > 0);
        const parsedLogs = lines.slice(-limit).reverse().map((line) => {
            // linhas JSON estruturadas são expandidas; as demais vão como raw
            try {
                const obj = JSON.parse(line);
                return typeof obj === 'object' && obj !== null
                    ? { timestamp_utc: fileMtime, ...obj }
                    : { raw: line, timestamp_utc: fileMtime };
            }
            catch {
                return { raw: line, timestamp_utc: fileMtime };
            }
        });
        return res.json(parsedLogs);
    }
    catch (err) {
        console.error('Error fetching service logs:', err);
        return res.status(500).json({ error: 'failed to fetch system logs' });
    }
});
// 9. GET /api/ops/update-check — compara APP_VERSION com o manifesto remoto
router.get('/update-check', auth_1.authMiddleware, auth_1.adminMiddleware, async (_req, res) => {
    try {
        const settings = await database_1.prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
        const manifestUrl = settings?.updateManifestUrl?.trim() || process.env.UPDATE_MANIFEST_URL || '';
        const currentVersion = unifiedConfig_1.config.APP_VERSION;
        if (!manifestUrl) {
            return res.status(400).json({
                error: 'URL do manifesto de atualização não configurada',
                currentVersion,
            });
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        let manifest;
        try {
            const resp = await (0, node_fetch_1.default)(manifestUrl, { signal: controller.signal });
            if (!resp.ok) {
                return res.status(502).json({ error: `manifesto respondeu HTTP ${resp.status}`, currentVersion });
            }
            manifest = await resp.json();
        }
        finally {
            clearTimeout(timer);
        }
        const latestVersion = String(manifest?.version || '').trim();
        if (!latestVersion) {
            return res.status(502).json({ error: 'manifesto inválido (campo version ausente)', currentVersion });
        }
        // manifesto multi-OS: { version, notes, windows: {url,sha256}, linux: {url,sha256} };
        // url/sha256 no topo seguem valendo como fallback (manifestos antigos)
        const osEntry = manifest?.[process.platform === 'win32' ? 'windows' : 'linux'];
        return res.json({
            currentVersion,
            latestVersion,
            updateAvailable: compareVersions(latestVersion, currentVersion) > 0,
            downloadUrl: osEntry?.url || manifest?.url || null,
            sha256: osEntry?.sha256 || manifest?.sha256 || null,
            notes: manifest?.notes || null,
            checkedAt: new Date().toISOString(),
        });
    }
    catch (err) {
        const msg = err?.name === 'AbortError' ? 'tempo esgotado ao buscar o manifesto' : (err?.message || 'erro');
        console.error('Error checking for updates:', msg);
        return res.status(502).json({ error: `falha ao verificar atualização: ${msg}` });
    }
});
// Comparação semver com suporte a pré-release (2.1.0-beta.2 < 2.1.0):
// retorna >0 se a > b, <0 se a < b, 0 se iguais.
function compareVersions(a, b) {
    const parse = (v) => {
        const [core, pre] = v.replace(/^v/i, '').split('-', 2);
        const nums = core.split('.').map((n) => parseInt(n, 10) || 0);
        while (nums.length < 3)
            nums.push(0);
        return { nums, pre: pre ?? null };
    };
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < 3; i++) {
        if (pa.nums[i] !== pb.nums[i])
            return pa.nums[i] - pb.nums[i];
    }
    if (pa.pre === pb.pre)
        return 0;
    if (pa.pre === null)
        return 1; // versão final > pré-release
    if (pb.pre === null)
        return -1;
    return pa.pre.localeCompare(pb.pre, undefined, { numeric: true });
}
// 13. GET /api/ops/permissions
router.get('/permissions', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
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
        const dbPerms = await database_1.prisma.rolePermission.findMany();
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
    }
    catch (err) {
        console.error('Error fetching role permissions:', err);
        return res.status(500).json({ error: 'failed to fetch role permissions' });
    }
});
// 14. POST /api/ops/permissions
router.post('/permissions', auth_1.authMiddleware, auth_1.adminMiddleware, async (req, res) => {
    const { role } = req.body;
    try {
        const { health, containers, backups, logs, integrations, condo, users, permissions, audit, deleteRegistration, editRegistration, viewOnly, editDepartments, manageDevices } = req.body;
        if (!role) {
            return res.status(400).json({ error: 'role is required' });
        }
        const updated = await database_1.prisma.rolePermission.upsert({
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
        await AuditService_1.AuditService.logAdminAuditEvent({
            action: 'ROLE_PERMISSIONS_UPDATE',
            status: 'success',
            req,
            userId: req.user?.id,
            userEmail: req.user?.email,
            details: `Permissions updated for role ${role}.`
        });
        return res.json(updated);
    }
    catch (err) {
        console.error('Error updating role permissions:', err);
        await AuditService_1.AuditService.logAdminAuditEvent({
            action: 'ROLE_PERMISSIONS_UPDATE',
            status: 'failed',
            req,
            userId: req.user?.id,
            userEmail: req.user?.email,
            details: `Failed to update permissions for role ${role}: ${err.message}`
        });
        return res.status(500).json({ error: 'failed to update role permissions' });
    }
});
exports.default = router;
