import dotenv from 'dotenv';
import type { SignOptions } from 'jsonwebtoken';

dotenv.config();

export const config = {
    PORT: process.env.PORT || 3001,
    JWT_SECRET: process.env.JWT_SECRET || 'your-default-secret',
    JWT_EXPIRES_IN: (process.env.JWT_EXPIRES_IN || '1d') as SignOptions['expiresIn'],
    REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    MAX_ACTIVE_REFRESH_SESSIONS: Number(process.env.MAX_ACTIVE_REFRESH_SESSIONS) || 5,
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

    HIKCENTRAL: {
        VISITOR_GROUP_NAME_VISITANTES: process.env.HIK_VISITOR_GROUP_NAME_VISITANTES?.trim() || 'VISITANTES',
        VISITOR_GROUP_NAME_PRESTADORES: process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES?.trim() || 'PRESTADORES',
        MORADORES_DEPT_NAME: process.env.HIK_MORADORES_DEPT_NAME || 'MORADORES',
        MORADORES_DEPT_ID: '7', // Based on index.ts HIK_ORG_ROLE_MAP
    },

    SESSION_AUDIT: {
        EXPORT_MAX_LIMIT: Number(process.env.SESSION_AUDIT_EXPORT_MAX_LIMIT) || 20000,
        RETENTION_DAYS: Number(process.env.SESSION_AUDIT_RETENTION_DAYS) || 90,
        PRUNE_INTERVAL_MINUTES: Number(process.env.SESSION_AUDIT_PRUNE_INTERVAL_MINUTES) || 60,
    },

    SECURITY_METRICS: {
        WINDOW_HOURS: Number(process.env.SECURITY_METRICS_WINDOW_HOURS) || 24,
        TOP_N: Number(process.env.SECURITY_METRICS_TOP_N) || 10,
        SNAPSHOT_INTERVAL_MINUTES: Number(process.env.SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES) || 15,
        SNAPSHOT_RETENTION_DAYS: Number(process.env.SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS) || 30,
        HISTORY_DEFAULT_POINTS: Number(process.env.SECURITY_METRICS_HISTORY_DEFAULT_POINTS) || 96,
    }
};
