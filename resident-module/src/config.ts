import dotenv from 'dotenv';

dotenv.config();

const bool = (value: string | undefined, fallback = false) =>
    value === undefined || value === '' ? fallback : ['1', 'true', 'yes'].includes(value.toLowerCase());

export const config = {
    port: Number(process.env.PORT) || 4100,
    jwtSecret: process.env.JWT_SECRET || '',
    sessionHours: Number(process.env.SESSION_HOURS) || 8,
    hik: {
        host: (process.env.HIK_HOST || '').replace(/\/+$/, ''),
        appKey: process.env.HIK_APP_KEY || '',
        appSecret: process.env.HIK_APP_SECRET || '',
        userId: process.env.HIK_USER_ID || 'admin',
        insecureTls: bool(process.env.HIK_INSECURE_TLS),
    },
    notifyMode: (process.env.NOTIFY_MODE || 'console') as 'console' | 'live',
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
    },
    smtp: {
        host: process.env.SMTP_HOST || '',
        port: Number(process.env.SMTP_PORT) || 587,
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.SMTP_FROM || '',
    },
};

/** Falha cedo se faltar algo essencial para subir o servidor. */
export function assertConfig() {
    const missing: string[] = [];
    if (config.jwtSecret.length < 16) missing.push('JWT_SECRET (mínimo 16 caracteres)');
    if (!config.hik.host) missing.push('HIK_HOST');
    if (!config.hik.appKey) missing.push('HIK_APP_KEY');
    if (!config.hik.appSecret) missing.push('HIK_APP_SECRET');
    if (config.notifyMode === 'console' && process.env.NODE_ENV === 'production') {
        missing.push('NOTIFY_MODE=live (o modo console imprime o código no log e não pode ir para produção)');
    }
    if (missing.length) throw new Error(`Configuração incompleta: ${missing.join(', ')}`);
}
