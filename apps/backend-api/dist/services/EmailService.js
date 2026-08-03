"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const database_1 = require("../database");
const unifiedConfig_1 = require("../config/unifiedConfig");
/**
 * Envio de e-mails transacionais via SMTP (Brevo por padrão).
 *
 * A configuração vem do banco (SystemSettings, editável no painel admin),
 * campo a campo com fallback para o .env (SMTP_HOST, SMTP_PORT, SMTP_USER,
 * SMTP_PASSWORD, SMTP_FROM, SMTP_FROM_NAME). Cache curto para não consultar
 * o banco a cada envio; o PUT das configurações invalida o cache.
 */
class EmailService {
    static invalidateCache() {
        this.cached = null;
        this.cachedAt = 0;
        this.transporter = null;
        this.transporterKey = '';
    }
    static async getEffectiveConfig() {
        const now = Date.now();
        if (this.cached && now - this.cachedAt < this.CACHE_TTL_MS) {
            return this.cached;
        }
        let db = null;
        try {
            db = await database_1.prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
        }
        catch (err) {
            console.error('[Email] Falha ao ler SystemSettings (usando .env):', err?.message || err);
        }
        const user = db?.smtpUser?.trim() || unifiedConfig_1.config.SMTP.USER;
        const effective = {
            host: db?.smtpHost?.trim() || unifiedConfig_1.config.SMTP.HOST,
            port: db?.smtpPort || unifiedConfig_1.config.SMTP.PORT,
            user,
            password: db?.smtpPassword || unifiedConfig_1.config.SMTP.PASSWORD,
            // Brevo exige remetente validado na conta
            from: db?.smtpFrom?.trim() || unifiedConfig_1.config.SMTP.FROM || user,
            fromName: db?.smtpFromName?.trim() || unifiedConfig_1.config.SMTP.FROM_NAME,
        };
        this.cached = effective;
        this.cachedAt = now;
        return effective;
    }
    static async isConfigured() {
        const c = await this.getEffectiveConfig();
        return Boolean(c.host && c.user && c.password);
    }
    static async getTransporter() {
        const smtp = await this.getEffectiveConfig();
        if (!smtp.host || !smtp.user || !smtp.password) {
            throw new Error('SMTP não configurado (defina no painel admin ou via SMTP_* no .env)');
        }
        const key = `${smtp.host}:${smtp.port}:${smtp.user}`;
        if (!this.transporter || this.transporterKey !== key) {
            this.transporter = nodemailer_1.default.createTransport({
                host: smtp.host,
                port: smtp.port,
                secure: smtp.port === 465,
                auth: { user: smtp.user, pass: smtp.password },
            });
            this.transporterKey = key;
        }
        return { transporter: this.transporter, smtp };
    }
    static async send(to, subject, text, html) {
        const { transporter, smtp } = await this.getTransporter();
        const info = await transporter.sendMail({
            from: `"${smtp.fromName}" <${smtp.from}>`,
            to,
            subject,
            text,
            html,
        });
        console.log(`[Email] Enviado para ${to} (from: ${smtp.from}, messageId: ${info.messageId}, ` +
            `resposta SMTP: ${info.response})`);
        return info;
    }
    static async sendVerificationCode(to, code) {
        await this.send(to, `${code} é o seu código de verificação - OnliAcesso`, `Seu código de verificação do OnliAcesso é: ${code}\n\n` +
            'O código expira em 15 minutos. Se você não solicitou este cadastro, ignore este e-mail.', `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
  <h2 style="color:#111827;margin:0 0 8px">Confirme seu e-mail</h2>
  <p style="color:#374151;font-size:14px;line-height:1.6">
    Use o código abaixo para concluir o cadastro do administrador do sistema
    <strong>OnliAcesso</strong>:
  </p>
  <div style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;margin:16px 0">
    <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111827">${code}</span>
  </div>
  <p style="color:#6b7280;font-size:12px;line-height:1.6">
    O código expira em 15 minutos.<br>
    Se você não solicitou este cadastro, ignore este e-mail.
  </p>
</div>`);
    }
    static async sendTestEmail(to) {
        const info = await this.send(to, 'E-mail de teste - OnliAcesso', 'Este é um e-mail de teste do OnliAcesso. Se você o recebeu, a configuração SMTP está funcionando.', `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
  <h2 style="color:#111827;margin:0 0 8px">E-mail de teste</h2>
  <p style="color:#374151;font-size:14px;line-height:1.6">
    Este é um e-mail de teste do <strong>OnliAcesso</strong>.<br>
    Se você o recebeu, a configuração SMTP está funcionando corretamente.
  </p>
  <p style="color:#6b7280;font-size:12px">Enviado em ${new Date().toLocaleString('pt-BR')}</p>
</div>`);
        return { messageId: String(info.messageId) };
    }
    /**
     * Alerta de detecção inteligente (VCA) por e-mail, com o snapshot do evento
     * embutido no corpo. `to` pode ser uma lista separada por vírgula.
     */
    static async sendVcaAlert(to, opts) {
        const { transporter, smtp } = await this.getTransporter();
        const when = opts.when.toLocaleString('pt-BR');
        const imgTag = opts.image ? '<img src="cid:vca-snap" alt="Snapshot" style="width:100%;border-radius:8px;margin-top:12px">' : '';
        await transporter.sendMail({
            from: `"${smtp.fromName}" <${smtp.from}>`,
            to,
            subject: `[OnliAcesso] ${opts.title} — ${opts.cameraName}`,
            text: `${opts.title}\nCâmera: ${opts.cameraName}\nQuando: ${when}`,
            html: `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
  <h2 style="color:#b91c1c;margin:0 0 8px">🚨 ${opts.title}</h2>
  <p style="color:#374151;font-size:14px;line-height:1.6">
    Câmera: <strong>${opts.cameraName}</strong><br>
    Quando: ${when}
  </p>
  ${imgTag}
  <p style="color:#6b7280;font-size:12px;margin-top:16px">Detecção inteligente do OnliAcesso (VCA por software).</p>
</div>`,
            attachments: opts.image ? [{ filename: 'snapshot.jpg', content: opts.image, cid: 'vca-snap' }] : [],
        });
        console.log(`[Email] Alerta VCA enviado para ${to} (${opts.cameraName})`);
    }
}
exports.EmailService = EmailService;
EmailService.transporter = null;
EmailService.transporterKey = '';
EmailService.cached = null;
EmailService.cachedAt = 0;
EmailService.CACHE_TTL_MS = 30000;
