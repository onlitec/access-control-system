import { Request, Response } from 'express';
import { prisma } from '../database';
import { EntityMappingService } from '../services/EntityMappingService';
import { HIK_ORG_NAMES, resolveRoleFromOrg } from '../config/hik-constants';

export class StaffController {
    async list(req: Request, res: Response) {
        try {
            const { search = '' } = req.query as any;
            const staffOrgCodes = await EntityMappingService.resolveOrgCodesWithFallback('/painel/staff');


            const staffLocal = await prisma.person.findMany({
                where: {
                    orgIndexCode: { in: staffOrgCodes },
                    OR: search ? [
                        { firstName: { contains: search, mode: 'insensitive' } },
                        { lastName: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                    ] : undefined
                },
                orderBy: { createdAt: 'desc' }
            });

            res.json({
                success: true,
                data: staffLocal.map(r => ({
                    id: r.id,
                    full_name: `${r.firstName} ${r.lastName}`.trim(),
                    phone: r.phone,
                    email: r.email,
                    department: HIK_ORG_NAMES[r.orgIndexCode] || 'DESCONHECIDO',
                    role: resolveRoleFromOrg(r.orgIndexCode),
                    hikPersonId: r.hikPersonId,
                    photo_url: r.photoUrl || (r.hikPersonId ? `/api/hikcentral/person-photo/${r.hikPersonId}` : null),
                    updatedAt: r.updatedAt
                }))
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async create(req: Request, res: Response) {
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
            prismaData.orgIndexCode = body.orgIndexCode || '4';

            // Standalone: cadastro 100% local, sem sistema externo
            prismaData.hikPersonId = body.hikcentral_person_id || null;
            const person = await prisma.person.create({ data: prismaData });

            res.json({
                success: true,
                id: person.id,
                full_name: `${person.firstName} ${person.lastName}`.trim(),
                hikcentral_person_id: person.hikPersonId,
                data: person
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}
