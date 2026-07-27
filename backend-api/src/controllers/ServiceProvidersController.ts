import { Request, Response } from 'express';
import { prisma } from '../database';
import { Prisma } from '@prisma/client';
import { HikCentralSyncQueueService } from '../services/HikCentralSyncQueueService';

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
    visitingBlock?: string | null;
    visitingUnit?: string | null;
    visitingResident?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
    authorizedUnits?: Prisma.InputJsonValue | null;
    notes?: string | null;
    hikcentralPersonId?: string | null;
    jobFunctionId?: string | null;
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
    const visitingBlockKeys = ['visiting_block', 'visitingBlock'];
    const visitingUnitKeys = ['visiting_unit', 'visitingUnit'];
    const visitingResidentKeys = ['visiting_resident', 'visitingResident'];
    const validFromKeys = ['valid_from', 'validFrom'];
    const validUntilKeys = ['valid_until', 'validUntil'];
    const authorizedUnitsKeys = ['authorized_units', 'authorizedUnits'];
    const notesKeys = ['notes'];
    const hikcentralPersonIdKeys = ['hikcentral_person_id', 'hikcentralPersonId'];
    const jobFunctionIdKeys = ['job_function_id', 'jobFunctionId'];
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
        data.hikcentralPersonId = normalizeOptionalText(
            getFirstField(body, hikcentralPersonIdKeys),
            'hikcentral_person_id',
        );
    }
    if (!partial || hasAnyField(body, jobFunctionIdKeys)) {
        data.jobFunctionId = normalizeOptionalText(getFirstField(body, jobFunctionIdKeys), 'job_function_id');
    }
    if (!partial || hasAnyField(body, createdByKeys)) {
        data.createdBy = normalizeOptionalText(getFirstField(body, createdByKeys), 'created_by');
    }

    return data;
};

const extractAuthorizedUnits = (value: Prisma.JsonValue | null): string[] | null => {
    if (value == null) return null;
    if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === 'string');
    }
    return null;
};

const serializeServiceProvider = (item: any) => ({
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
    hik_sync_status: item.hikSyncStatus,
    hik_sync_error: item.hikSyncError,
    job_function_id: item.jobFunctionId,
    job_function_name: item.jobFunction?.name,
    created_by: item.createdBy,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
});

const ensureServiceProviderRelations = async (payload: ServiceProviderWriteData) => {
    if (payload.createdBy) {
        const user = await prisma.user.findUnique({ where: { id: payload.createdBy } });
        if (!user) throw new Error('Usuário (created_by) não encontrado');
    }
    if (payload.jobFunctionId) {
        const jobFunction = await prisma.jobFunction.findUnique({ where: { id: payload.jobFunctionId } });
        if (!jobFunction) throw new Error('Função (job_function_id) não encontrada');
    }
};

export class ServiceProvidersController {
    async list(req: Request, res: Response) {
        try {
            const { page = '1', limit = '20', search = '' } = req.query as Record<string, string | undefined>;
            const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
            const limitNum = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 20));
            const normalizedSearch = (search || '').trim();


