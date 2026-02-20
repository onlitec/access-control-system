"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const HikCentralService_1 = require("./services/HikCentralService");
const securityMetrics_1 = require("./services/securityMetrics");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const helmet_1 = __importDefault(require("helmet"));
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '1d');
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
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
const parseDurationToMs = (input) => {
    const match = /^(\d+)([smhd])$/i.exec(input.trim());
    if (!match)
        return 7 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };
    return value * multiplier[unit];
};
const REFRESH_TOKEN_TTL_MS = parseDurationToMs(REFRESH_TOKEN_EXPIRES_IN);
const getRefreshExpiry = () => new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
const hashRefreshToken = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
const generateRefreshToken = () => crypto_1.default.randomBytes(48).toString('base64url');
const signAccessToken = (user) => {
    const signOptions = { expiresIn: JWT_EXPIRES_IN };
    return jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, signOptions);
};
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || undefined;
};
const getUserAgent = (req) => {
    const ua = req.headers['user-agent'];
    return typeof ua === 'string' ? ua.slice(0, 500) : undefined;
};
const logSessionAuditEvent = async (params) => {
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
    }
    catch (error) {
        console.error('Session audit log error:', error);
    }
};
const SESSION_AUDIT_SORTABLE_COLUMNS = ['createdAt', 'eventType', 'success', 'userEmail', 'ipAddress'];
const parseSessionAuditWhere = (query) => {
    const { userEmail, eventType, success, startTime, endTime, ipAddress, sessionId } = query;
    const where = {};
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
const parseSessionAuditSort = (query) => {
    const sortByRaw = query.sortBy || 'createdAt';
    const sortOrderRaw = (query.sortOrder || 'desc').toLowerCase();
    if (!SESSION_AUDIT_SORTABLE_COLUMNS.includes(sortByRaw)) {
        throw new Error(`sortBy inválido. Valores aceitos: ${SESSION_AUDIT_SORTABLE_COLUMNS.join(', ')}`);
    }
    if (sortOrderRaw !== 'asc' && sortOrderRaw !== 'desc') {
        throw new Error('sortOrder inválido. Valores aceitos: asc, desc');
    }
    const sortBy = sortByRaw;
    const sortOrder = sortOrderRaw;
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
    console.log(JSON.stringify({
        action: 'prune_session_audit_events',
        retentionDays: SESSION_AUDIT_RETENTION_DAYS,
        cutoff: cutoff.toISOString(),
        deleted: deleted.count,
        timestamp: now.toISOString(),
    }));
};
const escapeCsv = (value) => {
    const str = value == null ? '' : String(value);
    return `"${str.replace(/"/g, '""')}"`;
};
const SERVICE_PROVIDER_TYPES = ['fixed', 'temporary'];
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const hasAnyField = (obj, keys) => keys.some((key) => hasOwn(obj, key));
const getFirstField = (obj, keys) => {
    for (const key of keys) {
        if (hasOwn(obj, key)) {
            return obj[key];
        }
    }
    return undefined;
};
const normalizeRequiredText = (value, fieldLabel) => {
    if (typeof value !== 'string') {
        throw new Error(`${fieldLabel} é obrigatório`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error(`${fieldLabel} é obrigatório`);
    }
    return trimmed;
};
const normalizeOptionalText = (value, fieldLabel) => {
    if (value == null)
        return null;
    if (typeof value !== 'string') {
        throw new Error(`${fieldLabel} inválido`);
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const normalizeProviderType = (value) => {
    if (typeof value !== 'string') {
        throw new Error('provider_type inválido. Valores aceitos: fixed, temporary');
    }
    const normalized = value.trim().toLowerCase();
    if (!SERVICE_PROVIDER_TYPES.includes(normalized)) {
        throw new Error('provider_type inválido. Valores aceitos: fixed, temporary');
    }
    return normalized;
};
const normalizeAuthorizedUnits = (value) => {
    if (value == null)
        return null;
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
const parseServiceProviderPayload = (body, partial = false) => {
    const data = {};
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
        data.hikcentralPersonId = normalizeOptionalText(getFirstField(body, hikcentralPersonIdKeys), 'hikcentral_person_id');
    }
    if (!partial || hasAnyField(body, createdByKeys)) {
        data.createdBy = normalizeOptionalText(getFirstField(body, createdByKeys), 'created_by');
    }
    return data;
};
const extractAuthorizedUnits = (value) => {
    if (!Array.isArray(value))
        return null;
    const units = value.filter((item) => typeof item === 'string');
    return units;
};
const serializeServiceProvider = (provider) => ({
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
const serializeTower = (tower) => ({
    id: tower.id,
    name: tower.name,
    description: tower.description,
    is_active: tower.isActive,
    created_at: tower.createdAt,
    updated_at: tower.updatedAt,
});
const ensureServiceProviderRelations = async (data) => {
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
const revokeExcessActiveSessions = async (userId) => {
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
            isValidPassword = await bcryptjs_1.default.compare(password, user.password);
        }
        else if (user.password === password) {
            isValidPassword = true;
            const hashedPassword = await bcryptjs_1.default.hash(password, 12);
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'No token provided' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};
const adminMiddleware = (req, res, next) => {
    const role = req.user?.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
};
app.post('/api/auth/logout-all', authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id;
        const userEmail = req.user?.email;
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
    }
    catch (error) {
        await logSessionAuditEvent({
            eventType: 'logout_all',
            success: false,
            req,
            userId: req.user?.id ?? null,
            userEmail: req.user?.email ?? null,
            details: 'internal_error',
        });
        console.error('Logout-all error:', error);
        res.status(500).json({ error: 'Erro interno no logout-all' });
    }
});
app.get('/api/auth/sessions', authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id;
        const userEmail = req.user?.email;
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
    }
    catch (error) {
        await logSessionAuditEvent({
            eventType: 'list_sessions',
            success: false,
            req,
            userId: req.user?.id ?? null,
            userEmail: req.user?.email ?? null,
            details: 'internal_error',
        });
        console.error('List sessions error:', error);
        res.status(500).json({ error: 'Erro interno ao listar sessões' });
    }
});
app.post('/api/auth/revoke-session', authMiddleware, async (req, res) => {
    const { sessionId } = req.body;
    try {
        const userId = req.user?.id;
        const userEmail = req.user?.email;
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
    }
    catch (error) {
        await logSessionAuditEvent({
            eventType: 'revoke_session',
            success: false,
            req,
            userId: req.user?.id ?? null,
            userEmail: req.user?.email ?? null,
            sessionId: typeof sessionId === 'string' ? sessionId : null,
            details: 'internal_error',
        });
        console.error('Revoke session error:', error);
        res.status(500).json({ error: 'Erro interno ao revogar sessão' });
    }
});
app.get('/api/security/session-audit', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { page = '1', limit = '20', } = req.query;
        const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 20));
        let where = {};
        let orderBy = { createdAt: 'desc' };
        let sortBy = 'createdAt';
        let sortOrder = 'desc';
        try {
            where = parseSessionAuditWhere(req.query);
            const sortParsed = parseSessionAuditSort(req.query);
            orderBy = sortParsed.orderBy;
            sortBy = sortParsed.sortBy;
            sortOrder = sortParsed.sortOrder;
        }
        catch (error) {
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
    }
    catch (error) {
        console.error('Session audit query error:', error);
        return res.status(500).json({ error: 'Erro interno ao consultar auditoria de sessão' });
    }
});
app.get('/api/security/session-audit/export/meta', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { limit = '1000' } = req.query;
        const requestedLimit = Math.max(1, Number.parseInt(limit, 10) || 1000);
        const effectiveLimit = Math.min(SESSION_AUDIT_EXPORT_MAX_LIMIT, requestedLimit);
        let where = {};
        try {
            where = parseSessionAuditWhere(req.query);
        }
        catch (error) {
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
    }
    catch (error) {
        console.error('Session audit export meta error:', error);
        return res.status(500).json({ error: 'Erro interno ao consultar meta de exportação' });
    }
});
app.get('/api/security/session-audit/export', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { limit = '1000' } = req.query;
        const take = Math.min(SESSION_AUDIT_EXPORT_MAX_LIMIT, Math.max(1, Number.parseInt(limit, 10) || 1000));
        let where = {};
        let orderBy = { createdAt: 'desc' };
        let sortBy = 'createdAt';
        let sortOrder = 'desc';
        try {
            where = parseSessionAuditWhere(req.query);
            const sortParsed = parseSessionAuditSort(req.query);
            orderBy = sortParsed.orderBy;
            sortBy = sortParsed.sortBy;
            sortOrder = sortParsed.sortOrder;
        }
        catch (error) {
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
    }
    catch (error) {
        console.error('Session audit export error:', error);
        return res.status(500).json({ error: 'Erro interno ao exportar auditoria de sessão' });
    }
});
app.get('/api/security/metrics', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { windowHours, topN } = req.query;
        const requestedWindowHours = Number.parseInt(windowHours || '', 10);
        const requestedTopN = Number.parseInt(topN || '', 10);
        const effectiveWindowHours = Number.isFinite(requestedWindowHours) && requestedWindowHours > 0
            ? Math.min(24 * 14, requestedWindowHours)
            : SECURITY_METRICS_WINDOW_HOURS;
        const effectiveTopN = Number.isFinite(requestedTopN) && requestedTopN > 0
            ? Math.min(100, requestedTopN)
            : SECURITY_METRICS_TOP_N;
        const metrics = await (0, securityMetrics_1.calculateSecurityMetrics)(prisma, {
            windowHours: effectiveWindowHours,
            topN: effectiveTopN,
        });
        return res.json(metrics);
    }
    catch (error) {
        console.error('Security metrics query error:', error);
        return res.status(500).json({ error: 'Erro interno ao consultar métricas de segurança' });
    }
});
app.get('/api/security/metrics/history', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { windowHours, limit, startTime, endTime } = req.query;
        const requestedWindowHours = Number.parseInt(windowHours || '', 10);
        const effectiveWindowHours = Number.isFinite(requestedWindowHours) && requestedWindowHours > 0
            ? Math.min(24 * 14, requestedWindowHours)
            : undefined;
        const requestedLimit = Number.parseInt(limit || '', 10);
        const effectiveLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
            ? Math.min(500, requestedLimit)
            : SECURITY_METRICS_HISTORY_DEFAULT_POINTS;
        let parsedStartTime;
        if (startTime) {
            const candidate = new Date(startTime);
            if (Number.isNaN(candidate.getTime())) {
                return res.status(400).json({ error: 'startTime inválido' });
            }
            parsedStartTime = candidate;
        }
        let parsedEndTime;
        if (endTime) {
            const candidate = new Date(endTime);
            if (Number.isNaN(candidate.getTime())) {
                return res.status(400).json({ error: 'endTime inválido' });
            }
            parsedEndTime = candidate;
        }
        const history = await (0, securityMetrics_1.listSecurityMetricsHistory)(prisma, {
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
    }
    catch (error) {
        console.error('Security metrics history query error:', error);
        return res.status(500).json({ error: 'Erro interno ao consultar histórico de métricas' });
    }
});
app.post('/api/security/metrics/snapshots', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const body = (req.body || {});
        const requestedWindowHours = Number.parseInt(String(body.windowHours || ''), 10);
        const requestedTopN = Number.parseInt(String(body.topN || ''), 10);
        const effectiveWindowHours = Number.isFinite(requestedWindowHours) && requestedWindowHours > 0
            ? Math.min(24 * 14, requestedWindowHours)
            : SECURITY_METRICS_WINDOW_HOURS;
        const effectiveTopN = Number.isFinite(requestedTopN) && requestedTopN > 0
            ? Math.min(100, requestedTopN)
            : SECURITY_METRICS_TOP_N;
        const result = await (0, securityMetrics_1.createSecurityMetricsSnapshot)(prisma, {
            windowHours: effectiveWindowHours,
            topN: effectiveTopN,
        });
        return res.status(201).json(result);
    }
    catch (error) {
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
        const { firstName, lastName, phone, email, orgIndexCode } = req.body;
        // 1. Sync with HikCentral
        const hikResult = await HikCentralService_1.HikCentralService.addPerson({
            personGivenName: firstName,
            personFamilyName: lastName,
            phoneNo: phone,
            email: email,
            orgIndexCode: orgIndexCode || '1',
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
    }
    catch (error) {
        console.error('Sync Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============ Visitor Reservation (HikCentral + Local DB) ============
app.post('/api/visitors/reserve', authMiddleware, async (req, res) => {
    try {
        const { visitorName, certificateNo, visitStartTime, visitEndTime, plateNo, visitorPicData } = req.body;
        // 1. Sync with HikCentral
        const hikResult = await HikCentralService_1.HikCentralService.reserveVisitor({
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
    }
    catch (error) {
        console.error('Reservation Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============ Residents (Person) CRUD ============
app.get('/api/residents', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        // Tentar buscar do HikCentral primeiro
        try {
            const hikResult = await HikCentralService_1.HikCentralService.getPersonListByOrgName('MORADORES', pageNum, limitNum);
            const hikPersons = hikResult?.data?.list || [];
            if (hikPersons.length > 0) {
                // Mapear dados do HikCentral para o formato local
                const residents = hikPersons.map((p) => ({
                    id: p.personId || p.indexCode || `hik-${Math.random().toString(36).substr(2, 9)}`,
                    firstName: p.personGivenName || p.personName || '',
                    lastName: p.personFamilyName || '',
                    phone: p.phoneNo || p.phone || null,
                    email: p.email || null,
                    orgIndexCode: p.orgIndexCode || '',
                    hikPersonId: p.personId || p.indexCode || null,
                    orgName: p.orgName || 'MORADORES',
                    gender: p.gender || null,
                    certificateNo: p.certificateNo || null,
                    personPhoto: p.personPhoto ? `https://100.77.145.39${p.personPhoto.picUri || ''}` : null,
                    createdAt: p.createTime || new Date().toISOString(),
                    updatedAt: p.updateTime || new Date().toISOString(),
                }));
                // Filtrar por busca se necessário
                let filtered = residents;
                if (search) {
                    const searchLower = search.toLowerCase();
                    filtered = residents.filter((r) => (r.firstName + ' ' + r.lastName).toLowerCase().includes(searchLower) ||
                        r.phone?.toLowerCase().includes(searchLower) ||
                        r.email?.toLowerCase().includes(searchLower));
                }
                // Salvar/atualizar no banco local (em background)
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
                    }
                    catch (e) {
                        // Ignora erros de upsert individual
                    }
                }
                return res.json({
                    data: filtered,
                    count: hikResult?.data?.total || filtered.length,
                    source: 'hikcentral',
                });
            }
        }
        catch (hikError) {
            console.log('Fallback to local DB for residents:', hikError.message);
        }
        // Fallback: buscar do banco local
        const skip = (pageNum - 1) * limitNum;
        const where = search ? {
            OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
            ]
        } : {};
        const data = await prisma.person.findMany({
            where: where,
            skip,
            take: limitNum,
            orderBy: { createdAt: 'desc' }
        });
        const count = await prisma.person.count({ where: where });
        res.json({ data, count, source: 'local' });
    }
    catch (error) {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/residents', authMiddleware, async (req, res) => {
    try {
        const person = await prisma.person.create({ data: req.body });
        res.json(person);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.patch('/api/residents/:id', authMiddleware, async (req, res) => {
    try {
        const person = await prisma.person.update({ where: { id: req.params.id }, data: req.body });
        res.json(person);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.delete('/api/residents/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.person.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ Visitors CRUD ============
app.get('/api/visitors', authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const where = search ? {
            name: { contains: search, mode: 'insensitive' }
        } : {};
        const data = await prisma.visitor.findMany({
            where: where,
            skip,
            take: parseInt(limit),
            orderBy: { createdAt: 'desc' }
        });
        const count = await prisma.visitor.count({ where: where });
        res.json({ data, count });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/visitors', authMiddleware, async (req, res) => {
    try {
        const visitor = await prisma.visitor.create({ data: req.body });
        res.json(visitor);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ Access Logs (HikCentral + Local DB) ============
app.get('/api/access-logs', authMiddleware, async (req, res) => {
    try {
        const { startTime, endTime, pageNo = 1, pageSize = 50, source = 'all' } = req.query;
        const start = startTime || new Date(Date.now() - 86400000).toISOString();
        const end = endTime || new Date().toISOString();
        // Try to fetch from HikCentral and store locally
        if (source !== 'local') {
            try {
                const hikResult = await HikCentralService_1.HikCentralService.getAccessLogs({
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
            }
            catch (hikError) {
                console.warn('HikCentral unavailable, falling back to local DB:', hikError.message);
            }
        }
        // Fallback: return from local DB
        const where = {
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
    }
    catch (error) {
        console.error('Access Logs Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============ Service Providers ============
app.get('/api/service-providers', authMiddleware, async (req, res) => {
    try {
        const { page = '1', limit = '20', search = '' } = req.query;
        const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
        const limitNum = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const normalizedSearch = (search || '').trim();
        const where = normalizedSearch
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
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Erro ao consultar prestadores' });
    }
});
app.post('/api/service-providers', authMiddleware, async (req, res) => {
    try {
        const body = (req.body || {});
        const payload = parseServiceProviderPayload(body, false);
        const createdBy = payload.createdBy ?? req.user?.id ?? null;
        await ensureServiceProviderRelations({
            ...payload,
            createdBy,
        });
        const createData = {
            fullName: payload.fullName,
            document: payload.document,
            serviceType: payload.serviceType,
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
            authorizedUnits: payload.authorizedUnits === null ? client_1.Prisma.JsonNull : payload.authorizedUnits,
            notes: payload.notes ?? null,
            hikcentralPersonId: payload.hikcentralPersonId ?? null,
            createdBy,
        };
        const created = await prisma.serviceProvider.create({
            data: createData,
        });
        return res.status(201).json(serializeServiceProvider(created));
    }
    catch (error) {
        return res.status(400).json({ error: error.message || 'Erro ao criar prestador' });
    }
});
app.patch('/api/service-providers/:id', authMiddleware, async (req, res) => {
    try {
        const body = (req.body || {});
        const payload = parseServiceProviderPayload(body, true);
        if (Object.keys(payload).length === 0) {
            return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }
        await ensureServiceProviderRelations(payload);
        const updateData = {};
        if (payload.fullName !== undefined)
            updateData.fullName = payload.fullName;
        if (payload.document !== undefined)
            updateData.document = payload.document;
        if (payload.serviceType !== undefined)
            updateData.serviceType = payload.serviceType;
        if (payload.providerType !== undefined)
            updateData.providerType = payload.providerType;
        if (payload.companyName !== undefined)
            updateData.companyName = payload.companyName;
        if (payload.phone !== undefined)
            updateData.phone = payload.phone;
        if (payload.email !== undefined)
            updateData.email = payload.email;
        if (payload.photoUrl !== undefined)
            updateData.photoUrl = payload.photoUrl;
        if (payload.documentPhotoUrl !== undefined)
            updateData.documentPhotoUrl = payload.documentPhotoUrl;
        if (payload.tower !== undefined)
            updateData.tower = payload.tower;
        if (payload.visitingResident !== undefined)
            updateData.visitingResident = payload.visitingResident;
        if (payload.validFrom !== undefined)
            updateData.validFrom = payload.validFrom;
        if (payload.validUntil !== undefined)
            updateData.validUntil = payload.validUntil;
        if (payload.authorizedUnits !== undefined) {
            updateData.authorizedUnits = payload.authorizedUnits === null ? client_1.Prisma.JsonNull : payload.authorizedUnits;
        }
        if (payload.notes !== undefined)
            updateData.notes = payload.notes;
        if (payload.hikcentralPersonId !== undefined)
            updateData.hikcentralPersonId = payload.hikcentralPersonId;
        if (payload.createdBy !== undefined)
            updateData.createdBy = payload.createdBy;
        const updated = await prisma.serviceProvider.update({
            where: { id: req.params.id },
            data: updateData,
        });
        return res.json(serializeServiceProvider(updated));
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
        res.json({
            totalResidents,
            totalVisitors,
            activeVisits,
            completedVisits: totalVisitors - activeVisits,
            totalProviders,
            todayAccess,
            totalAccessEvents,
        });
    }
    catch (error) {
        console.error('Dashboard Stats Error:', error);
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/profiles/:id', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.params.id },
            select: { id: true, email: true, name: true, role: true, createdAt: true }
        });
        if (!user)
            return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ HikCentral Config ============
app.get('/api/hik-config', authMiddleware, async (req, res) => {
    try {
        const config = await prisma.hikcentralConfig.findFirst({
            orderBy: { createdAt: 'desc' }
        });
        if (!config)
            return res.json({ apiUrl: '', appKey: '', appSecret: '', syncEnabled: false });
        res.json(config);
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/users', authMiddleware, async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 12);
        const user = await prisma.user.create({
            data: { email, password: hashedPassword, name, role: role || 'ADMIN' },
        });
        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.delete('/api/users/:id', authMiddleware, async (req, res) => {
    try {
        await prisma.user.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ System Status (for admin panel) ============
app.get('/api/system/status', authMiddleware, async (req, res) => {
    try {
        // Check DB connectivity
        let dbStatus = 'OFFLINE';
        try {
            await prisma.$queryRaw `SELECT 1`;
            dbStatus = 'ONLINE';
        }
        catch {
            dbStatus = 'OFFLINE';
        }
        // Check HikCentral connectivity
        let hikStatus = 'UNKNOWN';
        try {
            await HikCentralService_1.HikCentralService.getAccessLogs({
                startTime: new Date(Date.now() - 60000).toISOString(),
                endTime: new Date().toISOString(),
                pageNo: 1,
                pageSize: 1,
            });
            hikStatus = 'ONLINE';
        }
        catch {
            hikStatus = 'OFFLINE';
        }
        res.json({
            api: 'ONLINE',
            database: dbStatus,
            hikcentral: hikStatus,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Backend API running on http://0.0.0.0:${port}`);
    if (SESSION_AUDIT_PRUNE_INTERVAL_MINUTES === 0) {
        console.log('Session audit retention job disabled (SESSION_AUDIT_PRUNE_INTERVAL_MINUTES=0)');
    }
    else {
        let pruneInFlight = false;
        const runPrune = async () => {
            if (pruneInFlight)
                return;
            pruneInFlight = true;
            try {
                await pruneSessionAuditEvents();
            }
            catch (error) {
                console.error('Session audit prune job error:', error?.message || error);
            }
            finally {
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
    }
    else {
        let snapshotInFlight = false;
        const runSnapshot = async () => {
            if (snapshotInFlight)
                return;
            snapshotInFlight = true;
            try {
                const { snapshot, metrics } = await (0, securityMetrics_1.createSecurityMetricsSnapshot)(prisma, {
                    windowHours: SECURITY_METRICS_WINDOW_HOURS,
                    topN: SECURITY_METRICS_TOP_N,
                });
                const pruneResult = await (0, securityMetrics_1.pruneSecurityMetricsSnapshots)(prisma, SECURITY_METRICS_SNAPSHOT_RETENTION_DAYS);
                console.log(JSON.stringify({
                    action: 'collect_security_metrics_snapshot',
                    snapshotId: snapshot.id,
                    windowHours: snapshot.windowHours,
                    topN: snapshot.topN,
                    attempts: metrics.login.attempts,
                    failedAttempts: metrics.login.failedAttempts,
                    failureRate: metrics.login.failureRate,
                    prunedSnapshots: pruneResult.deleted,
                    timestamp: new Date().toISOString(),
                }));
            }
            catch (error) {
                console.error('Security metrics snapshot job error:', error?.message || error);
            }
            finally {
                snapshotInFlight = false;
            }
        };
        void runSnapshot();
        setInterval(() => {
            void runSnapshot();
        }, SECURITY_METRICS_SNAPSHOT_INTERVAL_MINUTES * 60 * 1000);
    }
});
