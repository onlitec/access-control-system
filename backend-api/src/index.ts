import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import { HikCentralService } from './services/HikCentralService';
import {
    calculateSecurityMetrics,
    createSecurityMetricsSnapshot,
    listSecurityMetricsHistory,
    pruneSecurityMetricsSnapshots,
} from './services/securityMetrics';
import hikcentralVisitorsRouter from './routes/hikcentral-visitors';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import crypto from 'crypto';

import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

dotenv.config();

// ============ HikCentral Department → Platform Role Mapping ============
/**
 * Mapeamento dinâmico: orgIndexCode (HikCentral) → Role da plataforma.
 * Baseado nos departamentos reais do condomínio Calabasas:
 *   1  = CALABASAS (raiz - ignorado)
 *   3  = PRESTADORES
 *   4  = ADMINISTRADORES
 *   5  = PORTARIA
 *   6  = CONDOMINIO
 *   7  = MORADORES
 *   8  = VISITANTES
 */
const HIK_ORG_ROLE_MAP: Record<string, string> = {
    '1': 'SISTEMA',       // Raiz - ignorado nas listagens
    '3': 'PRESTADOR',     // Prestadores de serviço
    '4': 'ADMIN',         // Administradores / Gestão
    '5': 'PORTARIA',      // Equipe da Portaria
    '6': 'ADMIN',         // Condomínio (também admin)
    '7': 'MORADOR',       // Moradores / Condôminos
    '8': 'VISITANTE',     // Visitantes cadastrados
};

/**
 * Nomes legíveis dos departamentos HikCentral.
 */
const HIK_ORG_NAMES: Record<string, string> = {
    '1': 'CALABASAS',
    '3': 'PRESTADORES',
    '4': 'ADMINISTRADORES',
    '5': 'PORTARIA',
    '6': 'CONDOMINIO',
    '7': 'MORADORES',
    '8': 'VISITANTES',
};

/**
 * Retorna o role da plataforma baseado no orgIndexCode do HikCentral.
 * Faz lookup dinâmico no mapa, com fallback para busca por nome no HikCentral.
 */
function resolveRoleFromOrg(orgIndexCode: string): string {
    return HIK_ORG_ROLE_MAP[orgIndexCode] || 'DESCONHECIDO';
}

/**
 * org codes que representam Moradores (exibidos no painel de portaria).
 */
const RESIDENT_ORG_CODES = ['7'];

/**
 * org codes que representam Funcionários do Condomínio (Staff + Prestadores fixos).
 * Org 3 e 10 = PRESTADORES, 4 = ADMINISTRADORES, 5 = PORTARIA, 6 = CONDOMINIO
 */
const STAFF_ORG_CODES = ['3', '4', '5', '6', '10'];

/**
 * Nomes dos grupos de visitantes no módulo Visitor do HikCentral.
 * Visitantes e prestadores são segregados por grupo, não por departamento/org.
 * Podem ser sobrescritos por variáveis de ambiente.
 */
const HIK_VISITOR_GROUP_NAME_VISITANTES = process.env.HIK_VISITOR_GROUP_NAME_VISITANTES?.trim() || 'VISITANTES';
const HIK_VISITOR_GROUP_NAME_PRESTADORES = process.env.HIK_VISITOR_GROUP_NAME_PRESTADORES?.trim() || 'PRESTADORES';

/**
 * org codes que NÃO devem aparecer em listagens operacionais.
 */
const SYSTEM_ORG_CODES = ['1'];

const extractHikVisitorList = (result: any): any[] => {
    const list = result?.data?.VisitorInfo || result?.data?.list || [];
    return Array.isArray(list) ? list : [];
};

const getHikVisitorTotal = (result: any, list: any[]): number => {
    const total = Number(result?.data?.total);
    return Number.isFinite(total) ? total : list.length;
};

const getVisitorsFromHikGroup = async (
    groupName: string,
    params: {
        pageNo?: number;
        pageSize?: number;
        personName?: string;
        phoneNum?: string;
        identifiyCode?: string;
    } = {}
) => {
    try {
        const { groupId, result } = await HikCentralService.getVisitorsByGroupName(groupName, params);
        return {
            groupId,
            result,
            visitors: extractHikVisitorList(result),
        };
    } catch (error: any) {
        console.warn(`[HikCentral Integration] Warning: Visitor group '${groupName}' not found or unavailable:`, error.message);
        return {
            groupId: '',
            result: { data: { total: 0 } },
            visitors: [],
        };
    }
};

