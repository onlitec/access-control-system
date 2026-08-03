"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobFunctionsController = void 0;
const database_1 = require("../database");
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
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
const parseJobFunctionPayload = (body, partial = false) => {
    const data = {};
    if (!partial || hasOwn(body, 'name')) {
        data.name = normalizeRequiredText(body.name, 'name');
    }
    if (!partial || hasOwn(body, 'description')) {
        data.description = normalizeOptionalText(body.description, 'description');
    }
    return data;
};
const serializeJobFunction = (item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    person_count: item._count?.persons ?? undefined,
    service_provider_count: item._count?.serviceProviders ?? undefined,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
});
class JobFunctionsController {
    async list(req, res) {
        try {
            const items = await database_1.prisma.jobFunction.findMany({
                orderBy: { name: 'asc' },
                include: { _count: { select: { persons: true, serviceProviders: true } } },
            });
            return res.json(items.map(serializeJobFunction));
        }
        catch (error) {
            return res.status(500).json({ error: error.message || 'Erro ao consultar funções' });
        }
    }
    async create(req, res) {
        try {
            const body = (req.body || {});
            const payload = parseJobFunctionPayload(body, false);
            const created = await database_1.prisma.jobFunction.create({
                data: { name: payload.name, description: payload.description ?? null },
            });
            return res.status(201).json(serializeJobFunction(created));
        }
        catch (error) {
            if (error?.code === 'P2002') {
                return res.status(409).json({ error: 'Já existe uma função com esse nome' });
            }
            return res.status(400).json({ error: error.message || 'Erro ao criar função' });
        }
    }
    async update(req, res) {
        try {
            const body = (req.body || {});
            const payload = parseJobFunctionPayload(body, true);
            if (Object.keys(payload).length === 0) {
                return res.status(400).json({ error: 'Nenhum campo para atualizar' });
            }
            const updateData = {};
            if (payload.name !== undefined)
                updateData.name = payload.name;
            if (payload.description !== undefined)
                updateData.description = payload.description;
            const updated = await database_1.prisma.jobFunction.update({
                where: { id: req.params.id },
                data: updateData,
            });
            return res.json(serializeJobFunction(updated));
        }
        catch (error) {
            if (error?.code === 'P2025') {
                return res.status(404).json({ error: 'Função não encontrada' });
            }
            if (error?.code === 'P2002') {
                return res.status(409).json({ error: 'Já existe uma função com esse nome' });
            }
            return res.status(400).json({ error: error.message || 'Erro ao atualizar função' });
        }
    }
    async delete(req, res) {
        try {
            const existing = await database_1.prisma.jobFunction.findUnique({
                where: { id: req.params.id },
                include: { _count: { select: { persons: true, serviceProviders: true } } },
            });
            if (!existing) {
                return res.status(404).json({ error: 'Função não encontrada' });
            }
            const inUse = existing._count.persons + existing._count.serviceProviders;
            if (inUse > 0) {
                return res.status(409).json({
                    error: `Não é possível excluir: ${inUse} cadastro(s) usam esta função`,
                });
            }
            await database_1.prisma.jobFunction.delete({ where: { id: req.params.id } });
            return res.status(204).send();
        }
        catch (error) {
            if (error?.code === 'P2025') {
                return res.status(404).json({ error: 'Função não encontrada' });
            }
            return res.status(500).json({ error: error.message || 'Erro ao remover função' });
        }
    }
}
exports.JobFunctionsController = JobFunctionsController;
