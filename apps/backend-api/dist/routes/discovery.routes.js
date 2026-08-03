"use strict";
/**
 * discovery.routes.ts
 * Rotas HTTP para o módulo de Network Discovery:
 *  - POST /api/discovery/scan       — inicia varredura
 *  - GET  /api/discovery/stream     — SSE: stream de dispositivos encontrados
 *  - GET  /api/discovery/devices    — lista de dispositivos da última varredura (polling)
 *  - POST /api/discovery/register   — cadastra dispositivo descoberto no PostgreSQL
 *  - POST /api/discovery/test-connection — testa conexão pontual com um dispositivo
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const discovery_orchestrator_1 = require("../modules/discovery/discovery.orchestrator");
const crypto_1 = require("crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const unifiedConfig_1 = require("../config/unifiedConfig");
const router = (0, express_1.Router)();
// ── GET /api/discovery/stream ─────────────────────────────────────────────────
// Server-Sent Events: registrado ANTES do authMiddleware porque EventSource não
// envia header Authorization — o JWT vem por ?token= (mesmo padrão dos streams
// MJPEG do videoporteiro/terminal facial).
router.get('/stream', (req, res) => {
    const token = req.query.token || '';
    if (!token) {
        res.status(401).end();
        return;
    }
    try {
        jsonwebtoken_1.default.verify(token, unifiedConfig_1.config.JWT.SECRET);
    }
    catch {
        res.status(401).end();
        return;
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx: não bufferizar SSE
    res.flushHeaders();
    res.write('event: connected\ndata: {}\n\n');
    const clientId = (0, discovery_orchestrator_1.registerScanClient)(res);
    // Ping a cada 25s para manter a conexão viva
    const pingInterval = setInterval(() => {
        try {
            res.write('event: ping\ndata: {}\n\n');
        }
        catch {
            clearInterval(pingInterval);
        }
    }, 25000);
    req.on('close', () => {
        clearInterval(pingInterval);
        (0, discovery_orchestrator_1.unregisterScanClient)(clientId);
    });
});
router.use(auth_1.authMiddleware);
// ── GET /api/discovery/categories ────────────────────────────────────────────
router.get('/categories', async (_req, res) => {
    try {
        const categories = await database_1.prisma.deviceCategory.findMany({ orderBy: { name: 'asc' } });
        res.json({ success: true, data: categories });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ── Helpers de criptografia de credenciais (mesma lógica de FacialAccessService) ──
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
// ── POST /api/discovery/scan ──────────────────────────────────────────────────
/**
 * Inicia uma varredura de rede. Retorna imediatamente; resultados chegam via SSE.
 * Body (opcional): { subnetPrefix: "192.168.1", arpEnabled: true }
 */
