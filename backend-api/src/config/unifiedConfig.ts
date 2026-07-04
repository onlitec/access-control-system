import dotenv from 'dotenv';
import type { SignOptions } from 'jsonwebtoken';

dotenv.config();

const parseSafeInt = (value: string | undefined, fallback: number, min = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min ? Math.floor(parsed) : fallback;
};

export const config = {
    PORT: process.env.PORT || 3001,
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    APP_VERSION: process.env.APP_VERSION || '0.0.0',
    
    JWT: {
        SECRET: process.env.JWT_SECRET as string,
        EXPIRES_IN: (process.env.JWT_EXPIRES_IN || '1d') as SignOptions['expiresIn'],
        REFRESH_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
        MAX_ACTIVE_SESSIONS: parseSafeInt(process.env.MAX_ACTIVE_REFRESH_SESSIONS, 5, 1),
    },

    HIKCENTRAL: {
        VISITOR_GROUP_NAME_VISITANTES: process.env.HIK_VISITOR_GROUP_NAME_VISITANTES?.trim() || 'VISITANTES',
        VISITOR_GROUP_NAME_PRESTADORES: process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES?.trim() || 'PRESTADORES',
    },

    SESSION_AUDIT: {
        EXPORT_MAX_LIMIT: parseSafeInt(process.env.SESSION_AUDIT_EXPORT_MAX_LIMIT, 20000, 1),
        RETENTION_DAYS: parseSafeInt(process.env.SESSION_AUDIT_RETENTION_DAYS, 90),
        PRUNE_INTERVAL_MINUTES: parseSafeInt(process.env.SESSION_AUDIT_PRUNE_INTERVAL_MINUTES, 60),
    },

    SMTP: {
        HOST: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
        PORT: parseSafeInt(process.env.SMTP_PORT, 587, 1),
        USER: process.env.SMTP_USER || '',
        PASSWORD: process.env.SMTP_PASSWORD || '',
        // Brevo exige remetente validado na conta; por padrao usa o login SMTP
        FROM: process.env.SMTP_FROM || process.env.SMTP_USER || '',
        FROM_NAME: process.env.SMTP_FROM_NAME || 'OnliAcesso',
    },

    SECURITY_METRICS: {
        WINDOW_HOURS: parseSafeInt(process.env.SECURITY_METRICS_WINDOW_HOURS, 24, 1),
        TOP_N: parseSafeInt(process.env.SECURITY_METRICS_TOP_N, 10, 1),
        SNAPSHOT_INTERVAL_MINUTES: parseSafeInt(process.env.SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES, 15),
        SNAPSHOT_RETENTION_DAYS: parseSafeInt(process.env.SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS, 30),
        HISTORY_DEFAULT_POINTS: parseSafeInt(process.env.SECURITY_METRICS_HISTORY_DEFAULT_POINTS, 96, 1),
    }
};

if (!config.JWT.SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production');
    }
    config.JWT.SECRET = 'dev-secret-only';
}
