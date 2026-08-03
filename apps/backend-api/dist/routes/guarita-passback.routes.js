"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastPassbackAlert = broadcastPassbackAlert;
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const unifiedConfig_1 = require("../config/unifiedConfig");
const NiceGuaritaService_1 = require("../services/NiceGuaritaService");
const jsonwebtoken_1 = require("jsonwebtoken");
const EventBusService_1 = require("../services/EventBusService");
const router = (0, express_1.Router)();
// ── SSE client registry ────────────────────────────────────────────────────────
const sseClients = new Map();
function broadcastPassbackAlert(alert) {
    const payload = `data: ${JSON.stringify({ type: 'passback_alert', data: alert })}\n\n`;
    for (const [clientId, res] of sseClients) {
        try {
            res.write(payload);
        }
        catch {
            sseClients.delete(clientId);
        }
    }
}
function sendHeartbeat() {
    const payload = 'data: {"type":"ping"}\n\n';
    for (const [clientId, res] of sseClients) {
        try {
            res.write(payload);
        }
        catch {
            sseClients.delete(clientId);
        }
    }
}
setInterval(sendHeartbeat, 30000);
// ── SSE endpoint (token via query param — EventSource não suporta headers) ────
router.get('/events', (req, res) => {
    const token = req.query.token;
    if (!token)
        return res.status(401).end();
    try {
        (0, jsonwebtoken_1.verify)(token, unifiedConfig_1.config.JWT.SECRET);
    }
    catch {
        return res.status(401).end();
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // nginx: desativa buffering de SSE
    res.flushHeaders();
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sseClients.set(clientId, res);
    res.write('data: {"type":"connected"}\n\n');
    req.on('close', () => {
        sseClients.delete(clientId);
    });
});
// ── Todas as rotas abaixo exigem auth middleware ──────────────────────────────
router.use(auth_1.authMiddleware);
// GET /api/guarita/passback/settings
router.get('/settings', async (_req, res) => {
    try {
        const settings = await database_1.prisma.condominiumSettings.findUnique({ where: { id: 'singleton' } });
        res.json({ antiPassbackEnabled: settings?.antiPassbackEnabled ?? false });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// PUT /api/guarita/passback/settings
router.put('/settings', async (req, res) => {
    try {
        const { antiPassbackEnabled } = req.body;
        const settings = await database_1.prisma.condominiumSettings.upsert({
            where: { id: 'singleton' },
            create: {
                id: 'singleton',
                name: 'Condomínio',
                type: 'vertical',
                antiPassbackEnabled: Boolean(antiPassbackEnabled),
            },
            update: { antiPassbackEnabled: Boolean(antiPassbackEnabled) },
        });
        res.json({ antiPassbackEnabled: settings.antiPassbackEnabled });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/guarita/passback/alerts — alertas pendentes
router.get('/alerts', async (_req, res) => {
    try {
        const alerts = await database_1.prisma.guaritaPassbackAlert.findMany({
            where: { resolved: false },
            orderBy: { occurredAt: 'desc' },
        });
        res.json({ data: alerts });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/guarita/passback/alerts/:id/release — libera entrada + abre portão (portaria only)
router.post('/alerts/:id/release', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const operatorId = req.user?.id;
        const alert = await database_1.prisma.guaritaPassbackAlert.findUnique({ where: { id } });
        if (!alert)
            return res.status(404).json({ error: 'Alerta não encontrado' });
        // Abrir portão se deviceId disponível
        if (alert.deviceId) {
            try {
                await NiceGuaritaService_1.NiceGuaritaService.openGate(alert.deviceId);
                const user = req.user || {};
                await (0, EventBusService_1.emitEvent)({
                    personName: 'Portão aberto manualmente',
                    personType: 'system',
                    operatorId: user.id ?? null,
                    deviceName: alert.deviceName ?? 'Portão',
                    status: 'authorized',
                    notes: `Liberação anti-passback: ${alert.personName}`,
                    category: 'gate',
                    source: 'manual',
                    metadata: { deviceId: alert.deviceId, action: 'open', passbackAlertId: alert.id },
                }).catch(() => { });
            }
            catch (gateErr) {
                console.warn('[APB] Falha ao abrir portão na liberação:', gateErr.message);
            }
        }
        // Resetar estado APB do morador
        if (alert.personId) {
            await database_1.prisma.guaritaPassbackState.upsert({
                where: { personId: alert.personId },
                create: {
                    personId: alert.personId,
                    serial: alert.serial,
                    direction: 'OUT',
                    occurredAt: new Date(),
                },
                update: { direction: 'OUT', occurredAt: new Date() },
            });
        }
        // Marcar alerta como resolvido
        await database_1.prisma.guaritaPassbackAlert.update({
            where: { id },
            data: {
                resolved: true,
                resolvedAt: new Date(),
                resolvedBy: operatorId ?? null,
            },
        });
        res.json({ success: true, action: 'released' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/guarita/passback/alerts/:id/dismiss — dispensa sem abrir portão
router.post('/alerts/:id/dismiss', async (req, res) => {
    try {
        const { id } = req.params;
        const operatorId = req.user?.id;
        await database_1.prisma.guaritaPassbackAlert.update({
            where: { id },
            data: {
                resolved: true,
                resolvedAt: new Date(),
                resolvedBy: operatorId ?? null,
            },
        });
        res.json({ success: true, action: 'dismissed' });
    }
    catch (error) {
        if (error?.code === 'P2025')
            return res.status(404).json({ error: 'Alerta não encontrado' });
        res.status(500).json({ error: error.message });
    }
});
// DELETE /api/guarita/passback/state/:personId — admin reseta estado APB de morador
router.delete('/state/:personId', auth_1.portariaMiddleware, async (req, res) => {
    try {
        const { personId } = req.params;
        await database_1.prisma.guaritaPassbackState.deleteMany({ where: { personId } });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// GET /api/guarita/passback/states — lista moradores com estado IN (admin)
router.get('/states', async (_req, res) => {
    try {
        const states = await database_1.prisma.guaritaPassbackState.findMany({
            where: { direction: 'IN' },
            include: {
                person: {
                    select: { id: true, firstName: true, lastName: true, unit_number: true, tower: true, photoUrl: true },
                },
            },
            orderBy: { occurredAt: 'desc' },
        });
        res.json({
            data: states.map(s => ({
                id: s.id,
                personId: s.personId,
                personName: `${s.person.firstName} ${s.person.lastName}`.trim(),
                unit: s.person.unit_number,
                tower: s.person.tower,
                photoUrl: s.person.photoUrl,
                serial: s.serial,
                direction: s.direction,
                occurredAt: s.occurredAt,
            })),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