router.post('/scan', auth_1.adminMiddleware, async (req, res) => {
    try {
        // Carrega IPs e MACs já cadastrados para marcar isAdded corretamente
        const existing = await database_1.prisma.networkDevice.findMany({
            where: { isAdded: true },
            select: { ipAddress: true, macAddress: true },
        });
        const addedIps = new Set(existing.map((d) => d.ipAddress));
        const addedMacs = new Set(existing.flatMap((d) => d.macAddress ? [d.macAddress.toLowerCase()] : []));
        // Equipamentos que JÁ são gerenciados por uma integração: a varredura passa a
        // rotulá-los corretamente ("já integrado como X") e usa as credenciais deles
        // para ler modelo/serial reais, em vez de adivinhar por OUI.
        const [facials, videos, doorbells, guaritas] = await Promise.all([
            database_1.prisma.facialAccessDevice.findMany({ where: { enabled: true } }),
            database_1.prisma.videoDevice.findMany({ where: { enabled: true } }),
            database_1.prisma.doorbellDevice.findMany({ where: { enabled: true } }),
            database_1.prisma.guaritaDevice.findMany({ where: { enabled: true } }),
        ]);
        // Um mesmo IP pode estar em mais de uma integração (o terminal facial também
        // é cadastrado como câmera no VMS, por exemplo). A primeira integração a
        // registrar define tipo/credenciais — daí a ordem abaixo, do mais específico
        // (controle de acesso) ao mais genérico (vídeo) — e as demais só acrescentam
        // o rótulo, para o operador ver tudo o que aquele equipamento já é.
        const knownByIp = new Map();
        const addKnown = (ip, entry) => {
            const current = knownByIp.get(ip);
            if (!current) {
                knownByIp.set(ip, entry);
                return;
            }
            current.label = `${current.label} + ${entry.label}`;
        };
        for (const d of facials) {
            addKnown(d.ip, {
                label: `Terminal Facial · ${d.name}`, kind: 'facial',
                port: d.port, username: d.username, password: d.password,
            });
        }
        for (const d of doorbells) {
            addKnown(d.ip, {
                label: `Videoporteiro · ${d.name}`, kind: 'intercom',
                port: d.port, username: d.username, password: d.password,
            });
        }
        for (const d of guaritas) {
            addKnown(d.ip, { label: `Guarita MG3000 · ${d.name}`, kind: 'controller' });
        }
        for (const d of videos) {
            addKnown(d.ip, {
                label: `${d.kind === 'nvr' ? 'NVR' : d.kind === 'dvr' ? 'DVR' : 'Câmera'} · ${d.name}`,
                kind: d.kind === 'nvr' ? 'nvr' : d.kind === 'dvr' ? 'dvr' : 'camera',
                port: d.httpPort, username: d.username, password: d.password,
            });
        }
        const { subnetPrefix, arpEnabled } = req.body ?? {};
        // Fire-and-forget: responde rapidamente e o scan corre em background
        (0, discovery_orchestrator_1.startScan)({ subnetPrefix, arpEnabled: arpEnabled !== false, addedIps, addedMacs, knownByIp });
        res.json({ success: true, message: 'Varredura iniciada. Conecte-se ao endpoint /stream para receber os resultados.' });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// ── GET /api/discovery/devices ────────────────────────────────────────────────
/**
 * Retorna os dispositivos encontrados na última varredura (polling alternativo ao SSE).
 * Query: ?protocol=onvif|sadp|mdns|arp&hide_added=true
 */
router.get('/devices', (req, res) => {
    let devices = (0, discovery_orchestrator_1.getLastScanDevices)();
    const { protocol, hide_added } = req.query;
    if (protocol)
        devices = devices.filter((d) => d.protocolType === protocol);
    if (hide_added === 'true')
        devices = devices.filter((d) => !d.isAdded);
    res.json({ success: true, data: devices, total: devices.length });
});
// ── POST /api/discovery/register ──────────────────────────────────────────────
/**
 * Cadastra um dispositivo descoberto (promove de "discovered" para "added").
 * Body: { tempId, friendlyName, categoryId?, areaId?, username, password }
 * Se tempId não existir em memória, aceita ip/mac diretos (cadastro manual simples).
 */
router.post('/register', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { tempId, friendlyName, categoryId, areaId, username, password, 
        // Para cadastro manual direto (sem tempId)
        ipAddress: bodyIp, macAddress: bodyMac, protocolType: bodyProtocol, } = req.body;
        if (!friendlyName?.trim()) {
            return res.status(400).json({ error: 'Nome do dispositivo é obrigatório.' });
        }
        if (!username?.trim() || !password) {
            return res.status(400).json({ error: 'Credenciais (usuário e senha) são obrigatórias.' });
        }
        let discovered = tempId ? (0, discovery_orchestrator_1.getDeviceByTempId)(tempId) : null;
        if (!discovered && !bodyIp) {
            return res.status(404).json({ error: 'Dispositivo não encontrado na varredura. Forneça ipAddress para cadastro manual.' });
        }
        const ip = discovered?.ipAddress ?? bodyIp;
        const mac = discovered?.macAddress ?? bodyMac ?? null;
        const protocol = discovered?.protocolType ?? bodyProtocol ?? 'manual';
        const encPassword = encryptPassword(password);
        // Upsert: se já existe um registro com esse IP/MAC, atualiza; senão cria
        const upsertData = {
            ipAddress: ip,
            macAddress: mac,
            protocolType: protocol,
            manufacturer: discovered?.manufacturer ?? null,
            model: discovered?.model ?? null,
            serialNumber: discovered?.serialNumber ?? null,
            firmwareVersion: discovered?.firmwareVersion ?? null,
            deviceType: discovered?.deviceType ?? 'unknown',
            isAdded: true,
            friendlyName: friendlyName.trim(),
            categoryId: categoryId ?? null,
            areaId: areaId ?? null,
            credentialUsername: username.trim(),
            credentialPasswordEncrypted: encPassword,
            httpPort: discovered?.httpPort ?? 80,
            sdkPort: discovered?.sdkPort ?? 8000,
            subnetMask: discovered?.subnetMask ?? null,
            gateway: discovered?.gateway ?? null,
            dhcpEnabled: discovered?.dhcpEnabled ?? false,
            status: 'unknown',
        };
        let device;
        if (mac) {
            device = await database_1.prisma.networkDevice.upsert({
                where: { macAddress: mac },
                create: upsertData,
                update: { ...upsertData, lastDiscoveredAt: new Date() },
            });
        }
        else {
            const existing = await database_1.prisma.networkDevice.findFirst({ where: { ipAddress: ip } });
            if (existing) {
                device = await database_1.prisma.networkDevice.update({ where: { id: existing.id }, data: upsertData });
            }
            else {
                device = await database_1.prisma.networkDevice.create({ data: upsertData });
            }
        }
        const { credentialPasswordEncrypted: _, ...safeDevice } = device;
        res.status(201).json({ success: true, data: safeDevice });
    }
    catch (e) {
        if (e?.code === 'P2002')
            return res.status(409).json({ error: 'Dispositivo já cadastrado (conflito de MAC ou número de série).' });
        res.status(500).json({ error: e.message });
    }
});
// ── POST /api/discovery/test-connection ──────────────────────────────────────
/**
 * Testa a conexão com um dispositivo sem persistir.
 * Body: { ipAddress, port, protocol, username?, password? }
 * Retorna: { success: bool, latencyMs?: number, error?: string }
 */
router.post('/test-connection', auth_1.adminMiddleware, async (req, res) => {
    const { ipAddress, port = 80, protocol = 'http', username, password } = req.body;
    if (!ipAddress)
        return res.status(400).json({ error: 'ipAddress é obrigatório.' });
    const start = Date.now();
    try {
        const url = `http://${ipAddress}:${port}${protocol === 'onvif' ? '/onvif/device_service' : '/'}`;
        const headers = { 'User-Agent': 'OnliAcesso-Discovery/1.0' };
        if (username && password) {
            headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        }
        const resp = await fetch(url, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(5000),
        });
        const latencyMs = Date.now() - start;
        // Qualquer resposta (mesmo 401/403) indica que o dispositivo está acessível
        const reachable = resp.status < 500;
        if (reachable) {
            return res.json({ success: true, latencyMs, httpStatus: resp.status });
        }
        return res.json({ success: false, error: `HTTP ${resp.status}`, latencyMs });
    }
    catch (e) {
        const latencyMs = Date.now() - start;
        const msg = e?.message ?? String(e);
        const isTimeout = msg.includes('timeout') || msg.includes('abort');
        return res.json({
            success: false,
            latencyMs,
            error: isTimeout ? 'Tempo limite atingido — dispositivo não acessível ou porta fechada.' : msg,
        });
    }
});
exports.default = router;
