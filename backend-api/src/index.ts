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
 * org codes que NÃO devem aparecer em listagens operacionais.
 */
const SYSTEM_ORG_CODES = ['1'];

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
app.use(express.json());

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
    return { sortBy, sortOrder, orderBy: { [sortBy]: sortOrder } };
};

const pruneSessionAuditEvents = async () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - SESSION_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleted = await prisma.sessionAuditEvent.deleteMany({
        where: {
            createdAt: {
                lt: cutoff,
            },
        },
    });
    console.log(
        JSON.stringify({
            action: 'prune_session_audit_events',
            retentionDays: SESSION_AUDIT_RETENTION_DAYS,
            cutoff: cutoff.toISOString(),
            deleted: deleted.count,
            timestamp: now.toISOString(),
        }),
    );
};

const escapeCsv = (value: unknown): string => {
    const str = value == null ? '' : String(value);
    return `"${str.replace(/"/g, '""')}"`;
};

const SERVICE_PROVIDER_TYPES = ['fixed', 'temporary'] as const;
type ServiceProviderType = typeof SERVICE_PROVIDER_TYPES[number];

type ServiceProviderWriteData = {
    fullName?: string;
    companyName?: string | null;
    document?: string;
    phone?: string | null;
    email?: string | null;
    serviceType?: string;
    providerType?: ServiceProviderType;
    photoUrl?: string | null;
    documentPhotoUrl?: string | null;
    tower?: string | null;
    visitingResident?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
    authorizedUnits?: Prisma.InputJsonValue | null;
    notes?: string | null;
    hikcentralPersonId?: string | null;
    createdBy?: string | null;
};

