"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const NiceGuaritaService_1 = require("../services/NiceGuaritaService");
const NiceGuaritaProtocol_1 = require("../services/NiceGuaritaProtocol");
const auth_1 = require("../middleware/auth");
const EventBusService_1 = require("../services/EventBusService");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
router.use(auth_1.authMiddleware);
// ── GET /api/guarita/status ───────────────────────────────────────────────
router.get('/status', (_req, res) => {
    res.json({
        sdkAvailable: NiceGuaritaService_1.NiceGuaritaService.isSdkAvailable(),
        message: NiceGuaritaService_1.NiceGuaritaService.isSdkAvailable()
            ? 'Nice Guarita MG3000 SDK ativo — protocolo TCP implementado'
            : 'Nice Guarita IP: módulo desconectado',
    });
});
// ── GET /api/guarita/devices ──────────────────────────────────────────────
router.get('/devices', async (_req, res) => {
    try {
        const devices = await NiceGuaritaService_1.NiceGuaritaService.listDevices();
        res.json({ devices, sdkAvailable: NiceGuaritaService_1.NiceGuaritaService.isSdkAvailable() });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/guarita/discover (legacy, port 80 scan — use /test or line 251 instead) ─────
// router.post('/discover', portariaMiddleware, async (req: Request, res: Response): Promise<void> => {  // REMOVED: duplicate handler, use line 251
// ── POST /api/guarita/devices ─────────────────────────────────────────────
router.post('/devices', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const { name, ip, port, location, sdkConfig } = req.body;
        if (!name || !ip) {
            res.status(400).json({ error: 'nome e ip são obrigatórios' });
            return;
        }
        const device = await prisma.guaritaDevice.create({
            data: { name, ip, port: port ?? 80, location: location ?? null, sdkConfig: sdkConfig ?? null },
        });
        res.status(201).json({ success: true, device });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── PUT /api/guarita/devices/:id ──────────────────────────────────────────
router.put('/devices/:id', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const { name, ip, port, location, enabled, sdkConfig } = req.body;
        const device = await prisma.guaritaDevice.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(ip !== undefined && { ip }),
                ...(port !== undefined && { port }),
                ...(location !== undefined && { location }),
                ...(enabled !== undefined && { enabled }),
                ...(sdkConfig !== undefined && { sdkConfig }),
            },
        });
        res.json({ success: true, device });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── DELETE /api/guarita/devices/:id ───────────────────────────────────────
router.delete('/devices/:id', auth_1.portariaMiddleware, async (req, res) => {
    try {
        await prisma.guaritaDevice.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
    }
});
// ── GET /api/guarita/devices/:id/ping ─────────────────────────────────────
router.get('/devices/:id/ping', async (req, res) => {
    try {
        const result = await NiceGuaritaService_1.NiceGuaritaService.pingDevice(req.params.id);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/guarita/devices/:id/import-residents ────────────────────────
router.post('/devices/:id/import-residents', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const result = await NiceGuaritaService_1.NiceGuaritaService.importResidents(req.params.id);
        res.json({ success: true, imported: result.imported, totalFound: result.total });
    }
    catch (err) {
        if (err instanceof NiceGuaritaService_1.ServiceUnavailableError) {
            res.status(503).json({ error: err.message, code: err.code });
            return;
        }
        res.status(500).json({ error: err.message });
    }
});
// Emite evento de portão na Central de Eventos (categoria "gate")
async function emitGateEvent(req, deviceId, action) {
    const user = req.user || {};
    const operatorLabel = user.name || user.email || user.id || 'Operador';
    const device = await prisma.guaritaDevice.findUnique({ where: { id: deviceId } }).catch(() => null);
    await (0, EventBusService_1.emitEvent)({
        personName: action === 'open' ? 'Portão aberto manualmente' : 'Portão fechado manualmente',
        personType: 'system',
        operatorId: user.id ?? null,
        deviceName: device?.name ?? 'Portão',
        status: 'authorized',
        notes: `Operador: ${operatorLabel}`,
        category: 'gate',
        source: 'manual',
        metadata: { deviceId, action, authorizedBy: operatorLabel },
    }).catch(e => console.error('[Guarita] Falha ao emitir evento de portão:', e.message));
}
// ── POST /api/guarita/devices/:id/open ────────────────────────────────────
router.post('/devices/:id/open', auth_1.portariaMiddleware, async (req, res) => {
    try {
        await NiceGuaritaService_1.NiceGuaritaService.openGate(req.params.id);
        await emitGateEvent(req, req.params.id, 'open');
        res.json({ success: true, action: 'open' });
    }
    catch (err) {
        if (err instanceof NiceGuaritaService_1.ServiceUnavailableError) {
            res.status(503).json({ error: err.message, code: err.code });
            return;
        }
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/guarita/devices/:id/close ───────────────────────────────────
router.post('/devices/:id/close', auth_1.portariaMiddleware, async (req, res) => {
    try {
        await NiceGuaritaService_1.NiceGuaritaService.closeGate(req.params.id);
        await emitGateEvent(req, req.params.id, 'close');
        res.json({ success: true, action: 'close' });
    }
    catch (err) {
        if (err instanceof NiceGuaritaService_1.ServiceUnavailableError) {
            res.status(503).json({ error: err.message, code: err.code });
            return;
        }
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/guarita/devices/:id/stored-events ───────────────────────────
// Diagnóstico: lê da MEMÓRIA do módulo a contagem de eventos armazenados e o
// último evento gravado — prova se acionamentos de controle chegam ao módulo.
router.get('/devices/:id/stored-events', async (req, res) => {
    try {
        const device = await NiceGuaritaService_1.NiceGuaritaService.getDevice(req.params.id);
        const [count, lastEvent] = await Promise.all([
            NiceGuaritaProtocol_1.NiceGuaritaProtocol.readEventCount(device.ip, device.port),
            NiceGuaritaProtocol_1.NiceGuaritaProtocol.readLastEvent(device.ip, device.port),
        ]);
        // Varredura opcional (?scan=N): amostra N ponteiros espalhados por 0-8191 e
        // agrega tipos/datas — revela se acionamentos de controle já chegaram ao módulo
        const scanN = Math.min(parseInt(String(req.query.scan ?? '0'), 10) || 0, 256);
        // Janela opcional (?from=&to=): varre ponteiros contíguos dessa faixa
        const fromP = parseInt(String(req.query.from ?? ''), 10);
        const toP = parseInt(String(req.query.to ?? ''), 10);
        let scan = undefined;
        if (!Number.isNaN(fromP) && !Number.isNaN(toP) && toP >= fromP) {
            const events = [];
            for (let p = fromP; p <= Math.min(toP, 8191) && events.length < 256; p++) {
                const ev = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.readEventAt(device.ip, device.port, p).catch(() => null);
                if (ev)
                    events.push({ pointer: p, type: ev.type, serial: ev.serial, dateTime: ev.dateTime, deviceKind: ev.deviceKind, output: ev.output });
            }
            res.json({ storedEvents: count, lastEvent, window: events });
            return;
        }
        if (scanN > 0) {
            const step = Math.floor(8192 / scanN);
            const byType = {};
            let newest = null;
            let newestControl = null;
            for (let i = 0; i < scanN; i++) {
                const ev = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.readEventAt(device.ip, device.port, i * step).catch(() => null);
                if (!ev)
                    continue;
                byType[ev.type] = (byType[ev.type] ?? 0) + 1;
                const entry = { pointer: i * step, type: ev.type, serial: ev.serial, dateTime: ev.dateTime, deviceKind: ev.deviceKind, output: ev.output };
                if (!newest || ev.dateTime > newest.dateTime)
                    newest = entry;
                if ((ev.type === 'device_triggered' || ev.type === 'access_granted') && (!newestControl || ev.dateTime > newestControl.dateTime)) {
                    newestControl = entry;
                }
            }
            scan = { sampled: scanN, byType, newestSampled: newest, newestControlSampled: newestControl };
        }
        res.json({
            storedEvents: count,
            lastEvent: lastEvent
                ? { type: lastEvent.type, serial: lastEvent.serial, dateTime: lastEvent.dateTime, deviceKind: lastEvent.deviceKind, output: lastEvent.output, raw: lastEvent.rawFrame.toString('hex') }
                : null,
            scan,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/guarita/devices/:id/import-events ──────────────────────────
// Importa o histórico de eventos da memória do módulo (job em segundo plano)
router.post('/devices/:id/import-events', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const from = Math.max(0, parseInt(String(req.body?.from ?? '0'), 10) || 0);
        const to = Math.min(8191, parseInt(String(req.body?.to ?? '8191'), 10) || 8191);
        const progress = NiceGuaritaService_1.NiceGuaritaService.startImportStoredEvents(req.params.id, from, to);
        res.status(202).json({ started: true, progress });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/guarita/devices/:id/import-events (progresso do job) ─────────
router.get('/devices/:id/import-events', async (req, res) => {
    const progress = NiceGuaritaService_1.NiceGuaritaService.importJobs.get(req.params.id) ?? null;
    res.json({ progress });
});
// ── GET /api/guarita/devices/:id/status ──────────────────────────────────
router.get('/devices/:id/status', async (req, res) => {
    try {
        const status = await NiceGuaritaService_1.NiceGuaritaService.getGateStatus(req.params.id);
        res.json({ deviceId: req.params.id, status, sdkAvailable: NiceGuaritaService_1.NiceGuaritaService.isSdkAvailable() });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/guarita/devices/:id/enroll ─────────────────────────────────
// Enroll a resident card/tag into the Guarita module
router.post('/devices/:id/enroll', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const { serial, deviceType, unit, block, name, vehiclePlate, receiverBitmask } = req.body;
        if (!serial) {
            res.status(400).json({ error: 'serial do dispositivo é obrigatório' });
            return;
        }
        const result = await NiceGuaritaService_1.NiceGuaritaService.enrollResident(req.params.id, {
            serial,
            deviceType,
            unit,
            block,
            name,
            vehiclePlate,
            receiverBitmask,
        });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/guarita/devices/:id/unenroll ───────────────────────────────
// Remove a device (card/tag) from the Guarita module
router.post('/devices/:id/unenroll', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const { serial, deviceType } = req.body;
        if (!serial) {
            res.status(400).json({ error: 'serial é obrigatório' });
            return;
        }
        const result = await NiceGuaritaService_1.NiceGuaritaService.unenrollResident(req.params.id, serial, deviceType);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/guarita/devices/:id/sync-clock ─────────────────────────────
// Sync the module clock to system time
router.post('/devices/:id/sync-clock', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const result = await NiceGuaritaService_1.NiceGuaritaService.syncClock(req.params.id);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/guarita/test ────────────────────────────────────────────────
// Test connectivity to a guarita module before saving it
router.post('/test', async (req, res) => {
    try {
        const { ip, port = 9000 } = req.body;
        if (!ip) {
            res.status(400).json({ error: 'ip é obrigatório' });
            return;
        }
        const online = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.ping(ip, Number(port), 3000);
        if (!online) {
            res.json({ online: false });
            return;
        }
        const [deviceCount, clock] = await Promise.allSettled([
            NiceGuaritaProtocol_1.NiceGuaritaProtocol.readDeviceCount(ip, Number(port)),
            NiceGuaritaProtocol_1.NiceGuaritaProtocol.readClock(ip, Number(port)),
        ]);
        res.json({
            online: true,
            deviceCount: deviceCount.status === 'fulfilled' ? deviceCount.value : null,
            clock: clock.status === 'fulfilled' ? clock.value : null,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/guarita/discover ────────────────────────────────────────────
// Scan a subnet for Nice MG3000 modules (port default 9000)
router.post('/discover', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const { subnet, port = 9000, timeoutMs = 1500 } = req.body;
        if (!subnet) {
            res.status(400).json({ error: 'subnet é obrigatório (ex: 192.168.1)' });
            return;
        }
        // Accept "192.168.1", "192.168.1.0", "192.168.1.0/24"
        const baseIp = subnet.replace(/\/\d+$/, '').replace(/\.\d+$/, '');
        const portNum = Number(port);
        const ips = Array.from({ length: 254 }, (_, i) => `${baseIp}.${i + 1}`);
        const found = [];
        const CONCURRENCY = 40;
        async function tryIp(ip) {
            try {
                const online = await NiceGuaritaProtocol_1.NiceGuaritaProtocol.ping(ip, portNum, Number(timeoutMs));
                if (!online)
                    return;
                const [dcRes, clkRes] = await Promise.allSettled([
                    NiceGuaritaProtocol_1.NiceGuaritaProtocol.readDeviceCount(ip, portNum),
                    NiceGuaritaProtocol_1.NiceGuaritaProtocol.readClock(ip, portNum),
                ]);
                found.push({
                    ip,
                    deviceCount: dcRes.status === 'fulfilled' ? dcRes.value : null,
                    clock: clkRes.status === 'fulfilled' ? clkRes.value : null,
                });
            }
            catch { /* not a guarita */ }
        }
        for (let i = 0; i < ips.length; i += CONCURRENCY) {
            await Promise.allSettled(ips.slice(i, i + CONCURRENCY).map(tryIp));
        }
        res.json({ found, scanned: ips.length, port: portNum });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