const getAllVisitorsFromHikGroup = async (
    groupName: string,
    params: {
        pageSize?: number;
        personName?: string;
        phoneNum?: string;
        identifiyCode?: string;
    } = {}
) => {
    try {
        const pageSize = Math.min(1000, Math.max(50, params.pageSize || 500));
        const aggregated: any[] = [];
        const seenIds = new Set<string>();
        let groupId: string | null = null;
        let pageNo = 1;
        let total = Number.POSITIVE_INFINITY;

        while (aggregated.length < total) {
            const page = await getVisitorsFromHikGroup(groupName, {
                pageNo,
                pageSize,
                personName: params.personName,
                phoneNum: params.phoneNum,
                identifiyCode: params.identifiyCode,
            });
            if (groupId == null) groupId = page.groupId;

            const list = page.visitors || [];
            const pageTotal = Number(page.result?.data?.total);
            if (Number.isFinite(pageTotal)) {
                total = pageTotal;
            }

            if (!Array.isArray(list) || list.length === 0) {
                break;
            }

            for (const item of list) {
                const id = String(item?.visitorId || item?.indexCode || '').trim();
                const key = id || JSON.stringify(item);
                if (!seenIds.has(key)) {
                    seenIds.add(key);
                    aggregated.push(item);
                }
            }

            if (list.length < pageSize) {
                break;
            }
            pageNo++;
        }

        return {
            groupId: groupId || '',
            result: { data: { total: aggregated.length } },
            visitors: aggregated,
        };
    } catch (error: any) {
        console.warn(`[HikCentral Integration] Warning: Visitor group '${groupName}' not found or unavailable:`, error.message);
        return {
            groupId: '',
            result: { data: { total: 0 } },
            visitors: [],
        };
    }
};

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '1d') as SignOptions['expiresIn'];
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const maxActiveSessionsRaw = Number(process.env.MAX_ACTIVE_REFRESH_SESSIONS || '5');
const MAX_ACTIVE_REFRESH_SESSIONS = Number.isFinite(maxActiveSessionsRaw) && maxActiveSessionsRaw > 0
    ? Math.floor(maxActiveSessionsRaw)
    : 5;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const sessionAuditExportMaxLimitRaw = Number(process.env.SESSION_AUDIT_EXPORT_MAX_LIMIT || '20000');
const SESSION_AUDIT_EXPORT_MAX_LIMIT = Number.isFinite(sessionAuditExportMaxLimitRaw) && sessionAuditExportMaxLimitRaw > 0
    ? Math.floor(sessionAuditExportMaxLimitRaw)
    : 20000;
const sessionAuditRetentionDaysRaw = Number(process.env.SESSION_AUDIT_RETENTION_DAYS || '90');
const SESSION_AUDIT_RETENTION_DAYS = Number.isFinite(sessionAuditRetentionDaysRaw) && sessionAuditRetentionDaysRaw >= 0
    ? Math.floor(sessionAuditRetentionDaysRaw)
    : 90;
const sessionAuditPruneIntervalMinutesRaw = Number(process.env.SESSION_AUDIT_PRUNE_INTERVAL_MINUTES || '60');
const SESSION_AUDIT_PRUNE_INTERVAL_MINUTES = Number.isFinite(sessionAuditPruneIntervalMinutesRaw) && sessionAuditPruneIntervalMinutesRaw >= 0
    ? Math.floor(sessionAuditPruneIntervalMinutesRaw)
    : 60;
const securityMetricsWindowHoursRaw = Number(process.env.SECURITY_METRICS_WINDOW_HOURS || '24');
const SECURITY_METRICS_WINDOW_HOURS = Number.isFinite(securityMetricsWindowHoursRaw) && securityMetricsWindowHoursRaw > 0
    ? Math.floor(securityMetricsWindowHoursRaw)
    : 24;
const securityMetricsTopNRaw = Number(process.env.SECURITY_METRICS_TOP_N || '10');
const SECURITY_METRICS_TOP_N = Number.isFinite(securityMetricsTopNRaw) && securityMetricsTopNRaw > 0
    ? Math.floor(securityMetricsTopNRaw)
    : 10;
const securityMetricsSnapshotIntervalMinutesRaw = Number(process.env.SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES || '15');
const SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES = Number.isFinite(securityMetricsSnapshotIntervalMinutesRaw) && securityMetricsSnapshotIntervalMinutesRaw >= 0
    ? Math.floor(securityMetricsSnapshotIntervalMinutesRaw)
    : 15;
const securityMetricsSnapshotRetentionDaysRaw = Number(process.env.SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS || '30');
const SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS = Number.isFinite(securityMetricsSnapshotRetentionDaysRaw) && securityMetricsSnapshotRetentionDaysRaw >= 0
    ? Math.floor(securityMetricsSnapshotRetentionDaysRaw)
    : 30;
const securityMetricsHistoryDefaultPointsRaw = Number(process.env.SECURITY_METRICS_HISTORY_DEFAULT_POINTS || '96');
const SECURITY_METRICS_HISTORY_DEFAULT_POINTS = Number.isFinite(securityMetricsHistoryDefaultPointsRaw) && securityMetricsHistoryDefaultPointsRaw > 0
    ? Math.floor(securityMetricsHistoryDefaultPointsRaw)
    : 96;

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be set');
}

