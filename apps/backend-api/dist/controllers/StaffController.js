"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffController = void 0;
const database_1 = require("../database");
const EntityMappingService_1 = require("../services/EntityMappingService");
const hik_constants_1 = require("../config/hik-constants");
class StaffController {
    async list(req, res) {
        try {
            const { search = '' } = req.query;
            const staffOrgCodes = await EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/staff');
            const staffLocal = await database_1.prisma.person.findMany({
                where: {
                    orgIndexCode: { in: staffOrgCodes },
                    OR: search ? [
                        { firstName: { contains: search, mode: 'insensitive' } },
                        { lastName: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                    ] : undefined
                },
                orderBy: { createdAt: 'desc' },
                include: { jobFunction: { select: { id: true, name: true } } },
            });
            res.json({
                success: true,
                data: staffLocal.map(r => ({
                    id: r.id,
                    full_name: `${r.firstName} ${r.lastName}`.trim(),
                    phone: r.phone,
                    email: r.email,
                    department: hik_constants_1.HIK_ORG_NAMES[r.orgIndexCode] || 'DESCONHECIDO',
                    role: (0, hik_constants_1.resolveRoleFromOrg)(r.orgIndexCode),
                    hikPersonId: r.hikPersonId,
                    photo_url: r.photoUrl || (r.hikPersonId ? `/api/hikcentral/person-photo/${r.hikPersonId}` : null),
                    job_function_id: r.jobFunctionId,
                    job_function_name: r.jobFunction?.name ?? null,
                    updatedAt: r.updatedAt
                }))
            });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
    async create(req, res) {
        try {
            const body = { ...req.body };
            const prismaData = {};
            if (body.full_name) {
                const parts = body.full_name.trim().split(' ');
                prismaData.firstName = parts[0] || '';
                prismaData.lastName = parts.slice(1).join(' ') || '';
            }
            prismaData.phone = body.phone || null;
            prismaData.email = body.email || null;
            prismaData.orgIndexCode = body.orgIndexCode || '4';
            // Cargo/função — local-only, não sincroniza com o HikCentral (ver JobFunction)
            prismaData.jobFunctionId = body.job_function_id || body.jobFunctionId || null;
            // Standalone: cadastro 100% local, sem sistema externo
            prismaData.hikPersonId = body.hikcentral_person_id || null;
            const person = await database_1.prisma.person.create({ data: prismaData });
            res.json({
                success: true,
                id: person.id,
                full_name: `${person.firstName} ${person.lastName}`.trim(),
                hikcentral_person_id: person.hikPersonId,
                data: person
            });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}
exports.StaffController = StaffController;
