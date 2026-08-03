"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const HikCentralService_1 = require("./services/HikCentralService");
const NiceGuaritaService_1 = require("./services/NiceGuaritaService");
const FacialAccessService_1 = require("./services/FacialAccessService");
const EntityMappingService_1 = require("./services/EntityMappingService");
const DeviceStatusService_1 = require("./services/DeviceStatusService");
const HikCentralSyncService_1 = require("./services/HikCentralSyncService");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const helmet_1 = __importDefault(require("helmet"));
const crypto_1 = __importDefault(require("crypto"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const hikcentral_visitors_1 = __importDefault(require("./routes/hikcentral-visitors"));
const painel_1 = __importDefault(require("./routes/painel"));
const routes_1 = __importDefault(require("./routes"));
const setup_routes_1 = __importDefault(require("./routes/setup.routes"));
const systemSettings_routes_1 = __importDefault(require("./routes/systemSettings.routes"));
const auth_1 = require("./middleware/auth");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const audit_routes_1 = __importDefault(require("./routes/audit.routes"));
const security_routes_1 = __importDefault(require("./routes/security.routes"));
const residents_routes_1 = __importDefault(require("./routes/residents.routes"));
const staff_routes_1 = __importDefault(require("./routes/staff.routes"));
const service_providers_routes_1 = __importDefault(require("./routes/service-providers.routes"));
const resident_auth_routes_1 = __importDefault(require("./routes/resident-auth.routes"));
const doorbell_routes_1 = __importDefault(require("./routes/doorbell.routes"));
const guarita_routes_1 = __importDefault(require("./routes/guarita.routes"));
const facial_access_routes_1 = __importDefault(require("./routes/facial-access.routes"));
const vms_routes_1 = __importDefault(require("./routes/vms.routes"));
const cloud_routes_1 = __importDefault(require("./routes/cloud.routes"));
const discovery_routes_1 = __importDefault(require("./routes/discovery.routes"));
const devices_routes_1 = __importDefault(require("./routes/devices.routes"));
const deliveries_routes_1 = __importDefault(require("./routes/deliveries.routes"));
const hikcentral_sync_routes_1 = __importDefault(require("./routes/hikcentral-sync.routes"));
const job_functions_routes_1 = __importDefault(require("./routes/job-functions.routes"));
const EventBusService_1 = require("./services/EventBusService");
const ops_routes_1 = __importStar(require("./routes/ops.routes"));
const system_users_routes_1 = __importDefault(require("./routes/system-users.routes"));
const condominium_routes_1 = __importDefault(require("./routes/condominium.routes"));
const access_areas_routes_1 = __importDefault(require("./routes/access-areas.routes"));
const guarita_passback_routes_1 = __importDefault(require("./routes/guarita-passback.routes"));
const events_routes_1 = require("./routes/events.routes");
const onboarding_routes_1 = __importStar(require("./routes/onboarding.routes"));
dotenv_1.default.config();
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
const HIK_ORG_ROLE_MAP = {
    '1': 'SISTEMA', // Raiz - All Departments
    '2': 'MORADOR', // Moradores / Condôminos
    '3': 'PRESTADOR', // Prestadores de serviço
    '4': 'PORTARIA', // Equipe da Portaria
    '5': 'PORTARIA', // Equipe da Portaria (alias)
    '6': 'ADMIN', // Condomínio
    '7': 'MORADOR', // Moradores (alias)
    '8': 'VISITANTE', // Visitantes cadastrados
};
/**
 * Cache de mapeamento nome → orgIndexCode resolvido do HikCentral.
 * Atualizado a cada chamada a resolveOrgCodesByName().
 */
let orgNameCache = {};
let orgCacheTimestamp = 0;
const ORG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
/**
 * Busca os orgIndexCodes do HikCentral pelo nome do departamento.
 * Usa cache TTL de 5 minutos para evitar chamadas excessivas.
 * Fallback para mapa estático se HikCentral não responder.
 */
async function resolveOrgCodesByName() {
    const now = Date.now();
    if (Object.keys(orgNameCache).length > 0 && (now - orgCacheTimestamp) < ORG_CACHE_TTL_MS) {
        return orgNameCache;
    }
    // Standalone: sem HikCentral configurado, usa direto o mapa estático (sem log)
    if (!(await HikCentralService_1.HikCentralService.isConfigured())) {
        const staticMap = {};
        Object.entries(HIK_ORG_NAMES).forEach(([code, name]) => { staticMap[name.toUpperCase()] = code; });
        return staticMap;
    }
    try {
        const result = await Promise.race([
            HikCentralService_1.HikCentralService.getOrgList(1, 200),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
        const list = result?.data?.list || [];
        if (list.length > 0) {
            const map = {};
            list.forEach((org) => {
                const name = (org.orgName || '').toUpperCase().trim();
                const code = String(org.orgIndexCode);
                map[name] = code;
                // Atualizar HIK_ORG_NAMES dinamicamente
                HIK_ORG_NAMES[code] = org.orgName;
            });
            orgNameCache = map;
            orgCacheTimestamp = now;
            console.log('[HikCentral] Departamentos resolvidos:', JSON.stringify(map));
            return map;
        }
    }
    catch (e) {
        console.warn('[HikCentral] Falha ao buscar orgs, usando mapa estático:', e.message);
    }
    // Fallback: mapa estático invertido
    const staticMap = {};
    Object.entries(HIK_ORG_NAMES).forEach(([code, name]) => { staticMap[name.toUpperCase()] = code; });
    return staticMap;
}
/**
 * Retorna os orgIndexCodes para um tipo de departamento.
 * keywords: array de nomes (uppercase) a buscar no HikCentral.
 * staticFallback: codes a usar se HikCentral não retornar match.
 */
async function getOrgCodesForType(keywords, staticFallback) {
    const nameMap = await resolveOrgCodesByName();
    const codes = new Set();
    keywords.forEach(kw => {
        Object.entries(nameMap).forEach(([name, code]) => {
            if (name.includes(kw))
                codes.add(code);
        });
    });
    return codes.size > 0 ? Array.from(codes) : staticFallback;
}
/**
 * Nomes legíveis dos departamentos HikCentral.
 */
const HIK_ORG_NAMES = {
    '1': 'ALL DEPARTMENTS',
    '2': 'MORADORES',
    '3': 'PRESTADORES',
    '4': 'PORTARIA',
    '5': 'PORTARIA',
    '6': 'CONDOMINIO',
    '7': 'MORADORES',
    '8': 'VISITANTES',
};
/**
 * Retorna o role da plataforma baseado no orgIndexCode do HikCentral.
 */
function resolveRoleFromOrg(orgIndexCode) {
    return HIK_ORG_ROLE_MAP[orgIndexCode] || 'DESCONHECIDO';
}
// Filtros estáticos de fallback (usados quando HikCentral não responde)
const RESIDENT_ORG_CODES_FALLBACK = ['2', '7'];
const PRESTADORES_ORG_CODES_FALLBACK = ['3'];
const STAFF_ORG_CODES_FALLBACK = ['4', '5', '6'];
const SYSTEM_ORG_CODES = ['1'];
exports.app = (0, express_1.default)();
exports.prisma = new client_1.PrismaClient();
const port = process.env.PORT || 3001;
const APP_URL = process.env.APP_URL || 'https://127.0.0.1:8443';
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
const corsOptions = {
    origin: CORS_ORIGIN === '*' ? true : allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};
exports.app.use((0, helmet_1.default)());
exports.app.use((0, cookie_parser_1.default)());
exports.app.use(express_1.default.json({ limit: '50mb' }));
exports.app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
exports.app.use((0, cors_1.default)(corsOptions));
exports.app.use(ops_routes_1.healthMetricsMiddleware);
// Global API Routes
// setup (cadastro do primeiro admin) é público e precisa vir antes do
// middleware de autenticação que cobre /api
exports.app.use('/api/setup', setup_routes_1.default);
exports.app.use('/api/onboarding', onboarding_routes_1.default);
exports.app.use('/api', routes_1.default);
exports.app.use('/api/residents', residents_routes_1.default);
exports.app.use('/api/staff', staff_routes_1.default);
exports.app.use('/api/service-providers', service_providers_routes_1.default);
exports.app.use('/api/events', events_routes_1.eventsRoutes);
exports.app.use('/api/vms', vms_routes_1.default);
exports.app.use('/api/discovery', discovery_routes_1.default);
exports.app.use('/api/devices', devices_routes_1.default);
exports.app.use('/api/hikcentral-sync', hikcentral_sync_routes_1.default);
exports.app.use('/api/job-functions', job_functions_routes_1.default);
// ============ Platform Routes (Integrated with HikCentral) ============
exports.app.use('/api/hikcentral', hikcentral_visitors_1.default);
exports.app.use('/api', (req, res, next) => {
    // Basic health check and AUTH bypass
    if (req.path === '/health' || req.path.startsWith('/auth/') || req.path.startsWith('/onboarding/') || req.path.startsWith('/resident/'))
        return next();
    // Injetar token do query param no header para endpoints de foto
    const queryToken = req.query.token;
    if (queryToken && !req.headers.authorization) {
        req.headers.authorization = `Bearer ${queryToken}`;
    }
    return (0, auth_1.authMiddleware)(req, res, next);
}, painel_1.default);
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
        const tower = await exports.prisma.tower.findFirst({
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
        const resident = await exports.prisma.person.findUnique({
            where: { id: data.visitingResident },
            select: { id: true },
        });
        if (!resident) {
            throw new Error('Morador informado não existe');
        }
    }
};
const revokeExcessActiveSessions = async (userId) => {
    const sessions = await exports.prisma.refreshSession.findMany({
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
    const result = await exports.prisma.refreshSession.updateMany({
        where: { id: { in: toRevoke } },
        data: { revokedAt: new Date() },
    });
    return result.count;
};
// ============ Centralized Routes ============
exports.app.use('/api/auth', auth_routes_1.default);
exports.app.use('/api/audit', audit_routes_1.default);
exports.app.use('/api/security', security_routes_1.default);
exports.app.use('/api/resident', resident_auth_routes_1.default);
exports.app.use('/api/doorbell', doorbell_routes_1.default);
exports.app.use('/api/guarita', guarita_routes_1.default);
exports.app.use('/api/facial-access', facial_access_routes_1.default);
exports.app.use('/api/vms', vms_routes_1.default);
exports.app.use('/api/cloud', cloud_routes_1.default);
exports.app.use('/api/deliveries', deliveries_routes_1.default);
exports.app.use('/api/ops', ops_routes_1.default);
exports.app.use('/api/system-settings', systemSettings_routes_1.default);
exports.app.use('/api/system-users', system_users_routes_1.default);
exports.app.use('/api/condominium', condominium_routes_1.default);
exports.app.use('/api/access-areas', access_areas_routes_1.default);
exports.app.use('/api/guarita/passback', guarita_passback_routes_1.default);
// ============ Health & System ============
exports.app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ============ Residents Sync (HikCentral + Local DB) ============
// Handled in ResidentsController
// ============ Sincronização (legado) ============
// Standalone: dados são 100% locais — não há sistema externo para sincronizar.
exports.app.post('/api/hikcentral/persons/sync', auth_1.authMiddleware, async (req, res) => {
    res.json({ success: true, totalSynced: 0, departments: {}, errors: [], info: 'Sistema standalone: dados 100% locais, nada a sincronizar' });
});
// ============ Person Photo Proxy (HikCentral) ============
// Middleware para injetar token do query param no header Authorization
const photoTokenMiddleware = (req, res, next) => {
    const queryToken = req.query.token;
    if (queryToken && !req.headers.authorization) {
        req.headers.authorization = `Bearer ${queryToken}`;
    }
    next();
};
// Versão flexível do auth para fotos (aceita Header ou Query Param)
exports.app.get('/api/hikcentral/person-photo/:personId', photoTokenMiddleware, auth_1.authMiddleware, async (req, res) => {
    try {
        const { personId } = req.params;
        // Standalone: fotos vêm SOMENTE do banco local (photoUrl base64/data URI)
        const localPerson = await exports.prisma.person.findFirst({
            where: { OR: [{ hikPersonId: personId }, { id: personId }] },
        });
        if (localPerson?.photoUrl?.startsWith('data:')) {
            const matches = localPerson.photoUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                res.set('Content-Type', contentType);
                res.set('Cache-Control', 'public, max-age=3600');
                return res.send(buffer);
            }
        }
        return res.status(404).json({ error: 'Foto não encontrada' });
    }
    catch (error) {
        console.error('[Photo Proxy] Erro:', error.message);
        res.status(500).json({ error: error.message });
    }
});
exports.app.get('/api/residents/select', auth_1.authMiddleware, async (req, res) => {
    try {
        const data = await exports.prisma.person.findMany({
            select: { id: true, firstName: true, lastName: true, unit_number: true, block: true, tower: true, parkingSpaces: true, department: { select: { id: true, name: true, color: true } } },
            orderBy: { firstName: 'asc' }
        });
        res.json(data.map(p => ({
            id: p.id,
            full_name: `${p.firstName} ${p.lastName}`,
            unit_number: p.unit_number || '',
            block: p.block || null,
            tower: p.tower || null,
            parkingSpaces: p.parkingSpaces ?? null,
            department: p.department || null,
        })));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.app.post('/api/residents', auth_1.authMiddleware, async (req, res) => {
    try {
        const body = { ...req.body };
        const prismaData = {};
        if (body.full_name) {
            const parts = body.full_name.trim().split(' ');
            prismaData.firstName = parts[0] || '';
            prismaData.lastName = parts.slice(1).join(' ') || '';
        }
        else {
            prismaData.firstName = body.firstName || '';
            prismaData.lastName = body.lastName || '';
        }
        prismaData.phone = body.phone || null;
        prismaData.email = body.email || null;
        prismaData.cpf = body.cpf || null;
        prismaData.rg = body.rg || null;
        prismaData.tower = body.tower || null;
        prismaData.block = body.block || null;
        prismaData.unit_number = body.unit_number || null;
        prismaData.is_owner = body.is_owner !== undefined ? body.is_owner : true;
        prismaData.is_resident = body.is_resident !== undefined ? body.is_resident : true;
        prismaData.notes = body.notes || null;
        prismaData.photoUrl = body.photo_url || null;
        prismaData.document_photo_url = body.document_photo_url || null;
        prismaData.parkingSpaces = body.parkingSpaces !== undefined && body.parkingSpaces !== null ? parseInt(body.parkingSpaces) : null;
        prismaData.vehiclePlate = body.vehiclePlate || null;
        prismaData.orgIndexCode = body.orgIndexCode || '7'; // Default MORADORES
        prismaData.cardSerial = body.cardSerial || null;
        prismaData.txSerial = body.txSerial || null;
        // Cargo/função — local-only, não sincroniza com o HikCentral (ver JobFunction)
        prismaData.jobFunctionId = body.job_function_id || body.jobFunctionId || null;
        // 1. Cadastrar no HikCentral se disponível (opcional — sistema funciona sem HikCentral)
        let hikPersonId = body.hikcentral_person_id || null;
        if (!hikPersonId && await HikCentralService_1.HikCentralService.isConfigured()) {
            try {
                const hikResponse = await HikCentralService_1.HikCentralService.addPerson({
                    personGivenName: prismaData.firstName,
                    personFamilyName: prismaData.lastName,
                    orgIndexCode: prismaData.orgIndexCode,
                    phoneNo: prismaData.phone || undefined,
                    email: prismaData.email || undefined,
                    certificateNo: body.cpf || undefined,
                    certificateType: body.cpf ? 1 : undefined,
                    personProperties: body.tower ? [{ propertyName: "Torre", propertyValue: body.tower }] : []
                });
                hikPersonId = hikResponse?.data?.personId;
            }
            catch (hikErr) {
                console.warn('[Residents] HikCentral indisponível, prosseguindo sem sincronização ACS:', hikErr.message);
            }
        }
        // 2. Vincular Níveis de Acesso se fornecidos
        if (hikPersonId && body.accessLevels && Array.isArray(body.accessLevels) && body.accessLevels.length > 0) {
            try {
                await HikCentralService_1.HikCentralService.authorizePerson(hikPersonId, body.accessLevels);
            }
            catch (authErr) {
                console.warn('[Residents] Falha ao vincular níveis de acesso:', authErr.message);
            }
        }
        // 2.5 Sincronizar Foto (Face Data) se enviada
        if (hikPersonId && (body.photo || body.photoBase64)) {
            const b64 = body.photoBase64 || body.photo;
            const cleanPhotoBase64 = b64.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');
            try {
                await HikCentralService_1.HikCentralService.addPersonFace(hikPersonId, cleanPhotoBase64);
                console.log(`[HikCentral] Foto sincronizada para morador ${hikPersonId}`);
            }
            catch (faceErr) {
                console.error(`[HikCentral] Erro ao sincronizar foto do morador ${hikPersonId}:`, faceErr.message);
                // Não falha a criação se a foto der erro (apenas loga)
            }
        }
        prismaData.hikPersonId = hikPersonId;
        const person = await exports.prisma.person.create({ data: prismaData });
        // 2.8 Sincronizar com Nice Guarita (Controles e Tags)
        if (person.cardSerial || person.txSerial) {
            try {
                // Fetch the first enabled Guarita device
                const guaritaDevice = await exports.prisma.guaritaDevice.findFirst({ where: { enabled: true } });
                if (guaritaDevice) {
                    if (person.cardSerial) {
                        await NiceGuaritaService_1.NiceGuaritaService.enrollResident(guaritaDevice.id, {
                            serial: person.cardSerial,
                            deviceType: 0x03, // CARD
                            name: `${person.firstName} ${person.lastName}`.trim(),
                            unit: person.unit_number ? parseInt(person.unit_number) : undefined,
                            vehiclePlate: person.vehiclePlate || undefined,
                        });
                    }
                    if (person.txSerial) {
                        await NiceGuaritaService_1.NiceGuaritaService.enrollResident(guaritaDevice.id, {
                            serial: person.txSerial,
                            deviceType: 0x01, // CONTROL
                            name: `${person.firstName} ${person.lastName}`.trim(),
                            unit: person.unit_number ? parseInt(person.unit_number) : undefined,
                            vehiclePlate: person.vehiclePlate || undefined,
                        });
                    }
                    console.log(`[NiceGuarita] Dispositivos de acesso (Card/TX) sincronizados para morador ${person.id}`);
                }
            }
            catch (guaritaErr) {
                console.error(`[NiceGuarita] Erro ao sincronizar morador ${person.id}:`, guaritaErr.message);
            }
        }
        // 3. Gerar Link Único para o App Visitor (cria/reseta o estado de
        //    verificação facial para "awaiting_selfie")
        const onboardingUrl = await (0, onboarding_routes_1.createOnboardingLink)(person.id, person.hikPersonId);
        // 4. Simular Envio de E-mail (Placeholder)
        if (person.email) {
            console.log(`[Email Service] Enviando convite para ${person.email}: ${onboardingUrl}`);
        }
        res.json({
            success: true,
            id: person.id,
            full_name: `${person.firstName} ${person.lastName}`.trim(),
            hikcentral_person_id: person.hikPersonId,
            onboarding_url: onboardingUrl,
            data: person
        });
    }
    catch (error) {
        console.error('Create Resident Error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.app.patch('/api/residents/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const body = { ...req.body };
        const existing = await exports.prisma.person.findFirst({
            where: {
                OR: [
                    { id },
                    { hikPersonId: id }
                ]
            }
        });
        if (!existing)
            return res.status(404).json({ error: 'Morador não encontrado' });
        const parts = body.full_name?.trim().split(' ') || [];
        const updateData = {
            firstName: parts[0] || existing.firstName,
            lastName: parts.slice(1).join(' ') || existing.lastName,
            phone: body.phone !== undefined ? body.phone : existing.phone,
            email: body.email !== undefined ? body.email : existing.email,
            photoUrl: body.photo_url !== undefined ? body.photo_url : existing.photoUrl,
            cpf: body.cpf !== undefined ? body.cpf : existing.cpf,
            rg: body.rg !== undefined ? body.rg : existing.rg,
            tower: body.tower !== undefined ? body.tower : existing.tower,
            block: body.block !== undefined ? body.block : existing.block,
            unit_number: body.unit_number !== undefined ? body.unit_number : existing.unit_number,
            is_owner: body.is_owner !== undefined ? body.is_owner : existing.is_owner,
            is_resident: body.is_resident !== undefined ? body.is_resident : existing.is_resident,
            notes: body.notes !== undefined ? body.notes : existing.notes,
            document_photo_url: body.document_photo_url !== undefined ? body.document_photo_url : existing.document_photo_url,
            parkingSpaces: body.parkingSpaces !== undefined ? (body.parkingSpaces !== null ? parseInt(body.parkingSpaces) : null) : existing.parkingSpaces,
            vehiclePlate: body.vehiclePlate !== undefined ? body.vehiclePlate : existing.vehiclePlate,
            jobFunctionId: (body.job_function_id ?? body.jobFunctionId) !== undefined
                ? (body.job_function_id ?? body.jobFunctionId)
                : existing.jobFunctionId,
        };
        if (body.vehiclePlate !== undefined)
            updateData.vehiclePlate = body.vehiclePlate;
        if (body.cardSerial !== undefined)
            updateData.cardSerial = body.cardSerial;
        if (body.txSerial !== undefined)
            updateData.txSerial = body.txSerial;
        // 1. Sincronizar com HikCentral se tiver ID
        if (existing.hikPersonId && await HikCentralService_1.HikCentralService.isConfigured()) {
            try {
                await HikCentralService_1.HikCentralService.updatePerson({
                    personId: existing.hikPersonId,
                    personGivenName: updateData.firstName,
                    personFamilyName: updateData.lastName,
                    phoneNo: updateData.phone || undefined,
                    email: updateData.email || undefined,
                    certificateNo: body.cpf || undefined,
                    certificateType: body.cpf ? 1 : undefined,
                    personProperties: body.tower ? [{ propertyName: "Torre", propertyValue: body.tower }] : []
                });
                // Atualizar autorizações se fornecidas
                if (body.accessLevels && Array.isArray(body.accessLevels)) {
                    await HikCentralService_1.HikCentralService.authorizePerson(existing.hikPersonId, body.accessLevels);
                }
            }
            catch (hikErr) {
                console.error('[HikCentral] Erro ao atualizar no patch:', hikErr.message);
            }
        }
        const person = await exports.prisma.person.update({
            where: { id: existing.id },
            data: updateData
        });
        // 4. Atualizar Dispositivos Nice Guarita
        if (body.cardSerial !== undefined || body.txSerial !== undefined) {
            try {
                const guaritaDevice = await exports.prisma.guaritaDevice.findFirst({ where: { enabled: true } });
                if (guaritaDevice) {
                    if (person.cardSerial) {
                        await NiceGuaritaService_1.NiceGuaritaService.enrollResident(guaritaDevice.id, {
                            serial: person.cardSerial,
                            deviceType: 0x03,
                            name: `${person.firstName} ${person.lastName}`.trim(),
                            unit: person.unit_number ? parseInt(person.unit_number) : undefined,
                            vehiclePlate: person.vehiclePlate || undefined,
                        });
                    }
                    if (person.txSerial) {
                        await NiceGuaritaService_1.NiceGuaritaService.enrollResident(guaritaDevice.id, {
                            serial: person.txSerial,
                            deviceType: 0x01,
                            name: `${person.firstName} ${person.lastName}`.trim(),
                            unit: person.unit_number ? parseInt(person.unit_number) : undefined,
                            vehiclePlate: person.vehiclePlate || undefined,
                        });
                    }
                }
            }
            catch (err) {
                console.error(`[NiceGuarita] Erro ao atualizar morador ${existing.id}:`, err.message);
            }
        }
        // 5. Re-sincronizar terminais faciais quando foto ou nome mudam
        // (o vínculo de áreas dispara o próprio re-sync em access-areas.routes.ts)
        if (body.photo_url !== undefined || body.full_name !== undefined) {
            void FacialAccessService_1.FacialAccessService.syncPersonEverywhere(person.id).catch((err) => console.warn(`[FacialAccess] Re-sync do morador ${person.id} falhou:`, err?.message || err));
        }
        res.json({
            success: true,
            id: person.id,
            full_name: `${person.firstName} ${person.lastName}`.trim(),
            cpf: '',
            phone: person.phone || null,
            email: person.email || null,
            unit_number: person.orgIndexCode || '',
            block: null,
            tower: HIK_ORG_NAMES[person.orgIndexCode] || null,
            photo_url: person.photoUrl || null,
            is_owner: true,
            hikcentral_person_id: person.hikPersonId || null,
            notes: null,
            created_by: null,
            created_at: person.createdAt,
            updated_at: person.updatedAt,
        });
    }
    catch (error) {
        console.error('Update Resident Error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.app.delete('/api/residents/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        let deletedCardNo = null;
        try {
            const target = await exports.prisma.person.findUnique({ where: { id }, select: { facialAccessCardNo: true } });
            deletedCardNo = target?.facialAccessCardNo ?? null;
            await exports.prisma.person.delete({ where: { id } });
        }
        catch (uuidErr) {
            if (uuidErr?.code === 'P2025' || uuidErr?.code === 'P2023') {
                const existing = await exports.prisma.person.findFirst({ where: { hikPersonId: id } });
                if (!existing)
                    return res.status(404).json({ error: 'Morador não encontrado' });
                deletedCardNo = existing.facialAccessCardNo ?? null;
                await exports.prisma.person.delete({ where: { id: existing.id } });
            }
            else {
                throw uuidErr;
            }
        }
        // Best-effort: remove o cadastro (pessoa + face) dos terminais faciais
        if (deletedCardNo) {
            const cardNo = deletedCardNo;
            void (async () => {
                const devices = await exports.prisma.facialAccessDevice.findMany({ where: { enabled: true } });
                for (const device of devices) {
                    await FacialAccessService_1.FacialAccessService.deletePersonFromDevice(device, cardNo).catch((err) => console.warn(`[FacialAccess] Falha ao remover ${cardNo} de ${device.name}:`, err?.message || err));
                }
            })();
        }
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.app.post('/api/residents/:id/recovery-link', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        // 1. Tentar buscar no banco local primeiro
        let person = await exports.prisma.person.findUnique({ where: { id } });
        // Se não encontrar, assume que `id` pode ser o hikPersonId (IndexCode)
        if (!person) {
            person = await exports.prisma.person.findFirst({ where: { hikPersonId: id } });
        }
        if (!person) {
            return res.status(404).json({ error: 'Morador não encontrado no banco de dados local.' });
        }
        if (!person.email) {
            return res.status(400).json({
                error: 'Este morador não possui e-mail cadastrado. Onboarding do App Visitor requer um e-mail válido.'
            });
        }
        // 2. Gerar Token JWT (48h) e resetar o estado de verificação facial
        const onboardingUrl = await (0, onboarding_routes_1.createOnboardingLink)(person.id, person.hikPersonId);
        res.status(200).json({
            message: 'Link de acesso gerado com sucesso.',
            onboarding_url: onboardingUrl
        });
    }
    catch (error) {
        console.error('Erro ao gerar link de recuperação:', error);
        res.status(500).json({ error: 'Falha interna ao gerar link de acesso.' });
    }
});
// ============ Staff (Administração e Portaria) ============
// Handled in StaffController
// ============ Visitors CRUD ============
exports.app.get('/api/visitors', auth_1.authMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const where = search ? {
            name: { contains: search, mode: 'insensitive' }
        } : {};
        const data = await exports.prisma.visitor.findMany({
            where: where,
            skip,
            take: parseInt(limit),
            orderBy: { createdAt: 'desc' }
        });
        const count = await exports.prisma.visitor.count({ where: where });
        res.json({ data, count });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.app.post('/api/visitors', auth_1.authMiddleware, async (req, res) => {
    try {
        const { created_by, accessLevelIndexCode, accessLevelId, ...validData } = req.body;
        // ensure validData only contains Prisma visitor model fields
        const validFields = ['name', 'surname', 'type', 'certificateType', 'certificateNo', 'email', 'phone', 'plateNo', 'visitStartTime', 'visitEndTime', 'hikVisitorId', 'externalId', 'status', 'inviteToken', 'accessLevelId', 'createdAt', 'document', 'document_photo_url', 'full_name', 'notes', 'photo_url', 'purpose', 'tower', 'updated_at', 'visiting_resident', 'visiting_unit', 'visiting_block', 'lgpdConsent', 'consentTimestamp'];
        const sanitizedData = {};
        for (const key of Object.keys(validData)) {
            if (validFields.includes(key)) {
                sanitizedData[key] = validData[key];
            }
        }
        const visitor = await exports.prisma.visitor.create({ data: sanitizedData });
        res.json(visitor);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.app.patch('/api/visitors/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { created_by, accessLevelIndexCode, accessLevelId, id: _id, ...validData } = req.body;
        const validFields = ['name', 'surname', 'type', 'certificateType', 'certificateNo', 'email', 'phone', 'plateNo', 'visitStartTime', 'visitEndTime', 'hikVisitorId', 'externalId', 'status', 'inviteToken', 'accessLevelId', 'createdAt', 'document', 'document_photo_url', 'full_name', 'notes', 'photo_url', 'purpose', 'tower', 'updated_at', 'visiting_resident', 'visiting_unit', 'visiting_block', 'lgpdConsent', 'consentTimestamp'];
        const sanitizedData = {};
        for (const key of Object.keys(validData)) {
            if (validFields.includes(key)) {
                sanitizedData[key] = validData[key];
            }
        }
        const visitor = await exports.prisma.visitor.update({
            where: { id },
            data: sanitizedData
        });
        res.json(visitor);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Reserve/schedule a visitor appointment (used by the operator panel for eventual service providers)
exports.app.post('/api/visitors/reserve', auth_1.authMiddleware, async (req, res) => {
    try {
        const { visitorName, certificateNo, visitStartTime, visitEndTime, plateNo, visitorPicData } = req.body;
        const nameParts = (visitorName || '').trim().split(' ');
        const name = nameParts[0] || 'Visitante';
        const surname = nameParts.slice(1).join(' ') || '';
        const visitor = await exports.prisma.visitor.create({
            data: {
                name,
                surname,
                type: 'PROVIDER',
                certificateNo: certificateNo || `res-${Date.now()}`,
                certificateType: '111',
                status: 'SCHEDULED',
                visitStartTime: visitStartTime ? new Date(visitStartTime) : new Date(),
                visitEndTime: visitEndTime ? new Date(visitEndTime) : new Date(Date.now() + 86400000),
                plateNo: plateNo || null,
                photo_url: visitorPicData ? `data:image/jpeg;base64,${visitorPicData}` : null,
            }
        });
        res.status(201).json({ code: '0', msg: 'success', data: { visitorId: visitor.id } });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.app.post('/api/visitors/pre-register', auth_1.authMiddleware, async (req, res) => {
    try {
        const payload = req.body;
        // Criptografar documento se fornecido ou dummy
        const phoneParam = payload.phone?.replace(/\D/g, '') || null;
        const inviteToken = crypto_1.default.randomBytes(16).toString('hex');
        // Buscar host hikPersonId usando req.user
        let hostHikPersonId = payload.accessLevelId || null;
        if (req.user?.email) {
            const hostPerson = await exports.prisma.person.findFirst({
                where: { email: req.user.email }
            });
            if (hostPerson && hostPerson.hikPersonId) {
                hostHikPersonId = hostPerson.hikPersonId;
            }
        }
        const visitor = await exports.prisma.visitor.create({
            data: {
                name: payload.name,
                surname: payload.surname,
                type: payload.type || 'VISITOR',
                visitStartTime: new Date(payload.startTime),
                visitEndTime: new Date(payload.endTime),
                email: payload.email || null,
                phone: phoneParam,
                inviteToken: inviteToken,
                status: 'PRE_REGISTERED',
                // Assuming document is required by Prisma, use a dummy or optional
                certificateNo: payload.document || `pre-${Date.now()}`,
                certificateType: '111',
                accessLevelId: hostHikPersonId
            }
        });
        res.status(201).json({
            ...visitor,
            completionLink: `/login/guest-complete?token=${inviteToken}`
        });
    }
    catch (error) {
        console.error('Pre-register Error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.app.post('/api/invites/send-link', auth_1.authMiddleware, async (req, res) => {
    try {
        const { reservationId, method } = req.body;
        // In a real application, implement the WhatsApp/Email service logic here
        console.log(`[Mock] Sending ${method} invite for reservation ${reservationId}`);
        res.json({ success: true, message: `Convite enviado via ${method}` });
    }
    catch (error) {
        console.error('Send Link Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Endpoints de onboarding (validate/confirm-cpf/complete/selfie/pending-reviews)
// migraram para routes/onboarding.routes.ts, montado em /api/onboarding acima.
exports.app.post('/api/invites/validate', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token)
            return res.status(400).json({ message: "Token não fornecido" });
        const visitor = await exports.prisma.visitor.findFirst({
            where: { inviteToken: token, status: 'PRE_REGISTERED' }
        });
        if (!visitor) {
            return res.status(404).json({ message: "Convite inválido ou já utilizado" });
        }
        // In this implementation, we don't store host info in Visitor yet, but we mock or return known data
        res.json({
            id: visitor.id,
            name: `${visitor.name} ${visitor.surname}`.trim(),
            hostName: "Morador", // Fallback
            unit: "Residência" // Fallback
        });
    }
    catch (error) {
        console.error('Validate Invite Error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.app.post('/api/invites/complete', async (req, res) => {
    try {
        const { token, doc, photoBase64, photo, docPhotoBase64, name, plate } = req.body;
        if (!token)
            return res.status(400).json({ message: "Token não fornecido" });
        const visitor = await exports.prisma.visitor.findFirst({
            where: { inviteToken: token, status: 'PRE_REGISTERED' }
        });
        if (!visitor) {
            return res.status(404).json({ message: "Convite não encontrado ou já processado" });
        }
        // Remove base64 prefix if exists
        const b64 = photoBase64 || photo;
        const cleanPhotoBase64 = b64 ? b64.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '') : undefined;
        // Sincronizar com HikCentral (opcional — sistema funciona sem HikCentral)
        let hikVisitorId;
        if (await HikCentralService_1.HikCentralService.isConfigured())
            try {
                const hikResult = await HikCentralService_1.HikCentralService.reserveVisitor({
                    visitorName: `${visitor.name} ${visitor.surname || ''}`.trim(),
                    certificateNo: doc || visitor.certificateNo || `DOC${Date.now()}`,
                    visitStartTime: visitor.visitStartTime.toISOString(),
                    visitEndTime: visitor.visitEndTime.toISOString(),
                    plateNo: plate || visitor.plateNo || undefined,
                    visitorPicData: cleanPhotoBase64
                });
                hikVisitorId = hikResult?.data?.visitorId;
                // Tentar aplicar herança de níveis de acesso do Morador
                const hostHikPersonId = visitor.accessLevelId;
                if (hostHikPersonId && hikVisitorId) {
                    try {
                        const accessLevelsRes = await HikCentralService_1.HikCentralService.getPersonAccessLevels(hostHikPersonId);
                        const accessLevels = accessLevelsRes?.data?.list?.map((a) => a.accessLevelIndexCode || a.privilegeGroupId) || [];
                        if (accessLevels.length > 0) {
                            await HikCentralService_1.HikCentralService.authorizePerson(hikVisitorId, accessLevels, '2');
                            console.log(`[HikCentral] Direitos do host ${hostHikPersonId} passados para vis. ${hikVisitorId}`);
                        }
                    }
                    catch (err) {
                        console.error('[HikCentral] Erro ao herdar níveis de acesso para visitante:', err.message);
                    }
                }
            }
            catch (hikErr) {
                console.warn('[Invites] HikCentral indisponível, ativando visitante apenas no DB local:', hikErr.message);
            }
        const updatedVisitor = await exports.prisma.visitor.update({
            where: { id: visitor.id },
            data: {
                status: 'ACTIVE',
                certificateNo: doc || visitor.certificateNo,
                plateNo: plate || visitor.plateNo,
                photo_url: cleanPhotoBase64 ? `data:image/jpeg;base64,${cleanPhotoBase64}` : visitor.photo_url,
                hikVisitorId: hikVisitorId ?? visitor.hikVisitorId
            }
        });
        res.json({ success: true, visitor: updatedVisitor, qrCodeData: "Visitante cadastrado com sucesso e liberado!" });
    }
    catch (error) {
        console.error('Complete Invite Error:', error);
        res.status(500).json({ message: error.message });
    }
});
exports.app.get('/api/visitors/active', auth_1.authMiddleware, async (req, res) => {
    try {
        const activeVisitors = await exports.prisma.visitor.findMany({
            where: {
                status: 'ACTIVE',
                visitEndTime: {
                    gte: new Date()
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.json({ data: activeVisitors, count: activeVisitors.length });
    }
    catch (error) {
        console.error('Active Visitors Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ── DEPARTMENTS ──────────────────────────────────────────────────────────────
exports.app.get('/api/departments', auth_1.authMiddleware, async (req, res) => {
    try {
        const departments = await exports.prisma.department.findMany({
            orderBy: { name: 'asc' },
            include: { _count: { select: { persons: true } } }
        });
        res.json(departments.map(d => ({ ...d, personCount: d._count.persons })));
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.app.post('/api/departments', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, description, color, hasAddresses } = req.body;
        if (!name?.trim())
            return res.status(400).json({ error: 'Nome é obrigatório' });
        const dept = await exports.prisma.department.create({
            data: {
                name: name.trim(),
                description: description || null,
                color: color || null,
                hasAddresses: hasAddresses !== undefined ? hasAddresses : true
            }
        });
        res.status(201).json(dept);
    }
    catch (error) {
        res.status(error.code === 'P2002' ? 409 : 500).json({ error: error.message });
    }
});
exports.app.put('/api/departments/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { name, description, color, hasAddresses } = req.body;
        const dept = await exports.prisma.department.update({
            where: { id: req.params.id },
            data: {
                ...(name && { name: name.trim() }),
                description: description ?? null,
                color: color ?? null,
                ...(hasAddresses !== undefined && { hasAddresses })
            }
        });
        res.json(dept);
    }
    catch (error) {
        res.status(error.code === 'P2025' ? 404 : 500).json({ error: error.message });
    }
});
exports.app.delete('/api/departments/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        await exports.prisma.department.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (error) {
        res.status(error.code === 'P2025' ? 404 : 500).json({ error: error.message });
    }
});
// ============ Access Logs (HikCentral + Local DB) ============
exports.app.get('/api/access-logs', auth_1.authMiddleware, async (req, res) => {
    try {
        const { startTime, endTime, pageNo = 1, pageSize = 50, source = 'all' } = req.query;
        const start = startTime || new Date(Date.now() - 86400000).toISOString();
        const end = endTime || new Date().toISOString();
        // Try to fetch from HikCentral and store locally (só quando integração configurada)
        if (source !== 'local' && await HikCentralService_1.HikCentralService.isConfigured()) {
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
                    await exports.prisma.accessEvent.upsert({
                        where: { id: event.eventId || event.id || `hik-${Date.now()}-${Math.random()}` },
                        update: {},
                        create: {
                            personName: event.personName || 'Desconhecido',
                            eventTime: new Date(event.eventTime || event.happenTime),
                            occurredAt: new Date(event.eventTime || event.happenTime),
                            deviceName: event.deviceName || event.srcName || 'N/A',
                            doorName: event.doorName || event.srcName || 'N/A',
                            eventType: event.eventType?.toString() || 'ACCESS',
                            picUri: event.picUri || null,
                            direction: event.eventType === 'EXIT' ? 'out' : 'in',
                            category: 'access',
                            source: 'hikcentral',
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
        const data = await exports.prisma.accessEvent.findMany({
            where,
            skip,
            take: parseInt(pageSize),
            orderBy: { eventTime: 'desc' },
        });
        const total = await exports.prisma.accessEvent.count({ where });
        res.json({ data, total, source: 'local' });
    }
    catch (error) {
        console.error('Access Logs Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============ Service Providers ============
// Handled in ServiceProvidersController
// ============ Towers ============
exports.app.get('/api/towers/active', auth_1.authMiddleware, async (req, res) => {
    try {
        const towers = await exports.prisma.tower.findMany({
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
exports.app.get('/api/dashboard/stats', auth_1.authMiddleware, async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        // Resolver códigos de departamento via EntityMappings (data-driven)
        const [residentCodes, prestadoresCodes, staffCodes] = await Promise.all([
            EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/residents'),
            EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/service-providers'),
            EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/staff'),
        ]);
        const [totalResidents, totalProviders] = await Promise.all([
            exports.prisma.person.count({ where: { orgIndexCode: { in: residentCodes } } }),
            exports.prisma.person.count({ where: { orgIndexCode: { in: prestadoresCodes } } }),
        ]);
        const [totalVisitors, todayAccess, totalAccessEvents] = await Promise.all([
            exports.prisma.visitor.count(),
            exports.prisma.accessEvent.count({
                where: { occurredAt: { gte: startOfDay } }
            }),
            exports.prisma.accessEvent.count(),
        ]);
        // Active visits: visitors whose visit window includes right now
        const activeVisits = await exports.prisma.visitor.count({
            where: {
                visitStartTime: { lte: now },
                visitEndTime: { gte: now },
            }
        });
        // Fetch device status from local DB (Guarita devices)
        let onlineDevices = 0;
        let offlineDevices = 0;
        try {
            const devices = await exports.prisma.guaritaDevice.findMany();
            // Para não bloquear, consideramos online os que estão enabled.
            // Para um ping real precisaria testar, mas para a dashboard não queremos travar.
            onlineDevices = devices.filter(d => d.enabled).length;
            offlineDevices = devices.filter(d => !d.enabled).length;
        }
        catch (err) {
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
    }
    catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ error: error.message });
    }
});
exports.app.get('/api/devices/status', auth_1.authMiddleware, async (req, res) => {
    try {
        // Agrega locais (videoporteiros + Guarita MG3000) e HikCentral (se configurado)
        const devices = await DeviceStatusService_1.DeviceStatusService.getAll();
        res.json(devices);
    }
    catch (error) {
        console.error('Devices Status Error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ============ Profiles / Users ============
exports.app.get('/api/profiles', auth_1.authMiddleware, async (req, res) => {
    try {
        const users = await exports.prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true, createdAt: true }
        });
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.app.get('/api/profiles/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await exports.prisma.user.findUnique({
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
exports.app.get('/api/hik-config', auth_1.adminMiddleware, async (req, res) => {
    try {
        const config = await exports.prisma.hikcentralConfig.findFirst({
            orderBy: { createdAt: 'desc' }
        });
        if (!config)
            return res.json({ apiUrl: '', appKey: '', appSecretSet: false, syncEnabled: false });
        res.json({ apiUrl: config.apiUrl, appKey: config.appKey, appSecretSet: !!config.appSecret, syncEnabled: config.syncEnabled });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.app.put('/api/hik-config', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { apiUrl, appKey, appSecret, syncEnabled } = req.body;
        const existing = await exports.prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
        if (existing) {
            const config = await exports.prisma.hikcentralConfig.update({
                where: { id: existing.id },
                data: { apiUrl, appKey, ...(appSecret && { appSecret }), syncEnabled },
            });
            return res.json({ apiUrl: config.apiUrl, appKey: config.appKey, appSecretSet: !!config.appSecret, syncEnabled: config.syncEnabled });
        }
        const config = await exports.prisma.hikcentralConfig.create({
            data: { apiUrl, appKey, appSecret, syncEnabled },
        });
        res.json({ apiUrl: config.apiUrl, appKey: config.appKey, appSecretSet: !!config.appSecret, syncEnabled: config.syncEnabled });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ Visit Logs ============
exports.app.post('/api/visit-logs', auth_1.authMiddleware, async (req, res) => {
    try {
        // Store as an access event (com broadcast SSE para a Central de Eventos)
        const log = await (0, EventBusService_1.emitEvent)({
            personName: req.body.personName || 'Visitante',
            personType: req.body.personType || 'visitor',
            personId: req.body.visitor_id || null,
            unit: req.body.unit || null,
            operatorId: req.user?.id || req.body.authorized_by || null,
            deviceName: req.body.deviceName || 'Manual',
            doorName: req.body.doorName || 'Portaria',
            eventType: req.body.eventType || 'VISIT',
            direction: 'in',
            category: 'access',
            source: 'manual',
            notes: req.body.notes || null,
        });
        res.json(log);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ Users CRUD (for admin panel) ============
exports.app.get('/api/users', auth_1.adminMiddleware, async (req, res) => {
    try {
        const users = await exports.prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true, isProtected: true, createdAt: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.app.post('/api/users', auth_1.adminMiddleware, async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 12);
        const user = await exports.prisma.user.create({
            data: { email, password: hashedPassword, name, role: role || 'ADMIN' },
        });
        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.app.delete('/api/users/:id', auth_1.adminMiddleware, async (req, res) => {
    try {
        // Check if user is protected before deleting
        const user = await exports.prisma.user.findUnique({ where: { id: req.params.id } });
        if (user?.isProtected) {
            return res.status(403).json({ error: 'Usuário protegido não pode ser removido' });
        }
        await exports.prisma.user.delete({ where: { id: req.params.id } });
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ============ System Status (for admin panel) ============
exports.app.get('/api/system/status', auth_1.authMiddleware, async (req, res) => {
    try {
        // Check DB connectivity
        let dbStatus = 'OFFLINE';
        try {
            await exports.prisma.$queryRaw `SELECT 1`;
            dbStatus = 'ONLINE';
        }
        catch {
            dbStatus = 'OFFLINE';
        }
        // Check HikCentral connectivity (standalone: reporta NOT_CONFIGURED sem tentar)
        let hikStatus = 'NOT_CONFIGURED';
        if (await HikCentralService_1.HikCentralService.isConfigured()) {
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
// ============ Background: Sincronização de Eventos de Acesso a cada 2 minutos ============
// Standalone (sem HikCentral configurado): não dispara sincronização nenhuma.
setInterval(async () => {
    try {
        if (!(await HikCentralService_1.HikCentralService.isConfigured()))
            return;
        await HikCentralSyncService_1.HikCentralSyncService.syncAccessEvents();
    }
    catch (err) {
        console.error('[Cron] Falha no syncAccessEvents:', err?.message || err);
    }
}, 2 * 60 * 1000); // 2 minutos
