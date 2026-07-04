"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceProvidersController = void 0;
const database_1 = require("../database");
const HikCentralService_1 = require("../services/HikCentralService");
const EntityMappingService_1 = require("../services/EntityMappingService");
const hik_constants_1 = require("../config/hik-constants");
const client_1 = require("@prisma/client");
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
    const visitingBlockKeys = ['visiting_block', 'visitingBlock'];
    const visitingUnitKeys = ['visiting_unit', 'visitingUnit'];
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
    if (!partial || hasAnyField(body, visitingBlockKeys)) {
        data.visitingBlock = normalizeOptionalText(getFirstField(body, visitingBlockKeys), 'visiting_block');
    }
    if (!partial || hasAnyField(body, visitingUnitKeys)) {
        data.visitingUnit = normalizeOptionalText(getFirstField(body, visitingUnitKeys), 'visiting_unit');
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
    if (value == null)
        return null;
    if (Array.isArray(value)) {
        return value.filter((v) => typeof v === 'string');
    }
    return null;
};
const serializeServiceProvider = (item) => ({
    id: item.id,
    full_name: item.fullName,
    document: item.document,
    service_type: item.serviceType,
    provider_type: item.providerType,
    company_name: item.companyName,
    phone: item.phone,
    email: item.email,
    photo_url: item.photoUrl,
    document_photo_url: item.documentPhotoUrl,
    tower: item.tower,
    visiting_block: item.visitingBlock,
    visiting_unit: item.visitingUnit,
    visiting_resident: item.visitingResident,
    valid_from: item.validFrom,
    valid_until: item.validUntil,
    authorized_units: extractAuthorizedUnits(item.authorizedUnits),
    notes: item.notes,
    hikcentral_person_id: item.hikcentralPersonId,
    created_by: item.createdBy,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
});
const ensureServiceProviderRelations = async (payload) => {
    if (payload.createdBy) {
        const user = await database_1.prisma.user.findUnique({ where: { id: payload.createdBy } });
        if (!user)
            throw new Error('Usuário (created_by) não encontrado');
    }
};
class ServiceProvidersController {
    async list(req, res) {
        try {
            const { page = '1', limit = '20', search = '' } = req.query;
            const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
            const limitNum = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 20));
            const normalizedSearch = (search || '').trim();
            const prestadoresOrgCodes = await EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/service-providers');
            console.log(`[HikCentral] PRESTADORES orgCodes resolvidos: ${prestadoresOrgCodes.join(',')}`);
            try {
                const hikPromise = HikCentralService_1.HikCentralService.getPersonList({ pageNo: 1, pageSize: 500 });
                const hikResult = await Promise.race([
                    hikPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
                ]);
                const hikPersons = hikResult?.data?.list || [];
                if (hikPersons.length > 0) {
                    const prestadores = hikPersons.filter((p) => prestadoresOrgCodes.includes(String(p.orgIndexCode || '')));
                    for (const p of prestadores) {
                        try {
                            const hikId = p.personId || p.indexCode;
                            if (!hikId)
                                continue;
                            await database_1.prisma.person.upsert({
                                where: { hikPersonId: hikId },
                                update: {
                                    firstName: p.personGivenName || p.personName || '',
                                    lastName: p.personFamilyName || '',
                                    phone: p.phoneNo || null,
                                    email: p.email || null,
                                    orgIndexCode: String(p.orgIndexCode || '3'),
                                },
                                create: {
                                    firstName: p.personGivenName || p.personName || '',
                                    lastName: p.personFamilyName || '',
                                    phone: p.phoneNo || null,
                                    email: p.email || null,
                                    orgIndexCode: String(p.orgIndexCode || '3'),
                                    hikPersonId: hikId,
                                },
                            });
                        }
                        catch (_) { }
                    }
                    let filtered = prestadores;
                    if (normalizedSearch) {
                        const s = normalizedSearch.toLowerCase();
                        filtered = prestadores.filter((p) => (p.personGivenName + ' ' + p.personFamilyName).toLowerCase().includes(s) ||
                            p.phoneNo?.toLowerCase().includes(s) ||
                            p.email?.toLowerCase().includes(s));
                    }
                    return res.json({
                        data: filtered.map((p) => {
                            const orgCode = String(p.orgIndexCode || '3');
                            const orgName = hik_constants_1.HIK_ORG_NAMES[orgCode] || p.orgName || 'PRESTADORES';
                            return {
                                id: p.personId || p.indexCode,
                                full_name: `${p.personGivenName || p.personName || ''} ${p.personFamilyName || ''}`.trim(),
                                document: p.certificateNo || '',
                                service_type: orgName,
                                provider_type: 'recurrent',
                                company_name: null,
                                phone: p.phoneNo || null,
                                email: p.email || null,
                                photo_url: p.hikPersonId ? `/api/hikcentral/person-photo/${p.personId || p.indexCode}` : null,
                                department: orgName,
                                hikPersonId: p.personId || p.indexCode || null,
                                created_at: p.createTime || new Date().toISOString(),
                                updated_at: p.updateTime || new Date().toISOString(),
                            };
                        }),
                        count: filtered.length,
                        source: 'hikcentral',
                    });
                }
            }
            catch (hikErr) {
                console.warn('[HikCentral] Fallback service-providers para banco local:', hikErr.message);
            }
            const skip = (pageNum - 1) * limitNum;
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
                database_1.prisma.serviceProvider.findMany({ where, skip, take: limitNum, orderBy: { createdAt: 'desc' } }),
                database_1.prisma.serviceProvider.count({ where }),
            ]);
            return res.json({ data: data.map(serializeServiceProvider), count });
        }
        catch (error) {
            return res.status(500).json({ error: error.message || 'Erro ao consultar prestadores' });
        }
    }
    async create(req, res) {
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
                visitingBlock: payload.visitingBlock ?? null,
                visitingUnit: payload.visitingUnit ?? null,
                visitingResident: payload.visitingResident ?? null,
                validFrom: payload.validFrom ?? null,
                validUntil: payload.validUntil ?? null,
                authorizedUnits: payload.authorizedUnits === null ? client_1.Prisma.JsonNull : payload.authorizedUnits,
                notes: payload.notes ?? null,
                hikcentralPersonId: payload.hikcentralPersonId ?? null,
                createdBy,
            };
            const created = await database_1.prisma.serviceProvider.create({
                data: createData,
            });
            return res.status(201).json(serializeServiceProvider(created));
        }
        catch (error) {
            return res.status(400).json({ error: error.message || 'Erro ao criar prestador' });
        }
    }
    async update(req, res) {
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
            if (payload.visitingBlock !== undefined)
                updateData.visitingBlock = payload.visitingBlock;
            if (payload.visitingUnit !== undefined)
                updateData.visitingUnit = payload.visitingUnit;
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
            const updated = await database_1.prisma.serviceProvider.update({
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
    }
    async delete(req, res) {
        try {
            await database_1.prisma.serviceProvider.delete({ where: { id: req.params.id } });
            return res.status(204).send();
        }
        catch (error) {
            if (error?.code === 'P2025') {
                return res.status(404).json({ error: 'Prestador não encontrado' });
            }
            return res.status(500).json({ error: error.message || 'Erro ao remover prestador' });
        }
    }
}
exports.ServiceProvidersController = ServiceProvidersController;