const hasOwn = (obj: Record<string, unknown>, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(obj, key);

const hasAnyField = (obj: Record<string, unknown>, keys: string[]): boolean =>
    keys.some((key) => hasOwn(obj, key));

const getFirstField = (obj: Record<string, unknown>, keys: string[]): unknown => {
    for (const key of keys) {
        if (hasOwn(obj, key)) {
            return obj[key];
        }
    }
    return undefined;
};

const normalizeRequiredText = (value: unknown, fieldLabel: string): string => {
    if (typeof value !== 'string') {
        throw new Error(`${fieldLabel} é obrigatório`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error(`${fieldLabel} é obrigatório`);
    }
    return trimmed;
};

const normalizeOptionalText = (value: unknown, fieldLabel: string): string | null => {
    if (value == null) return null;
    if (typeof value !== 'string') {
        throw new Error(`${fieldLabel} inválido`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const normalizeProviderType = (value: unknown): ServiceProviderType => {
    if (typeof value !== 'string') {
        throw new Error('provider_type inválido. Valores aceitos: fixed, temporary');
    }
    const normalized = value.trim().toLowerCase();
    if (!SERVICE_PROVIDER_TYPES.includes(normalized as ServiceProviderType)) {
        throw new Error('provider_type inválido. Valores aceitos: fixed, temporary');
    }
    return normalized as ServiceProviderType;
};

const normalizeAuthorizedUnits = (value: unknown): Prisma.InputJsonValue | null => {
    if (value == null) return null;
    if (!Array.isArray(value)) {
        throw new Error('authorized_units inválido. Informe um array de strings');
    }
    const units = value
        .map((item) => {
            if (typeof item !== 'string') {
                throw new Error('authorized_units inválido. Informe um array de strings');
            }
            return item.trim();
        })
        .filter((item) => item.length > 0);
    return units;
};

const parseServiceProviderPayload = (
    body: Record<string, unknown>,
    partial = false,
): ServiceProviderWriteData => {
    const data: ServiceProviderWriteData = {};

    const fullNameKeys = ['full_name', 'fullName'];
    const documentKeys = ['document'];
    const serviceTypeKeys = ['service_type', 'serviceType'];
    const providerTypeKeys = ['provider_type', 'providerType'];
    const companyNameKeys = ['company_name', 'companyName'];
    const phoneKeys = ['phone'];
    const emailKeys = ['email'];
    const photoUrlKeys = ['photo_url', 'photoUrl'];
    const documentPhotoUrlKeys = ['document_photo_url', 'documentPhotoUrl'];
    const towerKeys = ['tower'];
    const visitingResidentKeys = ['visiting_resident', 'visitingResident'];
    const validFromKeys = ['valid_from', 'validFrom'];
    const validUntilKeys = ['valid_until', 'validUntil'];
    const authorizedUnitsKeys = ['authorized_units', 'authorizedUnits'];
    const notesKeys = ['notes'];
    const hikcentralPersonIdKeys = ['hikcentral_person_id', 'hikcentralPersonId'];
    const createdByKeys = ['created_by', 'createdBy'];

    if (!partial || hasAnyField(body, fullNameKeys)) {
        data.fullName = normalizeRequiredText(getFirstField(body, fullNameKeys), 'full_name');
    }
    if (!partial || hasAnyField(body, documentKeys)) {
        data.document = normalizeRequiredText(getFirstField(body, documentKeys), 'document');
    }
    if (!partial || hasAnyField(body, serviceTypeKeys)) {
        data.serviceType = normalizeRequiredText(getFirstField(body, serviceTypeKeys), 'service_type');
    }

    if (!partial || hasAnyField(body, providerTypeKeys)) {
        const rawProviderType = getFirstField(body, providerTypeKeys);
        data.providerType = rawProviderType == null || rawProviderType === ''
            ? 'temporary'
            : normalizeProviderType(rawProviderType);
    }

    if (!partial || hasAnyField(body, companyNameKeys)) {
        data.companyName = normalizeOptionalText(getFirstField(body, companyNameKeys), 'company_name');
    }
    if (!partial || hasAnyField(body, phoneKeys)) {
        data.phone = normalizeOptionalText(getFirstField(body, phoneKeys), 'phone');
    }
    if (!partial || hasAnyField(body, emailKeys)) {
        data.email = normalizeOptionalText(getFirstField(body, emailKeys), 'email');
    }
    if (!partial || hasAnyField(body, photoUrlKeys)) {
        data.photoUrl = normalizeOptionalText(getFirstField(body, photoUrlKeys), 'photo_url');
    }
    if (!partial || hasAnyField(body, documentPhotoUrlKeys)) {
        data.documentPhotoUrl = normalizeOptionalText(getFirstField(body, documentPhotoUrlKeys), 'document_photo_url');
    }
    if (!partial || hasAnyField(body, towerKeys)) {
        data.tower = normalizeOptionalText(getFirstField(body, towerKeys), 'tower');
    }
    if (!partial || hasAnyField(body, visitingResidentKeys)) {
        data.visitingResident = normalizeOptionalText(getFirstField(body, visitingResidentKeys), 'visiting_resident');
    }
    if (!partial || hasAnyField(body, validFromKeys)) {
        data.validFrom = normalizeOptionalText(getFirstField(body, validFromKeys), 'valid_from');
    }
    if (!partial || hasAnyField(body, validUntilKeys)) {
        data.validUntil = normalizeOptionalText(getFirstField(body, validUntilKeys), 'valid_until');
    }
    if (!partial || hasAnyField(body, authorizedUnitsKeys)) {
        data.authorizedUnits = normalizeAuthorizedUnits(getFirstField(body, authorizedUnitsKeys));
    }
    if (!partial || hasAnyField(body, notesKeys)) {
        data.notes = normalizeOptionalText(getFirstField(body, notesKeys), 'notes');
    }
    if (!partial || hasAnyField(body, hikcentralPersonIdKeys)) {
        data.hikcentralPersonId = normalizeOptionalText(
            getFirstField(body, hikcentralPersonIdKeys),
            'hikcentral_person_id',
        );
    }
    if (!partial || hasAnyField(body, createdByKeys)) {
        data.createdBy = normalizeOptionalText(getFirstField(body, createdByKeys), 'created_by');
    }

    return data;
};

const extractAuthorizedUnits = (value: Prisma.JsonValue | null): string[] | null => {
    if (!Array.isArray(value)) return null;
    const units = value.filter((item): item is string => typeof item === 'string');
    return units;
};

const serializeServiceProvider = (provider: any) => ({
    id: provider.id,
    full_name: provider.fullName,
    company_name: provider.companyName,
    document: provider.document,
    phone: provider.phone,
    email: provider.email,
    service_type: provider.serviceType,
    provider_type: provider.providerType,
    photo_url: provider.photoUrl,
    document_photo_url: provider.documentPhotoUrl,
    tower: provider.tower,
    visiting_resident: provider.visitingResident,
    valid_from: provider.validFrom,
    valid_until: provider.validUntil,
    authorized_units: extractAuthorizedUnits(provider.authorizedUnits ?? null),
    notes: provider.notes,
    hikcentral_person_id: provider.hikcentralPersonId,
    created_by: provider.createdBy,
    created_at: provider.createdAt,
    updated_at: provider.updatedAt,
});

const serializeTower = (tower: any) => ({
    id: tower.id,
    name: tower.name,
    description: tower.description,
    is_active: tower.isActive,
    created_at: tower.createdAt,
    updated_at: tower.updatedAt,
});

const ensureServiceProviderRelations = async (data: ServiceProviderWriteData) => {
    if (data.tower) {
        const tower = await prisma.tower.findFirst({
            where: {
                name: data.tower,
                isActive: true,
            },
            select: { id: true },
        });
        if (!tower) {
            throw new Error('Torre informada não existe ou está inativa');
        }
    }

    if (data.visitingResident) {
        const resident = await prisma.person.findUnique({
            where: { id: data.visitingResident },
            select: { id: true },
        });
        if (!resident) {
            throw new Error('Morador informado não existe');
        }
    }
};

const revokeExcessActiveSessions = async (userId: string): Promise<number> => {
    const sessions = await prisma.refreshSession.findMany({
        where: {
            userId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
        },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
    });

    if (sessions.length <= MAX_ACTIVE_REFRESH_SESSIONS) {
        return 0;
    }

    const toRevoke = sessions.slice(MAX_ACTIVE_REFRESH_SESSIONS).map((session) => session.id);
    const result = await prisma.refreshSession.updateMany({
        where: { id: { in: toRevoke } },
        data: { revokedAt: new Date() },
    });
    return result.count;
};

// ============ Auth Routes ============
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email || !password) {
            await logSessionAuditEvent({
                eventType: 'login',
                success: false,
                req,
                userEmail: typeof email === 'string' ? email : null,
                details: 'missing_credentials',
            });
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            await logSessionAuditEvent({
                eventType: 'login',
                success: false,
                req,
                userEmail: email,
                details: 'user_not_found',
            });
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        // Legacy migration path: if plaintext password exists, validate once and upgrade to bcrypt hash.
        let isValidPassword = false;
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$')) {
            isValidPassword = await bcrypt.compare(password, user.password);
        } else if (user.password === password) {
            isValidPassword = true;
            const hashedPassword = await bcrypt.hash(password, 12);
            await prisma.user.update({
                where: { id: user.id },
                data: { password: hashedPassword },
            });
        }

        if (!isValidPassword) {
            await logSessionAuditEvent({
                eventType: 'login',
                success: false,
                req,
                userId: user.id,
                userEmail: user.email,
                details: 'invalid_password',
            });
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const token = signAccessToken(user);
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = hashRefreshToken(refreshToken);

        const createdSession = await prisma.refreshSession.create({
            data: {
                userId: user.id,
                tokenHash: refreshTokenHash,
                expiresAt: getRefreshExpiry(),
            },
        });
        await revokeExcessActiveSessions(user.id);
        await logSessionAuditEvent({
            eventType: 'login',
            success: true,
            req,
            userId: user.id,
            userEmail: user.email,
            sessionId: createdSession.id,
        });

        return res.json({
            token,
            refreshToken,
            user: { id: user.id, email: user.email, name: user.name, role: user.role },
        });
    } catch (error: any) {
        await logSessionAuditEvent({
            eventType: 'login',
            success: false,
            req,
            userEmail: typeof email === 'string' ? email : null,
            details: 'internal_error',
        });
        console.error('Login error:', error);
        res.status(500).json({ error: 'Erro interno no login' });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    try {
        if (!refreshToken) {
            await logSessionAuditEvent({
                eventType: 'refresh',
                success: false,
                req,
                details: 'missing_refresh_token',
            });
            return res.status(400).json({ error: 'Refresh token é obrigatório' });
        }

        const currentHash = hashRefreshToken(refreshToken);
        const currentSession = await prisma.refreshSession.findUnique({
            where: { tokenHash: currentHash },
        });

        if (!currentSession || currentSession.revokedAt || currentSession.expiresAt <= new Date()) {
            await logSessionAuditEvent({
                eventType: 'refresh',
                success: false,
                req,
                sessionId: currentSession?.id ?? null,
                userId: currentSession?.userId ?? null,
                details: 'invalid_refresh_token',
            });
            return res.status(401).json({ error: 'Refresh token inválido' });
        }

        const user = await prisma.user.findUnique({ where: { id: currentSession.userId } });
        if (!user) {
            await logSessionAuditEvent({
                eventType: 'refresh',
                success: false,
                req,
                userId: currentSession.userId,
                sessionId: currentSession.id,
                details: 'user_not_found',
            });
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        const nextRefreshToken = generateRefreshToken();
        const nextHash = hashRefreshToken(nextRefreshToken);

        const createdSession = await prisma.$transaction(async (tx) => {
            await tx.refreshSession.update({
                where: { id: currentSession.id },
                data: {
                    revokedAt: new Date(),
                    replacedByTokenHash: nextHash,
                },
            });
            return tx.refreshSession.create({
                data: {
                    userId: user.id,
                    tokenHash: nextHash,
                    expiresAt: getRefreshExpiry(),
                },
            });
        });
        await revokeExcessActiveSessions(user.id);
        await logSessionAuditEvent({
            eventType: 'refresh',
            success: true,
            req,
            userId: user.id,
            userEmail: user.email,
            sessionId: createdSession.id,
            details: `replaced_session=${currentSession.id}`,
        });

        const token = signAccessToken(user);
        return res.json({ token, refreshToken: nextRefreshToken });
    } catch (error: any) {
        await logSessionAuditEvent({
            eventType: 'refresh',
            success: false,
            req,
            details: 'internal_error',
        });
        console.error('Refresh error:', error);
        res.status(500).json({ error: 'Erro interno no refresh' });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    const { refreshToken } = req.body;
    try {
        if (!refreshToken) {
            await logSessionAuditEvent({
                eventType: 'logout',
                success: false,
                req,
                details: 'missing_refresh_token',
            });
            return res.status(400).json({ error: 'Refresh token é obrigatório' });
        }

        const tokenHash = hashRefreshToken(refreshToken);
        const existingSession = await prisma.refreshSession.findUnique({
            where: { tokenHash },
            select: { id: true, userId: true },
        });
        const result = await prisma.refreshSession.updateMany({
            where: {
                tokenHash,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
            },
        });
        await logSessionAuditEvent({
            eventType: 'logout',
            success: result.count > 0,
            req,
            userId: existingSession?.userId ?? null,
            sessionId: existingSession?.id ?? null,
            details: result.count > 0 ? 'revoked' : 'already_revoked_or_not_found',
        });

        return res.status(204).send();
    } catch (error: any) {
        await logSessionAuditEvent({
            eventType: 'logout',
            success: false,
            req,
            details: 'internal_error',
        });
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Erro interno no logout' });
    }
});

// ============ Auth Middleware ============
const authMiddleware = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        (req as any).user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const adminMiddleware = (req: any, res: any, next: any) => {
    const role = (req as any).user?.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
};

app.post('/api/auth/logout-all', authMiddleware, async (req, res) => {
    try {
        const userId = (req as any).user?.id as string | undefined;
        const userEmail = (req as any).user?.email as string | undefined;
        if (!userId) {
            await logSessionAuditEvent({
                eventType: 'logout_all',
                success: false,
                req,
                details: 'invalid_token_payload',
            });
            return res.status(401).json({ error: 'Invalid token payload' });
        }

        const result = await prisma.refreshSession.updateMany({
            where: {
                userId,
                revokedAt: null,
            },
            data: {
                revokedAt: new Date(),
            },
        });
        await logSessionAuditEvent({
            eventType: 'logout_all',
            success: true,
            req,
            userId,
            userEmail: userEmail ?? null,
            details: `revoked=${result.count}`,
        });

        return res.json({ revokedSessions: result.count });
    } catch (error: any) {
        await logSessionAuditEvent({
            eventType: 'logout_all',
            success: false,
            req,
            userId: (req as any).user?.id ?? null,
            userEmail: (req as any).user?.email ?? null,
            details: 'internal_error',
        });
        console.error('Logout-all error:', error);
        res.status(500).json({ error: 'Erro interno no logout-all' });
    }
});

app.get('/api/auth/sessions', authMiddleware, async (req, res) => {
    try {
        const userId = (req as any).user?.id as string | undefined;
        const userEmail = (req as any).user?.email as string | undefined;
        if (!userId) {
            await logSessionAuditEvent({
                eventType: 'list_sessions',
                success: false,
                req,
                details: 'invalid_token_payload',
            });
            return res.status(401).json({ error: 'Invalid token payload' });
        }

        const sessions = await prisma.refreshSession.findMany({
            where: {
                userId,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            select: {
                id: true,
                createdAt: true,
                expiresAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        await logSessionAuditEvent({
            eventType: 'list_sessions',
            success: true,
            req,
            userId,
            userEmail: userEmail ?? null,
            details: `count=${sessions.length}`,
        });

        return res.json({
            data: sessions,
            count: sessions.length,
            maxActiveSessions: MAX_ACTIVE_REFRESH_SESSIONS,
        });
    } catch (error: any) {
        await logSessionAuditEvent({
            eventType: 'list_sessions',
            success: false,
            req,
            userId: (req as any).user?.id ?? null,
            userEmail: (req as any).user?.email ?? null,
            details: 'internal_error',
        });
        console.error('List sessions error:', error);
        res.status(500).json({ error: 'Erro interno ao listar sessões' });
    }
});

app.post('/api/auth/revoke-session', authMiddleware, async (req, res) => {
    const { sessionId } = req.body;
    try {
        const userId = (req as any).user?.id as string | undefined;
        const userEmail = (req as any).user?.email as string | undefined;
        if (!userId) {
            await logSessionAuditEvent({
                eventType: 'revoke_session',
                success: false,
                req,
                details: 'invalid_token_payload',
            });
            return res.status(401).json({ error: 'Invalid token payload' });
        }
        if (!sessionId || typeof sessionId !== 'string') {
            await logSessionAuditEvent({
                eventType: 'revoke_session',
                success: false,
                req,
                userId,
                userEmail: userEmail ?? null,
                details: 'missing_session_id',
            });
            return res.status(400).json({ error: 'sessionId é obrigatório' });
        }

        const session = await prisma.refreshSession.findUnique({
            where: { id: sessionId },
            select: { id: true, userId: true, revokedAt: true },
        });
        if (!session || session.userId !== userId) {
            await logSessionAuditEvent({
                eventType: 'revoke_session',
                success: false,
                req,
                userId,
                userEmail: userEmail ?? null,
                sessionId,
                details: 'session_not_found_for_user',
            });
            return res.status(404).json({ error: 'Sessão não encontrada' });
        }
        if (session.revokedAt) {
            await logSessionAuditEvent({
                eventType: 'revoke_session',
                success: true,
                req,
                userId,
                userEmail: userEmail ?? null,
                sessionId,
                details: 'already_revoked',
            });
            return res.status(204).send();
        }

        await prisma.refreshSession.update({
            where: { id: sessionId },
            data: { revokedAt: new Date() },
        });
        await logSessionAuditEvent({
            eventType: 'revoke_session',
            success: true,
            req,
            userId,
            userEmail: userEmail ?? null,
            sessionId,
            details: 'revoked',
        });
        return res.status(204).send();
    } catch (error: any) {
        await logSessionAuditEvent({
            eventType: 'revoke_session',
            success: false,
            req,
            userId: (req as any).user?.id ?? null,
            userEmail: (req as any).user?.email ?? null,
            sessionId: typeof sessionId === 'string' ? sessionId : null,
            details: 'internal_error',
        });
        console.error('Revoke session error:', error);
        res.status(500).json({ error: 'Erro interno ao revogar sessão' });
    }
});

app.get('/api/security/session-audit', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const {
            page = '1',
            limit = '20',
        } = req.query as Record<string, string | undefined>;

        const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 20));
        let where: any = {};
        let orderBy: Record<string, SessionAuditOrder> = { createdAt: 'desc' };
        let sortBy: SessionAuditSortableColumn = 'createdAt';
        let sortOrder: SessionAuditOrder = 'desc';
        try {
            where = parseSessionAuditWhere(req.query as Record<string, string | undefined>);
            const sortParsed = parseSessionAuditSort(req.query as Record<string, string | undefined>);
            orderBy = sortParsed.orderBy;
            sortBy = sortParsed.sortBy;
            sortOrder = sortParsed.sortOrder;
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }

        const skip = (pageNum - 1) * limitNum;
        const [data, count, successCount, failureCount, loginFailureCount] = await Promise.all([
            prisma.sessionAuditEvent.findMany({
                where,
                skip,
                take: limitNum,
                orderBy,
                select: {
                    id: true,
                    userId: true,
                    userEmail: true,
                    eventType: true,
                    success: true,
                    sessionId: true,
                    ipAddress: true,
                    userAgent: true,
                    details: true,
                    createdAt: true,
                },
            }),
            prisma.sessionAuditEvent.count({ where }),
            prisma.sessionAuditEvent.count({
                where: {
                    ...where,
                    success: true,
                },
            }),
            prisma.sessionAuditEvent.count({
                where: {
                    ...where,
                    success: false,
                },
            }),
            prisma.sessionAuditEvent.count({
                where: {
                    ...where,
                    eventType: 'login',
                    success: false,
                },
            }),
        ]);

        return res.json({
            data,
            count,
            page: pageNum,
            limit: limitNum,
            sortBy,
            sortOrder,
            summary: {
                total: count,
                success: successCount,
                failure: failureCount,
                loginFailure: loginFailureCount,
            },
        });
    } catch (error: any) {
        console.error('Session audit query error:', error);
        return res.status(500).json({ error: 'Erro interno ao consultar auditoria de sessão' });
    }
});

app.get('/api/security/session-audit/export/meta', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { limit = '1000' } = req.query as Record<string, string | undefined>;
        const requestedLimit = Math.max(1, Number.parseInt(limit, 10) || 1000);
        const effectiveLimit = Math.min(SESSION_AUDIT_EXPORT_MAX_LIMIT, requestedLimit);

        let where: any = {};
        try {
            where = parseSessionAuditWhere(req.query as Record<string, string | undefined>);
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }

        const count = await prisma.sessionAuditEvent.count({ where });
        return res.json({
            count,
            requestedLimit,
            effectiveLimit,
            maxLimit: SESSION_AUDIT_EXPORT_MAX_LIMIT,
            truncated: count > effectiveLimit,
        });
    } catch (error: any) {
        console.error('Session audit export meta error:', error);
        return res.status(500).json({ error: 'Erro interno ao consultar meta de exportação' });
    }
});

app.get('/api/security/session-audit/export', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { limit = '1000' } = req.query as Record<string, string | undefined>;
        const take = Math.min(SESSION_AUDIT_EXPORT_MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 1000));

        let where: any = {};
        let orderBy: Record<string, SessionAuditOrder> = { createdAt: 'desc' };
        let sortBy: SessionAuditSortableColumn = 'createdAt';
        let sortOrder: SessionAuditOrder = 'desc';
        try {
            where = parseSessionAuditWhere(req.query as Record<string, string | undefined>);
            const sortParsed = parseSessionAuditSort(req.query as Record<string, string | undefined>);
            orderBy = sortParsed.orderBy;
            sortBy = sortParsed.sortBy;
            sortOrder = sortParsed.sortOrder;
        } catch (error: any) {
            return res.status(400).json({ error: error.message });
        }

        const [rows, totalCount] = await Promise.all([
            prisma.sessionAuditEvent.findMany({
                where,
                take,
                orderBy,
                select: {
                    createdAt: true,
                    eventType: true,
                    success: true,
                    userEmail: true,
                    sessionId: true,
                    ipAddress: true,
                    userAgent: true,
                    details: true,
                },
            }),
            prisma.sessionAuditEvent.count({ where }),
        ]);

        const header = [
            'createdAt',
            'eventType',
            'success',
            'userEmail',
            'sessionId',
            'ipAddress',
            'userAgent',
            'details',
        ].join(',');

        const lines = rows.map((row) => [
            escapeCsv(row.createdAt.toISOString()),
            escapeCsv(row.eventType),
            escapeCsv(row.success),
            escapeCsv(row.userEmail ?? ''),
            escapeCsv(row.sessionId ?? ''),
            escapeCsv(row.ipAddress ?? ''),
            escapeCsv(row.userAgent ?? ''),
            escapeCsv(row.details ?? ''),
        ].join(','));

        const csv = [header, ...lines].join('\n');
        const filenameTs = new Date().toISOString().replace(/[:.]/g, '-');
        const totalBytes = Buffer.byteLength(`\uFEFF${csv}`, 'utf-8');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="session-audit-${filenameTs}.csv"`);
        res.setHeader('Content-Length', String(totalBytes));
        res.setHeader('X-Session-Audit-Total', String(totalCount));
        res.setHeader('X-Session-Audit-Returned', String(rows.length));
        res.setHeader('X-Session-Audit-Limit', String(take));
        res.setHeader('X-Session-Audit-Max-Limit', String(SESSION_AUDIT_EXPORT_MAX_LIMIT));
        res.setHeader('X-Session-Audit-Sort-By', sortBy);
        res.setHeader('X-Session-Audit-Sort-Order', sortOrder);
        return res.status(200).send(`\uFEFF${csv}`);
    } catch (error: any) {
        console.error('Session audit export error:', error);
        return res.status(500).json({ error: 'Erro interno ao exportar auditoria de sessão' });
    }
});

app.get('/api/security/metrics', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { windowHours, topN } = req.query as Record<string, string | undefined>;
        const requestedWindowHours = Number.parseInt(windowHours || '', 10);
        const requestedTopN = Number.parseInt(topN || '', 10);
        const effectiveWindowHours = Number.isFinite(requestedWindowHours) && requestedWindowHours > 0
            ? Math.min(24 * 14, requestedWindowHours)
            : SECURITY_METRICS_WINDOW_HOURS;
        const effectiveTopN = Number.isFinite(requestedTopN) && requestedTopN > 0
            ? Math.min(100, requestedTopN)
            : SECURITY_METRICS_TOP_N;

        const metrics = await calculateSecurityMetrics(prisma, {
            windowHours: effectiveWindowHours,
            topN: effectiveTopN,
        });

        return res.json(metrics);
    } catch (error: any) {
        console.error('Security metrics query error:', error);
        return res.status(500).json({ error: 'Erro interno ao consultar métricas de segurança' });
    }
});

app.get('/api/security/metrics/history', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { windowHours, limit, startTime, endTime } = req.query as Record<string, string | undefined>;

        const requestedWindowHours = Number.parseInt(windowHours || '', 10);
        const effectiveWindowHours = Number.isFinite(requestedWindowHours) && requestedWindowHours > 0
            ? Math.min(24 * 14, requestedWindowHours)
            : undefined;

        const requestedLimit = Number.parseInt(limit || '', 10);
        const effectiveLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
            ? Math.min(500, requestedLimit)
            : SECURITY_METRICS_HISTORY_DEFAULT_POINTS;

        let parsedStartTime: Date | undefined;
        if (startTime) {
            const candidate = new Date(startTime);
            if (Number.isNaN(candidate.getTime())) {
                return res.status(400).json({ error: 'startTime inválido' });
            }
            parsedStartTime = candidate;
        }

        let parsedEndTime: Date | undefined;
        if (endTime) {
            const candidate = new Date(endTime);
            if (Number.isNaN(candidate.getTime())) {
                return res.status(400).json({ error: 'endTime inválido' });
            }
            parsedEndTime = candidate;
        }

        const history = await listSecurityMetricsHistory(prisma, {
            limit: effectiveLimit,
            windowHours: effectiveWindowHours,
            startTime: parsedStartTime,
            endTime: parsedEndTime,
        });

        return res.json({
            generatedAt: new Date().toISOString(),
            filters: {
                windowHours: effectiveWindowHours ?? null,
                limit: effectiveLimit,
                startTime: parsedStartTime?.toISOString() ?? null,
                endTime: parsedEndTime?.toISOString() ?? null,
            },
            count: history.length,
            data: history,
        });
    } catch (error: any) {
        console.error('Security metrics history query error:', error);
        return res.status(500).json({ error: 'Erro interno ao consultar histórico de métricas' });
    }
});

app.post('/api/security/metrics/snapshots', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const body = (req.body || {}) as Record<string, unknown>;
        const requestedWindowHours = Number.parseInt(String(body.windowHours || ''), 10);
        const requestedTopN = Number.parseInt(String(body.topN || ''), 10);

        const effectiveWindowHours = Number.isFinite(requestedWindowHours) && requestedWindowHours > 0
            ? Math.min(24 * 14, requestedWindowHours)
            : SECURITY_METRICS_WINDOW_HOURS;
        const effectiveTopN = Number.isFinite(requestedTopN) && requestedTopN > 0
            ? Math.min(100, requestedTopN)
            : SECURITY_METRICS_TOP_N;

        const result = await createSecurityMetricsSnapshot(prisma, {
            windowHours: effectiveWindowHours,
            topN: effectiveTopN,
        });

        return res.status(201).json(result);
    } catch (error: any) {
        console.error('Security metrics snapshot creation error:', error);
        return res.status(500).json({ error: 'Erro interno ao criar snapshot de métricas' });
    }
});

// ============ Health ============
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ Residents Sync (HikCentral + Local DB) ============
app.post('/api/persons/sync', authMiddleware, async (req, res) => {
    try {
        const { firstName, lastName, phone, email, orgIndexCode, personProperties } = req.body;

        // 1. Sync with HikCentral
        const hikResult = await HikCentralService.addPerson({
            personGivenName: firstName,
            personFamilyName: lastName,
            phoneNo: phone,
            email: email,
            orgIndexCode: orgIndexCode || '1',
            personProperties: personProperties
        });

        const hikPersonId = hikResult?.data?.personId;

        // 2. Save/Update Local DB
        const person = await prisma.person.upsert({
            where: { hikPersonId: hikPersonId || '' },
            update: {
                firstName,
                lastName,
                phone,
                email,
                orgIndexCode: orgIndexCode || '1',
            },
            create: {
                firstName,
                lastName,
                phone,
                email,
                orgIndexCode: orgIndexCode || '1',
                hikPersonId: hikPersonId,
            },
        });

        res.json({ success: true, person, hikResult });
    } catch (error: any) {
        console.error('Sync Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ Visitor Reservation (HikCentral + Local DB) ============
app.post('/api/visitors/reserve', authMiddleware, async (req, res) => {
    try {
        const { visitorName, certificateNo, visitStartTime, visitEndTime, plateNo, visitorPicData } = req.body;

        // 1. Sync with HikCentral
        const hikResult = await HikCentralService.reserveVisitor({
            visitorName,
            certificateNo,
            visitStartTime,
            visitEndTime,
            plateNo,
            visitorPicData,
        });

        const hikVisitorId = hikResult?.data?.visitorId;

        // 2. Save to Local DB
        const visitor = await prisma.visitor.create({
            data: {
                name: visitorName,
                certificateType: '111',
                certificateNo,
                visitStartTime: new Date(visitStartTime),
                visitEndTime: new Date(visitEndTime),
                plateNo,
                hikVisitorId,
            },
        });

        res.json({ success: true, visitor, hikResult });
    } catch (error: any) {
        console.error('Reservation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ Organizations (HikCentral) ============
app.get('/api/hikcentral/organizations', authMiddleware, async (req, res) => {
    try {
        const pageNo = parseInt(req.query.pageNo as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 100;
        const result = await HikCentralService.getOrgList(pageNo, pageSize);
        res.json({ success: true, data: result?.data || { list: [] } });
    } catch (error: any) {
        console.error('getOrganizations Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ Residents (Person) CRUD ============
app.get('/api/residents', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query as any;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        // Buscar somente MORADORES do HikCentral (orgIndexCode=7)
        try {
            const hikResult = await HikCentralService.getPersonList({
                orgIndexCode: '7', // MORADORES
                pageNo: pageNum,
                pageSize: limitNum,
            });
            const hikPersons = hikResult?.data?.list || [];

            if (hikPersons.length > 0) {
                // Mapear dados do HikCentral com classificação correta por departamento
                const residents = hikPersons.map((p: any) => {
                    const orgCode = String(p.orgIndexCode || '7');
                    const role = resolveRoleFromOrg(orgCode);
                    const orgName = HIK_ORG_NAMES[orgCode] || p.orgName || 'DESCONHECIDO';

                    console.log(`[HikCentral] Pessoa importada: ${p.personGivenName || ''} ${p.personFamilyName || ''} | Perfil: ${role} | Departamento: ${orgName} (${orgCode})`);

                    return {
                        id: p.personId || p.indexCode || `hik-${Math.random().toString(36).substr(2, 9)}`,
                        firstName: p.personGivenName || p.personName || '',
                        lastName: p.personFamilyName || '',
                        phone: p.phoneNo || p.phone || null,
                        email: p.email || null,
                        orgIndexCode: orgCode,
                        hikPersonId: p.personId || p.indexCode || null,
                        orgName,
                        role,
                        gender: p.gender || null,
                        certificateNo: p.certificateNo || null,
                        personPhoto: (() => {
                            const pic = p.personPhoto;
                            if (!pic) return null;
                            // picUri deve começar com '/' para ser um caminho válido
                            // Hashes hexadecimais (sem '/') são ignorados
                            const uri = pic.picUri || pic.uri || '';
                            if (!uri || !uri.startsWith('/')) return null;
                            return `https://100.77.145.39${uri}`;
                        })(),
                        createdAt: p.createTime || new Date().toISOString(),
                        updatedAt: p.updateTime || new Date().toISOString(),
                    };
                });

                // Filtrar por busca se necessário
                let filtered = residents;
                if (search) {
                    const searchLower = (search as string).toLowerCase();
                    filtered = residents.filter((r: any) =>
                        (r.firstName + ' ' + r.lastName).toLowerCase().includes(searchLower) ||
                        r.phone?.toLowerCase().includes(searchLower) ||
                        r.email?.toLowerCase().includes(searchLower)
                    );
                }

                // Salvar/atualizar no banco local com orgIndexCode correto
                for (const r of residents) {
                    try {
                        await prisma.person.upsert({
                            where: { hikPersonId: r.hikPersonId || `temp-${r.id}` },
                            update: {
                                firstName: r.firstName,
                                lastName: r.lastName,
                                phone: r.phone,
                                email: r.email,
                                orgIndexCode: r.orgIndexCode,
                            },
                            create: {
                                firstName: r.firstName,
                                lastName: r.lastName,
                                phone: r.phone,
                                email: r.email,
                                orgIndexCode: r.orgIndexCode,
                                hikPersonId: r.hikPersonId,
                            },
                        });
                    } catch (e) {
                        // Ignora erros de upsert individual
                    }
                }

                return res.json({
                    data: filtered.map((r: any) => ({
                        id: r.id,
                        full_name: `${r.firstName} ${r.lastName}`.trim() || '-',
                        cpf: r.certificateNo || '',
                        phone: r.phone || null,
                        email: r.email || null,
                        unit_number: r.orgIndexCode || '',
                        block: null,
                        tower: r.orgName || null,
                        photo_url: r.personPhoto || null,
                        is_owner: true,
                        hikcentral_person_id: r.hikPersonId || null,
                        notes: `HikCentral | Depto: ${r.orgName} | Perfil: ${r.role}`,
                        created_by: null,
                        created_at: r.createdAt,
                        updated_at: r.updatedAt,
                    })),
                    count: hikResult?.data?.total || filtered.length,
                    source: 'hikcentral',
                });
            }
        } catch (hikError: any) {
            console.log('Fallback to local DB for residents:', hikError.message);
        }

        // Fallback: buscar do banco local (somente orgIndexCode de MORADORES)
        const skip = (pageNum - 1) * limitNum;
        const baseWhere: any = { orgIndexCode: { in: RESIDENT_ORG_CODES } };
        const where = search ? {
            ...baseWhere,
            OR: [
                { firstName: { contains: search as string, mode: 'insensitive' as const } },
                { lastName: { contains: search as string, mode: 'insensitive' as const } },
            ]
        } : baseWhere;

        const data = await prisma.person.findMany({
            where,
            skip,
            take: limitNum,
            orderBy: { createdAt: 'desc' }
        });
        const count = await prisma.person.count({ where });
        // Mapear para o contrato snake_case que o frontend espera
        const localMapped = data.map((p: any) => ({
            id: p.id,
            full_name: `${p.firstName} ${p.lastName}`.trim() || '-',
            cpf: '',
            phone: p.phone || null,
            email: p.email || null,
            unit_number: p.orgIndexCode || '',
            block: null,
            tower: HIK_ORG_NAMES[p.orgIndexCode] || null,
            photo_url: null,
            is_owner: true,
            hikcentral_person_id: p.hikPersonId || null,
            notes: null,
            created_by: null,
            created_at: p.createdAt,
            updated_at: p.updatedAt,
        }));
        res.json({ data: localMapped, count, source: 'local' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Sincronização completa de todas as pessoas por departamento ============
app.post('/api/hikcentral/persons/sync', authMiddleware, async (req, res) => {
    try {
        const summary: Record<string, { role: string; count: number; names: string[] }> = {};
        const errors: string[] = [];

        // Busca todos os departamentos operacionais (excluindo raiz e sistema)
        const orgCodesToSync = Object.entries(HIK_ORG_ROLE_MAP)
            .filter(([code]) => !SYSTEM_ORG_CODES.includes(code));

        for (const [orgCode, role] of orgCodesToSync) {
            const orgName = HIK_ORG_NAMES[orgCode] || orgCode;
            try {
                const result = await HikCentralService.getPersonList({
                    orgIndexCode: orgCode,
                    pageNo: 1,
                    pageSize: 100,
                });
                const persons = result?.data?.list || [];

                summary[orgName] = { role, count: persons.length, names: [] };

                for (const p of persons) {
                    const fullName = `${p.personGivenName || p.personName || ''} ${p.personFamilyName || ''}`.trim();
                    console.log(`[Sync] Pessoa: ${fullName} | Perfil: ${role} | Departamento: ${orgName} (${orgCode})`);
                    summary[orgName].names.push(fullName);

                    const hikPersonId = p.personId || p.indexCode || null;
                    if (!hikPersonId) continue;

                    try {
                        await prisma.person.upsert({
                            where: { hikPersonId },
                            update: {
                                firstName: p.personGivenName || p.personName || '',
                                lastName: p.personFamilyName || '',
                                phone: p.phoneNo || p.phone || null,
                                email: p.email || null,
                                orgIndexCode: orgCode,
                            },
                            create: {
                                firstName: p.personGivenName || p.personName || '',
                                lastName: p.personFamilyName || '',
                                phone: p.phoneNo || p.phone || null,
                                email: p.email || null,
                                orgIndexCode: orgCode,
                                hikPersonId,
                            },
                        });
                    } catch (upsertErr: any) {
                        errors.push(`Upsert falhou para ${fullName}: ${upsertErr.message}`);
                    }
                }
            } catch (deptErr: any) {
                errors.push(`Depto ${orgName} (${orgCode}): ${deptErr.message}`);
                console.error(`[Sync] Erro no departamento ${orgName}:`, deptErr.message);
            }
        }

        const totalSynced = Object.values(summary).reduce((acc, v) => acc + v.count, 0);
        console.log(`[Sync] Sincronização concluída. Total: ${totalSynced} pessoas.`);

        res.json({
            success: true,
            totalSynced,
            summary,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        console.error('[Sync] Erro geral:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============ Person Properties (Dynamic Fields) ============
app.get('/api/hikcentral/person-properties', authMiddleware, async (req, res) => {
    try {
        // Default options according to prompt as a reliable fallback
        const defaultOptions = ['TORRE - PERFECTO', 'TORRE - NOBILE', 'TORRE - DESEO', 'TORRE - PARAÍSO'];

        try {
            // Tentativa de buscar os campos customizados do Artemis (OpenAPI)
            const result = await HikCentralService.hikRequest('/artemis/api/resource/v1/person/customData/list', {
                method: 'POST', body: JSON.stringify({})
            });

            const customFields = result?.data || [];
            const torreField = customFields.find((f: any) => f.name === 'Torre' || f.customFieldName === 'Torre' || f.title === 'Torre');

            if (torreField && (torreField.options || torreField.selectOptions)) {
                // Se o Artemis retornar as opções estruturadas no campo
                const options = torreField.options || torreField.selectOptions;
                return res.json({ options });
            }
        } catch (apiErr: any) {
            console.warn('[HikCentral] GET person-properties failed, returning local fallback:', apiErr.message);
        }

        // Se a API não retornar ou falhar, retorna o fallback rígido
        res.json({ options: defaultOptions });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/api/residents/select', authMiddleware, async (req, res) => {
    try {
        const data = await prisma.person.findMany({
            select: { id: true, firstName: true, lastName: true, orgIndexCode: true },
            orderBy: { firstName: 'asc' }
        });
        res.json(data.map(p => ({
            id: p.id,
            full_name: `${p.firstName} ${p.lastName}`,
            unit_number: p.orgIndexCode,
            block: null,
            tower: null,
        })));
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/residents', authMiddleware, async (req, res) => {
    try {
        const body = { ...req.body };
        const prismaData: any = {};

        if (body.full_name) {
            const parts = body.full_name.trim().split(' ');
            prismaData.firstName = parts[0] || '';
            prismaData.lastName = parts.slice(1).join(' ') || '';
        }

        prismaData.phone = body.phone || null;
        prismaData.email = body.email || null;
        prismaData.orgIndexCode = body.unit_number || '7';
        prismaData.hikPersonId = body.hikcentral_person_id || null;

        const person = await prisma.person.create({ data: prismaData });

        // Responder no formato snake_case esperado
        res.json({
            id: person.id,
            full_name: `${person.firstName} ${person.lastName}`.trim(),
            cpf: '',
            phone: person.phone || null,
            email: person.email || null,
            unit_number: person.orgIndexCode || '',
            block: null,
            tower: HIK_ORG_NAMES[person.orgIndexCode] || null,
            photo_url: null,
            is_owner: true,
            hikcentral_person_id: person.hikPersonId || null,
            notes: null,
            created_by: null,
            created_at: person.createdAt,
            updated_at: person.updatedAt,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.patch('/api/residents/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const body = { ...req.body };

        // Remover photo_url do body se for base64 (evita 413 Payload Too Large)
        if (body.photo_url && typeof body.photo_url === 'string' && body.photo_url.startsWith('data:')) {
            delete body.photo_url;
        }

        // Mapear campos snake_case do frontend para camelCase do Prisma
        const prismaData: any = {};
        if (body.full_name !== undefined) {
            const parts = (body.full_name || '').trim().split(' ');
            prismaData.firstName = parts[0] || '';
            prismaData.lastName = parts.slice(1).join(' ') || '';
        }
        if (body.phone !== undefined) prismaData.phone = body.phone;
        if (body.email !== undefined) prismaData.email = body.email;
        if (body.unit_number !== undefined) prismaData.orgIndexCode = body.unit_number;
        if (body.hikcentral_person_id !== undefined) prismaData.hikPersonId = body.hikcentral_person_id;
        if (body.hikPersonId !== undefined) prismaData.hikPersonId = body.hikPersonId;
        if (body.hikcentral_person_id !== undefined) prismaData.hikPersonId = body.hikcentral_person_id;

        // Campo legado: aceitar direto também
        if (body.firstName !== undefined) prismaData.firstName = body.firstName;
        if (body.lastName !== undefined) prismaData.lastName = body.lastName;
        if (body.orgIndexCode !== undefined) prismaData.orgIndexCode = body.orgIndexCode;

        // Tentar atualizar por UUID primeiro, depois por hikPersonId (para IDs do HikCentral como "22")
        let person: any;
        try {
            person = await prisma.person.update({ where: { id }, data: prismaData });
        } catch (uuidErr: any) {
            // Fallback: buscar pelo hikPersonId se o ID não for um UUID válido
            if (uuidErr?.code === 'P2025' || uuidErr?.message?.includes('Invalid') || uuidErr?.code === 'P2023') {
                const existing = await prisma.person.findFirst({ where: { hikPersonId: id } });
                if (!existing) {
                    return res.status(404).json({ error: 'Morador não encontrado' });
                }
                person = await prisma.person.update({ where: { id: existing.id }, data: prismaData });
            } else {
                throw uuidErr;
            }
        }

        // Responder no formato snake_case que o frontend espera
        res.json({
            id: person.id,
            full_name: `${person.firstName} ${person.lastName}`.trim(),
            cpf: '',
            phone: person.phone || null,
            email: person.email || null,
            unit_number: person.orgIndexCode || '',
            block: null,
            tower: HIK_ORG_NAMES[person.orgIndexCode] || null,
            photo_url: null,
            is_owner: true,
            hikcentral_person_id: person.hikPersonId || null,
            notes: null,
            created_by: null,
            created_at: person.createdAt,
            updated_at: person.updatedAt,
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/residents/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        try {
            await prisma.person.delete({ where: { id } });
        } catch (uuidErr: any) {
            if (uuidErr?.code === 'P2025' || uuidErr?.code === 'P2023') {
                const existing = await prisma.person.findFirst({ where: { hikPersonId: id } });
                if (!existing) return res.status(404).json({ error: 'Morador não encontrado' });
                await prisma.person.delete({ where: { id: existing.id } });
            } else {
                throw uuidErr;
            }
        }
        res.status(204).send();
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Visitors CRUD ============
app.get('/api/visitors', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query as any;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const where = search ? {
            name: { contains: search, mode: 'insensitive' }
        } : {};

        const data = await prisma.visitor.findMany({
            where: where as any,
            skip,
            take: parseInt(limit),
            orderBy: { createdAt: 'desc' }
        });
        const count = await prisma.visitor.count({ where: where as any });
        res.json({ data, count });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/visitors', authMiddleware, async (req, res) => {
    try {
        const visitor = await prisma.visitor.create({ data: req.body });
        res.json(visitor);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Access Logs (HikCentral + Local DB) ============
app.get('/api/access-logs', authMiddleware, async (req, res) => {
    try {
        const { startTime, endTime, pageNo = 1, pageSize = 50, source = 'all' } = req.query as any;

        const start = startTime || new Date(Date.now() - 86400000).toISOString();
        const end = endTime || new Date().toISOString();

        // Try to fetch from HikCentral and store locally
        if (source !== 'local') {
            try {
                const hikResult = await HikCentralService.getAccessLogs({
                    startTime: start,
                    endTime: end,
                    pageNo: parseInt(pageNo),
                    pageSize: parseInt(pageSize),
                });

                const events = hikResult?.data?.list || [];

                // Store fetched events in local DB
                for (const event of events) {
                    await prisma.accessEvent.upsert({
                        where: { id: event.eventId || event.id || `hik-${Date.now()}-${Math.random()}` },
                        update: {},
                        create: {
                            personName: event.personName || 'Desconhecido',
                            eventTime: new Date(event.eventTime || event.happenTime),
                            deviceName: event.deviceName || event.srcName || 'N/A',
                            doorName: event.doorName || event.srcName || 'N/A',
                            eventType: event.eventType?.toString() || 'ACCESS',
                            picUri: event.picUri || null,
                        },
                    });
                }

                return res.json({
                    data: events,
                    total: hikResult?.data?.total || events.length,
                    source: 'hikcentral',
                });
            } catch (hikError: any) {
                console.warn('HikCentral unavailable, falling back to local DB:', hikError.message);
            }
        }

        // Fallback: return from local DB
        const where: any = {
            eventTime: {
                gte: new Date(start),
                lte: new Date(end),
            },
        };

        const skip = (parseInt(pageNo) - 1) * parseInt(pageSize);
        const data = await prisma.accessEvent.findMany({
            where,
            skip,
            take: parseInt(pageSize),
            orderBy: { eventTime: 'desc' },
        });
        const total = await prisma.accessEvent.count({ where });

        res.json({ data, total, source: 'local' });
    } catch (error: any) {
        console.error('Access Logs Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ Service Providers ============
app.get('/api/service-providers', authMiddleware, async (req, res) => {
    try {
        const { page = '1', limit = '20', search = '' } = req.query as Record<string, string | undefined>;
        const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const normalizedSearch = (search || '').trim();

        const where: Prisma.ServiceProviderWhereInput = normalizedSearch
            ? {
                OR: [
                    { fullName: { contains: normalizedSearch, mode: 'insensitive' } },
                    { companyName: { contains: normalizedSearch, mode: 'insensitive' } },
                    { serviceType: { contains: normalizedSearch, mode: 'insensitive' } },
                    { document: { contains: normalizedSearch, mode: 'insensitive' } },
                    { email: { contains: normalizedSearch, mode: 'insensitive' } },
                ],
            }
            : {};

        const [data, count] = await Promise.all([
            prisma.serviceProvider.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.serviceProvider.count({ where }),
        ]);

        return res.json({
            data: data.map(serializeServiceProvider),
            count,
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Erro ao consultar prestadores' });
    }
});

app.post('/api/service-providers', authMiddleware, async (req, res) => {
    try {
        const body = (req.body || {}) as Record<string, unknown>;
        const payload = parseServiceProviderPayload(body, false);
        const createdBy = payload.createdBy ?? (req as any).user?.id ?? null;
        await ensureServiceProviderRelations({
            ...payload,
            createdBy,
        });

        const createData: Prisma.ServiceProviderCreateInput = {
            fullName: payload.fullName as string,
            document: payload.document as string,
            serviceType: payload.serviceType as string,
            providerType: payload.providerType ?? 'temporary',
            companyName: payload.companyName ?? null,
            phone: payload.phone ?? null,
            email: payload.email ?? null,
            photoUrl: payload.photoUrl ?? null,
            documentPhotoUrl: payload.documentPhotoUrl ?? null,
            tower: payload.tower ?? null,
            visitingResident: payload.visitingResident ?? null,
            validFrom: payload.validFrom ?? null,
            validUntil: payload.validUntil ?? null,
            authorizedUnits: payload.authorizedUnits === null ? Prisma.JsonNull : payload.authorizedUnits,
            notes: payload.notes ?? null,
            hikcentralPersonId: payload.hikcentralPersonId ?? null,
            createdBy,
        };

        const created = await prisma.serviceProvider.create({
            data: createData,
        });
        return res.status(201).json(serializeServiceProvider(created));
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Erro ao criar prestador' });
    }
});

app.patch('/api/service-providers/:id', authMiddleware, async (req, res) => {
    try {
        const body = (req.body || {}) as Record<string, unknown>;
        const payload = parseServiceProviderPayload(body, true);
        if (Object.keys(payload).length === 0) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        await ensureServiceProviderRelations(payload);

        const updateData: Prisma.ServiceProviderUpdateInput = {};
        if (payload.fullName !== undefined) updateData.fullName = payload.fullName;
        if (payload.document !== undefined) updateData.document = payload.document;
        if (payload.serviceType !== undefined) updateData.serviceType = payload.serviceType;
        if (payload.providerType !== undefined) updateData.providerType = payload.providerType;
        if (payload.companyName !== undefined) updateData.companyName = payload.companyName;
        if (payload.phone !== undefined) updateData.phone = payload.phone;
        if (payload.email !== undefined) updateData.email = payload.email;
        if (payload.photoUrl !== undefined) updateData.photoUrl = payload.photoUrl;
        if (payload.documentPhotoUrl !== undefined) updateData.documentPhotoUrl = payload.documentPhotoUrl;
        if (payload.tower !== undefined) updateData.tower = payload.tower;
        if (payload.visitingResident !== undefined) updateData.visitingResident = payload.visitingResident;
        if (payload.validFrom !== undefined) updateData.validFrom = payload.validFrom;
        if (payload.validUntil !== undefined) updateData.validUntil = payload.validUntil;
        if (payload.authorizedUnits !== undefined) {
            updateData.authorizedUnits = payload.authorizedUnits === null ? Prisma.JsonNull : payload.authorizedUnits;
        }
        if (payload.notes !== undefined) updateData.notes = payload.notes;
        if (payload.hikcentralPersonId !== undefined) updateData.hikcentralPersonId = payload.hikcentralPersonId;
        if (payload.createdBy !== undefined) updateData.createdBy = payload.createdBy;

        const updated = await prisma.serviceProvider.update({
            where: { id: req.params.id },
            data: updateData,
        });
        return res.json(serializeServiceProvider(updated));
    } catch (error: any) {
        if (error?.code === 'P2025') {
            return res.status(404).json({ error: 'Prestador não encontrado' });
        }
        return res.status(400).json({ error: error.message || 'Erro ao atualizar prestador' });
    }
});

app.delete('/api/service-providers/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.serviceProvider.delete({ where: { id: req.params.id } });
        return res.status(204).send();
    } catch (error: any) {
        if (error?.code === 'P2025') {
            return res.status(404).json({ error: 'Prestador não encontrado' });
        }
        return res.status(500).json({ error: error.message || 'Erro ao remover prestador' });
    }
});

// ============ Towers ============
app.get('/api/towers/active', authMiddleware, async (req, res) => {
    try {
        const towers = await prisma.tower.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
        });
        return res.json(towers.map(serializeTower));
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Erro ao consultar torres' });
    }
});

// ============ Dashboard Stats (Real data) ============
app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const [totalResidents, totalVisitors, totalProviders, todayAccess, totalAccessEvents] = await Promise.all([
            prisma.person.count(),
            prisma.visitor.count(),
            prisma.serviceProvider.count(),
            prisma.accessEvent.count({
                where: { eventTime: { gte: startOfDay } }
            }),
            prisma.accessEvent.count(),
        ]);

        // Active visits: visitors whose visit window includes right now
        const activeVisits = await prisma.visitor.count({
            where: {
                visitStartTime: { lte: now },
                visitEndTime: { gte: now },
            }
        });

        // Fetch device status from HikCentral
        let onlineDevices = 0;
        let offlineDevices = 0;
        try {
            const deviceResult = await HikCentralService.getAcsDeviceList(1, 100);
            const devices = deviceResult?.data?.list || [];
            onlineDevices = devices.filter((d: any) => d.status === 1).length;
            offlineDevices = devices.filter((d: any) => d.status === 0).length;
        } catch (err) {
            console.error('Error fetching devices for stats:', err);
        }

        res.json({
            totalResidents,
            totalVisitors,
            activeVisits,
            completedVisits: totalVisitors - activeVisits,
            totalProviders,
            todayAccess,
            totalAccessEvents,
            onlineDevices,
            offlineDevices,
            totalDevices: onlineDevices + offlineDevices
        });
    } catch (error: any) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/devices/status', authMiddleware, async (req, res) => {
    try {
        const deviceResult = await HikCentralService.getAcsDeviceList(1, 100);
        const devices = deviceResult?.data?.list || [];

        // Return a clean list of devices with their status
        const formattedDevices = devices.map((d: any) => ({
            id: d.acsDevIndexCode || d.acsDeviceIndexCode,
            name: d.acsDevName || d.acsDeviceName,
            status: d.status === 1 ? 'online' : 'offline',
            ip: d.acsDevIp || d.acsDeviceIp,
            type: d.treatyType || d.acsDeviceType
        }));

        res.json(formattedDevices);
    } catch (error: any) {
        console.error('Devices Status Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============ Profiles / Users ============
app.get('/api/profiles', authMiddleware, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true, createdAt: true }
        });
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/profiles/:id', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, email: true, name: true, role: true, createdAt: true }
        });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json(user);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============ HikCentral Config ============
app.get('/api/hik-config', authMiddleware, async (req, res) => {
    try {
        const config = await prisma.hikcentralConfig.findFirst({
            orderBy: { createdAt: 'desc' }
        });
        if (!config) return res.json({ apiUrl: '', appKey: '', appSecret: '', syncEnabled: false });
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/hik-config', authMiddleware, async (req, res) => {
    try {
        const { apiUrl, appKey, appSecret, syncEnabled } = req.body;
        const existing = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });

        if (existing) {
            const config = await prisma.hikcentralConfig.update({
                where: { id: existing.id },
                data: { apiUrl, appKey, appSecret, syncEnabled },
            });
            return res.json(config);
        }

        const config = await prisma.hikcentralConfig.create({
            data: { apiUrl, appKey, appSecret, syncEnabled },
        });
        res.json(config);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Visit Logs ============
app.post('/api/visit-logs', authMiddleware, async (req, res) => {
    try {
        // Store as an access event
        const log = await prisma.accessEvent.create({
            data: {
                personName: req.body.personName || 'Visitante',
                eventTime: new Date(),
                deviceName: req.body.deviceName || 'Manual',
                doorName: req.body.doorName || 'Portaria',
                eventType: req.body.eventType || 'VISIT',
            }
        });
        res.json(log);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============ Users CRUD (for admin panel) ============
app.get('/api/users', authMiddleware, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true, createdAt: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(users);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users', authMiddleware, async (req, res) => {
    try {
        const { email, password, name, role } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: { email, password: hashedPassword, name, role: role || 'ADMIN' },
        });
        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/users/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.user.delete({ where: { id: req.params.id } });
        res.status(204).send();
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ============ System Status (for admin panel) ============
app.get('/api/system/status', authMiddleware, async (req, res) => {
    try {
        // Check DB connectivity
        let dbStatus = 'OFFLINE';
        try {
            await prisma.$queryRaw`SELECT 1`;
            dbStatus = 'ONLINE';
        } catch { dbStatus = 'OFFLINE'; }

        // Check HikCentral connectivity
        let hikStatus = 'UNKNOWN';
        try {
            await HikCentralService.getAccessLogs({
                startTime: new Date(Date.now() - 60000).toISOString(),
                endTime: new Date().toISOString(),
                pageNo: 1,
                pageSize: 1,
            });
            hikStatus = 'ONLINE';
        } catch { hikStatus = 'OFFLINE'; }

        res.json({
            api: 'ONLINE',
            database: dbStatus,
            hikcentral: hikStatus,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Backend API running on http://0.0.0.0:${port}`);

    if (SESSION_AUDIT_PRUNE_INTERVAL_MINUTES === 0) {
        console.log('Session audit retention job disabled (SESSION_AUDIT_PRUNE_INTERVAL_MINUTES=0)');
    } else {
        let pruneInFlight = false;
        const runPrune = async () => {
            if (pruneInFlight) return;
            pruneInFlight = true;
            try {
                await pruneSessionAuditEvents();
            } catch (error: any) {
                console.error('Session audit prune job error:', error?.message || error);
            } finally {
                pruneInFlight = false;
            }
        };

        void runPrune();
        setInterval(() => {
            void runPrune();
        }, SESSION_AUDIT_PRUNE_INTERVAL_MINUTES * 60 * 1000);
    }

    if (SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES === 0) {
        console.log('Security metrics snapshot job disabled (SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES=0)');
    } else {
        let snapshotInFlight = false;
        const runSnapshot = async () => {
            if (snapshotInFlight) return;
            snapshotInFlight = true;
            try {
                const { snapshot, metrics } = await createSecurityMetricsSnapshot(prisma, {
                    windowHours: SECURITY_METRICS_WINDOW_HOURS,
                    topN: SECURITY_METRICS_TOP_N,
                });
                const pruneResult = await pruneSecurityMetricsSnapshots(
                    prisma,
                    SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS,
                );
                console.log(
                    JSON.stringify({
                        action: 'collect_security_metrics_snapshot',
                        snapshotId: snapshot.id,
                        windowHours: snapshot.windowHours,
                        topN: snapshot.topN,
                        attempts: metrics.login.attempts,
                        failedAttempts: metrics.login.failedAttempts,
                        failureRate: metrics.login.failureRate,
                        prunedSnapshots: pruneResult.deleted,
                        timestamp: new Date().toISOString(),
                    }),
                );
            } catch (error: any) {
                console.error('Security metrics snapshot job error:', error?.message || error);
            } finally {
                snapshotInFlight = false;
            }
        };

        void runSnapshot();
        setInterval(() => {
            void runSnapshot();
        }, SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES * 60 * 1000);
    }
});