const allowedOrigins = CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
const corsOptions = CORS_ORIGIN === '*' ? {} : { origin: allowedOrigins, credentials: true };

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============ HikCentral Visitors/Prestadores Routes ============
app.use('/api/hikcentral', hikcentralVisitorsRouter);

const parseDurationToMs = (input: string): number => {
    const match = /^(\d+)([smhd])$/i.exec(input.trim());
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier: Record<string, number> = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };
    return value * multiplier[unit];
};

const REFRESH_TOKEN_TTL_MS = parseDurationToMs(REFRESH_TOKEN_EXPIRES_IN);

const getRefreshExpiry = (): Date => new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
const hashRefreshToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
const generateRefreshToken = (): string => crypto.randomBytes(48).toString('base64url');

const signAccessToken = (user: { id: string; email: string; role: string }): string => {
    const signOptions: SignOptions = { expiresIn: JWT_EXPIRES_IN };
    return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET as string, signOptions);
};

const getClientIp = (req: any): string | undefined => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || undefined;
};

const getUserAgent = (req: any): string | undefined => {
    const ua = req.headers['user-agent'];
    return typeof ua === 'string' ? ua.slice(0, 500) : undefined;
};

const logSessionAuditEvent = async (params: {
    eventType: string;
    success: boolean;
    req: any;
    userId?: string | null;
    userEmail?: string | null;
    sessionId?: string | null;
    details?: string;
}) => {
    try {
        await prisma.sessionAuditEvent.create({
            data: {
                eventType: params.eventType,
                success: params.success,
                userId: params.userId ?? null,
                userEmail: params.userEmail ?? null,
                sessionId: params.sessionId ?? null,
                ipAddress: getClientIp(params.req),
                userAgent: getUserAgent(params.req),
                details: params.details?.slice(0, 1000),
            },
        });
    } catch (error: any) {
        console.error('Session audit log error:', error);
    }
};

const SESSION_AUDIT_SORTABLE_COLUMNS = ['createdAt', 'eventType', 'success', 'userEmail', 'ipAddress'] as const;
type SessionAuditSortableColumn = typeof SESSION_AUDIT_SORTABLE_COLUMNS[number];
type SessionAuditOrder = 'asc' | 'desc';

const parseSessionAuditWhere = (query: Record<string, string | undefined>) => {
    const { userEmail, eventType, success, startTime, endTime, ipAddress, sessionId } = query;
    const where: any = {};

    if (userEmail) {
        where.userEmail = { contains: userEmail, mode: 'insensitive' };
    }
    if (eventType) {
        where.eventType = eventType;
    }
    if (ipAddress) {
        where.ipAddress = { contains: ipAddress, mode: 'insensitive' };
    }
    if (sessionId) {
        where.sessionId = { contains: sessionId };
    }
    if (success === 'true' || success === 'false') {
        where.success = success === 'true';
    }
    if (startTime || endTime) {
        where.createdAt = {};
        if (startTime) {
            const startDate = new Date(startTime);
            if (Number.isNaN(startDate.getTime())) {
                throw new Error('startTime inválido');
            }
            where.createdAt.gte = startDate;
        }
        if (endTime) {
            const endDate = new Date(endTime);
            if (Number.isNaN(endDate.getTime())) {
                throw new Error('endTime inválido');
            }
            where.createdAt.lte = endDate;
        }
    }

    return where;
};

const parseSessionAuditSort = (query: Record<string, string | undefined>) => {
    const sortByRaw = query.sortBy || 'createdAt';
    const sortOrderRaw = (query.sortOrder || 'desc').toLowerCase();
    if (!SESSION_AUDIT_SORTABLE_COLUMNS.includes(sortByRaw as SessionAuditSortableColumn)) {
        throw new Error(`sortBy inválido. Valores aceitos: ${SESSION_AUDIT_SORTABLE_COLUMNS.join(', ')}`);
    }
    if (sortOrderRaw !== 'asc' && sortOrderRaw !== 'desc') {
        throw new Error('sortOrder inválido. Valores aceitos: asc, desc');
    }

    const sortBy = sortByRaw as SessionAuditSortableColumn;
    const sortOrder = sortOrderRaw as SessionAuditOrder;
    return { sortBy, sortOrder };
};

// Auth middleware
const authMiddleware = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Invalid token format' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET as string) as { id: string; email: string; role: string };
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Routes will continue in the next part...
// This is a partial update focusing on the key changes for visitor groups

export { app, prisma, authMiddleware, HIK_VISITOR_GROUP_NAME_VISITANTES, HIK_VISITOR_GROUP_NAME_PRESTADORES };