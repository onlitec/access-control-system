import dotenv from 'dotenv';

// ENV_FILE permite manter a configuração (e segredos) fora da pasta do programa, ex.: no Windows em ProgramData.
dotenv.config(process.env.ENV_FILE ? { path: process.env.ENV_FILE } : undefined);

const bool = (value: string | undefined, fallback = false) =>
    value === undefined || value === '' ? fallback : ['1', 'true', 'yes'].includes(value.toLowerCase());

export const config = {
    port: Number(process.env.PORT) || 4100,
    /** Por padrão só aceita conexões da própria máquina (proxy reverso/túnel HTTPS na frente) */
    host: process.env.HOST || '127.0.0.1',
    jwtSecret: process.env.JWT_SECRET || '',
    sessionHours: Number(process.env.SESSION_HOURS) || 8,
    /** Endereço público do módulo, usado nos links de convite (sem barra no fim) */
    publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
    /** Endereço público só para os visitantes (links de convite). Se vazio, usa o mesmo do morador */
    visitorUrl: (process.env.VISITOR_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
    inviteDays: Number(process.env.INVITE_DAYS) || 7,
    /** Dias sem visita até apagar um visitante salvo (dados e fotos) */
    savedRetentionDays: Number(process.env.SAVED_RETENTION_DAYS) || 180,
    /** Fuso usado nos horários enviados ao HikCentral */
    tzOffset: process.env.HIKCENTRAL_TZ_OFFSET || '-03:00',
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
    vapid: {
        publicKey: process.env.VAPID_PUBLIC_KEY || '',
        privateKey: process.env.VAPID_PRIVATE_KEY || '',
        subject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
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
