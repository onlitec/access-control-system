"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const AuditService_1 = require("../services/AuditService");
const EmailService_1 = require("../services/EmailService");
const unifiedConfig_1 = require("../config/unifiedConfig");
// Configurações de infraestrutura (SMTP, atualizações) — singleton no banco,
// editável apenas por administradores. A senha SMTP nunca é retornada.
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware, auth_1.adminMiddleware);
router.get('/', async (_req, res) => {
    try {
        const s = await database_1.prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
        return res.json({
            smtpHost: s?.smtpHost ?? null,
            smtpPort: s?.smtpPort ?? null,
            smtpUser: s?.smtpUser ?? null,
            smtpFrom: s?.smtpFrom ?? null,
            smtpFromName: s?.smtpFromName ?? null,
            smtpPasswordSet: Boolean(s?.smtpPassword || unifiedConfig_1.config.SMTP.PASSWORD),
            updateManifestUrl: s?.updateManifestUrl ?? null,
            appVersion: unifiedConfig_1.config.APP_VERSION,
            // valores efetivos (banco com fallback .env), sem segredos
            effective: await EmailService_1.EmailService.getEffectiveConfig().then((c) => ({
                host: c.host,
                port: c.port,
                user: c.user,
                from: c.from,
                fromName: c.fromName,
            })),
        });
    }
    catch (err) {
        console.error('[SystemSettings] GET error:', err);
        return res.status(500).json({ error: 'falha ao carregar as configurações' });
    }
});
router.put('/', async (req, res) => {
    try {
        const b = req.body || {};
        // whitelist de campos; senha vazia/ausente preserva a atual
        const data = {
            smtpHost: typeof b.smtpHost === 'string' ? b.smtpHost.trim() || null : null,
            smtpPort: Number.isFinite(Number(b.smtpPort)) && Number(b.smtpPort) > 0
                ? Math.floor(Number(b.smtpPort)) : null,
            smtpUser: typeof b.smtpUser === 'string' ? b.smtpUser.trim() || null : null,
            smtpFrom: typeof b.smtpFrom === 'string' ? b.smtpFrom.trim() || null : null,
            smtpFromName: typeof b.smtpFromName === 'string' ? b.smtpFromName.trim() || null : null,
            updateManifestUrl: typeof b.updateManifestUrl === 'string'
                ? b.updateManifestUrl.trim() || null : null,
        };
        const update = { ...data };
        if (typeof b.smtpPassword === 'string' && b.smtpPassword.trim()) {
            update.smtpPassword = b.smtpPassword.trim();
        }
        await database_1.prisma.systemSettings.upsert({
            where: { id: 'singleton' },
            update,
            create: { id: 'singleton', ...update },
        });
        EmailService_1.EmailService.invalidateCache();
        await AuditService_1.AuditService.logAdminAuditEvent({
            action: 'SYSTEM_SETTINGS_UPDATE',
            status: 'success',
            req,
            userId: req.user?.id,
            userEmail: req.user?.email,
            details: `Configurações do sistema atualizadas (senha SMTP ${update.smtpPassword ? 'alterada' : 'mantida'}).`,
        });
        return res.json({ success: true });
    }
    catch (err) {
        console.error('[SystemSettings] PUT error:', err);
        return res.status(500).json({ error: 'falha ao salvar as configurações' });
    }
});
router.post('/smtp-test', async (req, res) => {
    const to = (typeof req.body?.to === 'string' && req.body.to.trim())
        || req.user?.email;
    if (!to) {
        return res.status(400).json({ error: 'informe o e-mail de destino' });
    }
    try {
        const { messageId } = await EmailService_1.EmailService.sendTestEmail(to);
        return res.json({ success: true, messageId, to });
    }
    catch (err) {
        // devolve o erro SMTP legível (ex.: 535 Authentication failed)
        return res.status(502).json({ success: false, error: err?.message || 'falha no envio' });
    }
});
exports.default = router;