            const skip = (pageNum - 1) * limitNum;
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
                    where, skip, take: limitNum, orderBy: { createdAt: 'desc' },
                    include: { jobFunction: { select: { name: true } } },
                }),
                prisma.serviceProvider.count({ where }),
            ]);

            return res.json({ data: data.map(serializeServiceProvider), count });
        } catch (error: any) {
            return res.status(500).json({ error: error.message || 'Erro ao consultar prestadores' });
        }
    }

    async create(req: Request, res: Response) {
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
                visitingBlock: payload.visitingBlock ?? null,
                visitingUnit: payload.visitingUnit ?? null,
                visitingResident: payload.visitingResident ?? null,
                validFrom: payload.validFrom ?? null,
                validUntil: payload.validUntil ?? null,
                authorizedUnits: payload.authorizedUnits === null ? Prisma.JsonNull : payload.authorizedUnits,
                notes: payload.notes ?? null,
                hikcentralPersonId: payload.hikcentralPersonId ?? null,
                jobFunction: payload.jobFunctionId ? { connect: { id: payload.jobFunctionId } } : undefined,
                createdBy,
            };

            const created = await prisma.serviceProvider.create({
                data: createData,
            });

            await HikCentralSyncQueueService.enqueue('SERVICE_PROVIDER', created.id, 'create', {
                fullName: created.fullName,
                phone: created.phone,
                email: created.email,
                hikcentralPersonId: created.hikcentralPersonId,
            });

            return res.status(201).json(serializeServiceProvider(created));
        } catch (error: any) {
            return res.status(400).json({ error: error.message || 'Erro ao criar prestador' });
        }
    }

    async update(req: Request, res: Response) {
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
            if (payload.visitingBlock !== undefined) updateData.visitingBlock = payload.visitingBlock;
            if (payload.visitingUnit !== undefined) updateData.visitingUnit = payload.visitingUnit;
            if (payload.visitingResident !== undefined) updateData.visitingResident = payload.visitingResident;
            if (payload.validFrom !== undefined) updateData.validFrom = payload.validFrom;
            if (payload.validUntil !== undefined) updateData.validUntil = payload.validUntil;
            if (payload.authorizedUnits !== undefined) {
                updateData.authorizedUnits = payload.authorizedUnits === null ? Prisma.JsonNull : payload.authorizedUnits;
            }
            if (payload.notes !== undefined) updateData.notes = payload.notes;
            if (payload.hikcentralPersonId !== undefined) updateData.hikcentralPersonId = payload.hikcentralPersonId;
            if (payload.jobFunctionId !== undefined) {
                updateData.jobFunction = payload.jobFunctionId
                    ? { connect: { id: payload.jobFunctionId } }
                    : { disconnect: true };
            }
            if (payload.createdBy !== undefined) updateData.createdBy = payload.createdBy;

            const updated = await prisma.serviceProvider.update({
                where: { id: req.params.id },
                data: updateData,
            });

            // Só reenfileira se algum campo relevante para o HikCentral mudou.
            if (
                payload.fullName !== undefined ||
                payload.phone !== undefined ||
                payload.email !== undefined
            ) {
                await HikCentralSyncQueueService.enqueue('SERVICE_PROVIDER', updated.id, 'update', {
                    fullName: updated.fullName,
                    phone: updated.phone,
                    email: updated.email,
                    hikcentralPersonId: updated.hikcentralPersonId,
                });
            }

            return res.json(serializeServiceProvider(updated));
        } catch (error: any) {
            if (error?.code === 'P2025') {
                return res.status(404).json({ error: 'Prestador não encontrado' });
            }
            return res.status(400).json({ error: error.message || 'Erro ao atualizar prestador' });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const existing = await prisma.serviceProvider.findUnique({ where: { id: req.params.id } });
            if (!existing) {
                return res.status(404).json({ error: 'Prestador não encontrado' });
            }

            await prisma.serviceProvider.delete({ where: { id: req.params.id } });

            await HikCentralSyncQueueService.enqueue('SERVICE_PROVIDER', existing.id, 'delete', {
                fullName: existing.fullName,
                hikcentralPersonId: existing.hikcentralPersonId,
            });

            return res.status(204).send();
        } catch (error: any) {
            if (error?.code === 'P2025') {
                return res.status(404).json({ error: 'Prestador não encontrado' });
            }
            return res.status(500).json({ error: error.message || 'Erro ao remover prestador' });
        }
    }

    /**
     * Reprocessa a sincronização com o HikCentral para este prestador,
     * reaproveitando a última linha da fila (reset de tentativas/erro).
     */
    async retrySync(req: Request, res: Response) {
        try {
            const provider = await prisma.serviceProvider.findUnique({ where: { id: req.params.id } });
            if (!provider) {
                return res.status(404).json({ error: 'Prestador não encontrado' });
            }

            const lastQueueRow = await prisma.hikCentralSyncQueue.findFirst({
                where: { entityType: 'SERVICE_PROVIDER', entityId: provider.id },
                orderBy: { createdAt: 'desc' },
            });

            if (!lastQueueRow) {
                return res.status(404).json({ error: 'Nenhuma sincronização pendente para este prestador' });
            }

            await prisma.hikCentralSyncQueue.update({
                where: { id: lastQueueRow.id },
                data: { status: 'pending', attempts: 0, lastError: null, nextAttemptAt: new Date() },
            });
            await prisma.serviceProvider.update({
                where: { id: provider.id },
                data: { hikSyncStatus: 'pending', hikSyncError: null },
            });

            return res.json({ success: true });
        } catch (error: any) {
            return res.status(500).json({ error: error.message || 'Erro ao reprocessar sincronização' });
        }
    }
}
