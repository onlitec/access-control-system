"use strict";
/**
 * devices.routes.ts
 * CRUD e operações avançadas para dispositivos de rede cadastrados (NetworkDevice).
 * Rotas base: /api/devices
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const net_1 = __importDefault(require("net"));
const crypto_1 = require("crypto");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
// ── Crypto helpers ─────────────────────────────────────────────────────────────
const CIPHER_ALGO = 'aes-256-gcm';
function encryptPassword(plain) {
    const secret = process.env.DEVICE_CREDENTIAL_KEY || process.env.JWT_SECRET || 'default-secret-key';
    const key = (0, crypto_1.scryptSync)(secret, 'salt', 32);
    const iv = (0, crypto_1.randomBytes)(12);
    const cipher = (0, crypto_1.createCipheriv)(CIPHER_ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}
// Omite a senha criptografada dos selects Prisma por padrão
const SAFE_SELECT = {
    id: true, macAddress: true, ipAddress: true, protocolType: true,
    manufacturer: true, model: true, serialNumber: true, firmwareVersion: true,
    deviceType: true, isAdded: true, lastDiscoveredAt: true,
    categoryId: true, areaId: true, friendlyName: true, channelCount: true,
    httpPort: true, sdkPort: true, subnetMask: true, gateway: true,
    dhcpEnabled: true, credentialUsername: true, status: true, lastSyncAt: true,
    createdAt: true, updatedAt: true,
    category: { select: { id: true, code: true, name: true } },
};
// ── Ping helper ────────────────────────────────────────────────────────────────
async function tcpPing(ip, port, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const socket = new net_1.default.Socket();
        const timer = setTimeout(() => { socket.destroy(); resolve(false); }, timeoutMs);
        socket.connect(port, ip, () => { clearTimeout(timer); socket.destroy(); resolve(true); });
        socket.on('error', () => { clearTimeout(timer); resolve(false); });
    });
}
// ── GET /api/devices ──────────────────────────────────────────────────────────
/**
 * Lista dispositivos cadastrados (isAdded = true).
 * Query: ?search=&categoryId=&areaId=&status=&page=1&limit=50&orderBy=friendlyName&dir=asc
 */
