import { Router, Request, Response } from 'express';
import { prisma } from '../database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { AuditService } from '../services/AuditService';
import { EmailService } from '../services/EmailService';
import { AccessUrlService } from '../services/AccessUrlService';
import { config } from '../config/unifiedConfig';

// Configurações de infraestrutura (SMTP, atualizações) — singleton no banco,
// editável apenas por administradores. A senha SMTP nunca é retornada.
const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get('/', async (_req: Request, res: Response) => {
    try {
        const s = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
        return res.json({
            smtpHost: s?.smtpHost ?? null,
            smtpPort: s?.smtpPort ?? null,
            smtpUser: s?.smtpUser ?? null,
            smtpFrom: s?.smtpFrom ?? null,
            smtpFromName: s?.smtpFromName ?? null,
            smtpPasswordSet: Boolean(s?.smtpPassword || config.SMTP.PASSWORD),
            updateManifestUrl: s?.updateManifestUrl ?? null,
            accessMode: s?.accessMode === 'domain' ? 'domain' : 'ip',
            accessUrlIp: s?.accessUrlIp ?? null,
            accessUrlDomain: s?.accessUrlDomain ?? null,
            appVersion: config.APP_VERSION,
            // valores efetivos (banco com fallback .env), sem segredos
            effective: await EmailService.getEffectiveConfig().then((c) => ({
                host: c.host,
                port: c.port,
                user: c.user,
                from: c.from,
                fromName: c.fromName,
            })),
            effectiveAccessUrl: await AccessUrlService.getEffectiveAppUrl(),
        });
    } catch (err: any) {
        console.error('[SystemSettings] GET error:', err);
        return res.status(500).json({ error: 'falha ao carregar as configurações' });
    }
});

router.put('/', async (req: Request, res: Response) => {
    try {
        const b = req.body || {};
        // whitelist de campos; senha vazia/ausente preserva a atual
        const data: Record<string, any> = {
            smtpHost: typeof b.smtpHost === 'string' ? b.smtpHost.trim() || null : null,
            smtpPort: Number.isFinite(Number(b.smtpPort)) && Number(b.smtpPort) > 0
                ? Math.floor(Number(b.smtpPort)) : null,
            smtpUser: typeof b.smtpUser === 'string' ? b.smtpUser.trim() || null : null,
            smtpFrom: typeof b.smtpFrom === 'string' ? b.smtpFrom.trim() || null : null,
            smtpFromName: typeof b.smtpFromName === 'string' ? b.smtpFromName.trim() || null : null,
            updateManifestUrl: typeof b.updateManifestUrl === 'string'
                ? b.updateManifestUrl.trim() || null : null,
            accessMode: b.accessMode === 'domain' ? 'domain' : 'ip',
            accessUrlIp: typeof b.accessUrlIp === 'string' ? b.accessUrlIp.trim() || null : null,
            accessUrlDomain: typeof b.accessUrlDomain === 'string' ? b.accessUrlDomain.trim() || null : null,
        };
        const update: Record<string, any> = { ...data };
        if (typeof b.smtpPassword === 'string' && b.smtpPassword.trim()) {
            update.smtpPassword = b.smtpPassword.trim();
        }

        await prisma.systemSettings.upsert({
            where: { id: 'singleton' },
            update,
            create: { id: 'singleton', ...update },
        });
        EmailService.invalidateCache();
        AccessUrlService.invalidateCache();

        await AuditService.logAdminAuditEvent({
            action: 'SYSTEM_SETTINGS_UPDATE',
            status: 'success',
            req,
            userId: (req as any).user?.id,
            userEmail: (req as any).user?.email,
            details: `Configurações do sistema atualizadas (senha SMTP ${update.smtpPassword ? 'alterada' : 'mantida'}).`,
        });

        return res.json({ success: true });
    } catch (err: any) {
        console.error('[SystemSettings] PUT error:', err);
        return res.status(500).json({ error: 'falha ao salvar as configurações' });
    }
});

router.post('/smtp-test', async (req: Request, res: Response) => {
    const to = (typeof req.body?.to === 'string' && req.body.to.trim())
        || (req as any).user?.email;
    if (!to) {
        return res.status(400).json({ error: 'informe o e-mail de destino' });
    }
    try {
        const { messageId } = await EmailService.sendTestEmail(to);
        return res.json({ success: true, messageId, to });
    } catch (err: any) {
        // devolve o erro SMTP legível (ex.: 535 Authentication failed)
        return res.status(502).json({ success: false, error: err?.message || 'falha no envio' });
    }
});

export default router;