router.get('/', async (req, res) => {
    try {
        const { search = '', categoryId = '', areaId = '', status = '', page = '1', limit = '50', orderBy = 'createdAt', dir = 'desc', } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = Math.min(parseInt(limit), 200);
        const where = { isAdded: true };
        if (search)
            where.OR = [
                { friendlyName: { contains: search, mode: 'insensitive' } },
                { ipAddress: { contains: search } },
                { manufacturer: { contains: search, mode: 'insensitive' } },
                { model: { contains: search, mode: 'insensitive' } },
                { serialNumber: { contains: search, mode: 'insensitive' } },
            ];
        if (categoryId)
            where.categoryId = categoryId;
        if (areaId)
            where.areaId = areaId;
        if (status)
            where.status = status;
        const [devices, total] = await Promise.all([
            database_1.prisma.networkDevice.findMany({
                where, select: SAFE_SELECT,
                orderBy: { [orderBy]: dir },
                skip, take,
            }),
            database_1.prisma.networkDevice.count({ where }),
        ]);
        res.json({ success: true, data: devices, total, page: parseInt(page), limit: take });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ── POST /api/devices ─────────────────────────────────────────────────────────
/** Cadastro manual direto (sem discovery). */
router.post('/', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { ipAddress, macAddress, protocolType = 'manual', friendlyName, manufacturer, model, serialNumber, deviceType = 'unknown', categoryId, areaId, username, password, httpPort = 80, sdkPort = 8000, } = req.body;
        if (!ipAddress?.trim())
            return res.status(400).json({ error: 'ipAddress é obrigatório.' });
        if (!friendlyName?.trim())
            return res.status(400).json({ error: 'Nome do dispositivo é obrigatório.' });
        if (!username?.trim() || !password)
            return res.status(400).json({ error: 'Credenciais são obrigatórias.' });
        const device = await database_1.prisma.networkDevice.create({
            data: {
                ipAddress, macAddress: macAddress || null, protocolType, friendlyName,
                manufacturer: manufacturer || null, model: model || null,
                serialNumber: serialNumber || null, deviceType, isAdded: true,
                categoryId: categoryId || null, areaId: areaId || null,
                credentialUsername: username, credentialPasswordEncrypted: encryptPassword(password),
                httpPort: Number(httpPort), sdkPort: Number(sdkPort), status: 'unknown',
            },
            select: SAFE_SELECT,
        });
        res.status(201).json({ success: true, data: device });
    }
    catch (e) {
        if (e?.code === 'P2002')
            return res.status(409).json({ error: 'Conflito: MAC ou número de série já cadastrado.' });
        res.status(500).json({ error: e.message });
    }
});
// ── GET /api/devices/categories ──────────────────────────────────────────────
// Precisa vir ANTES de GET /:id — senão o Express casa ":id = categories".
router.get('/categories', async (_req, res) => {
    try {
        const cats = await database_1.prisma.deviceCategory.findMany({ orderBy: { name: 'asc' } });
        res.json({ success: true, data: cats });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ── GET /api/devices/:id ──────────────────────────────────────────────────────
/** Detalhes do dispositivo + últimos 20 logs de sincronização. */
router.get('/:id', async (req, res) => {
    try {
        const device = await database_1.prisma.networkDevice.findUnique({
            where: { id: req.params.id },
            select: {
                ...SAFE_SELECT,
                syncLogs: {
                    select: { id: true, status: true, message: true, createdAt: true },
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });
        if (!device)
            return res.status(404).json({ error: 'Dispositivo não encontrado.' });
        res.json({ success: true, data: device });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ── PUT /api/devices/:id ──────────────────────────────────────────────────────
/** Atualiza nome, área, credenciais e portas de um dispositivo. */
router.put('/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { friendlyName, areaId, categoryId, username, password, httpPort, sdkPort, status, } = req.body;
        const data = {};
        if (friendlyName !== undefined)
            data.friendlyName = friendlyName;
        if (areaId !== undefined)
            data.areaId = areaId || null;
        if (categoryId !== undefined)
            data.categoryId = categoryId || null;
        if (username !== undefined)
            data.credentialUsername = username;
        if (password)
            data.credentialPasswordEncrypted = encryptPassword(password);
        if (httpPort !== undefined)
            data.httpPort = Number(httpPort);
        if (sdkPort !== undefined)
            data.sdkPort = Number(sdkPort);
        if (status !== undefined)
            data.status = status;
        const device = await database_1.prisma.networkDevice.update({
            where: { id }, data, select: SAFE_SELECT,
        });
        res.json({ success: true, data: device });
    }
    catch (e) {
        if (e?.code === 'P2025')
            return res.status(404).json({ error: 'Dispositivo não encontrado.' });
        res.status(500).json({ error: e.message });
    }
});
// ── DELETE /api/devices ───────────────────────────────────────────────────────
/**
 * Remoção em lote.
 * Bloqueia se algum dispositivo (pela serialNumber ou ipAddress) estiver
 * vinculado a uma porta ativa em AccessAreaDoor via FacialAccessDevice.
 * Body: { ids: string[] }
 */
router.delete('/', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Nenhum ID informado.' });
        }
        // Verifica dispositivos que têm portas vinculadas a áreas de acesso
        const blockedDevices = await database_1.prisma.networkDevice.findMany({
            where: {
                id: { in: ids },
                isAdded: true,
            },
            select: { id: true, friendlyName: true, ipAddress: true },
        });
        // Verifica se algum dos IPs bate com um FacialAccessDevice vinculado a uma área
        const deviceIps = blockedDevices.map((d) => d.ipAddress);
        const linked = await database_1.prisma.facialAccessDevice?.findMany({
            where: { ip: { in: deviceIps } },
            select: { ip: true, name: true },
        }).catch(() => []);
        if (linked && linked.length > 0) {
            const names = linked.map((d) => d.name || d.ip).join(', ');
            return res.status(400).json({
                error: `Os seguintes dispositivos possuem portas de acesso configuradas e não podem ser removidos: ${names}. Remova os vínculos em "Áreas de Acesso" antes de excluir.`,
            });
        }
        await database_1.prisma.networkDevice.deleteMany({ where: { id: { in: ids } } });
        res.json({ success: true, deleted: ids.length });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ── POST /api/devices/:id/sync ────────────────────────────────────────────────
/** Sincroniza status de rede de um dispositivo via TCP ping nas portas conhecidas. */
router.post('/:id/sync', auth_1.adminMiddleware, async (req, res) => {
    try {
        const device = await database_1.prisma.networkDevice.findUnique({
            where: { id: req.params.id },
            select: { id: true, ipAddress: true, httpPort: true, sdkPort: true },
        });
        if (!device)
            return res.status(404).json({ error: 'Dispositivo não encontrado.' });
        const portsToCheck = [device.httpPort, device.sdkPort, 554].filter(Boolean);
        const results = await Promise.all(portsToCheck.map((p) => tcpPing(device.ipAddress, p)));
        const online = results.some(Boolean);
        const newStatus = online ? 'online' : 'offline';
        const [updated] = await Promise.all([
            database_1.prisma.networkDevice.update({
                where: { id: device.id },
                data: { status: newStatus, lastSyncAt: new Date() },
                select: SAFE_SELECT,
            }),
            database_1.prisma.deviceSyncLog.create({
                data: {
                    deviceId: device.id,
                    status: online ? 'success' : 'error',
                    message: online ? `Online (ping OK em ${portsToCheck.filter((_, i) => results[i]).join(',')})` : 'Offline — todas as portas inacessíveis',
                },
            }),
        ]);
        res.json({ success: true, data: updated });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ── POST /api/devices/sync-all ────────────────────────────────────────────────
/** Dispara sincronização de status para todos os dispositivos cadastrados (background). */
router.post('/sync-all', auth_1.adminMiddleware, async (req, res) => {
    try {
        const devices = await database_1.prisma.networkDevice.findMany({
            where: { isAdded: true },
            select: { id: true, ipAddress: true, httpPort: true, sdkPort: true },
        });
        res.json({ success: true, message: `Sincronização de ${devices.length} dispositivos iniciada em background.` });
        // Processa em background sem bloquear a resposta
        setImmediate(async () => {
            for (const device of devices) {
                try {
                    const portsToCheck = [device.httpPort, device.sdkPort, 554].filter(Boolean);
                    const results = await Promise.all(portsToCheck.map((p) => tcpPing(device.ipAddress, p, 1500)));
                    const online = results.some(Boolean);
                    await database_1.prisma.networkDevice.update({
                        where: { id: device.id },
                        data: { status: online ? 'online' : 'offline', lastSyncAt: new Date() },
                    });
                    await database_1.prisma.deviceSyncLog.create({
                        data: {
                            deviceId: device.id,
                            status: online ? 'success' : 'error',
                            message: online ? 'Online (sync-all)' : 'Offline (sync-all)',
                        },
                    });
                }
                catch { }
            }
        });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ── PUT /api/devices/bulk/password ────────────────────────────────────────────
/** Modifica a senha em lote nos registros do banco (não envia para o dispositivo). */
router.put('/bulk/password', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { ids, password } = req.body;
        if (!Array.isArray(ids) || ids.length === 0)
            return res.status(400).json({ error: 'Nenhum ID informado.' });
        if (!password)
            return res.status(400).json({ error: 'Senha é obrigatória.' });
        const enc = encryptPassword(password);
        await database_1.prisma.networkDevice.updateMany({
            where: { id: { in: ids } },
            data: { credentialPasswordEncrypted: enc },
        });
        res.json({ success: true, updated: ids.length });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ── PUT /api/devices/bulk/timezone ────────────────────────────────────────────
/** Registra o timezone padrão do condomínio nos metadados (sem enviar para hardware — placeholder para integração futura). */
router.put('/bulk/timezone', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { ids, timezone } = req.body;
        if (!Array.isArray(ids) || ids.length === 0)
            return res.status(400).json({ error: 'Nenhum ID informado.' });
        if (!timezone)
            return res.status(400).json({ error: 'Timezone é obrigatório.' });
        // Persiste nos logs para rastreabilidade
        await database_1.prisma.deviceSyncLog.createMany({
            data: ids.map((deviceId) => ({
                deviceId,
                status: 'success',
                message: `Timezone definido como "${timezone}" via lote.`,
            })),
        });
        res.json({ success: true, message: `Timezone "${timezone}" registrado para ${ids.length} dispositivos.` });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.default = router;
