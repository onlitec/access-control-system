import { Request, Response } from 'express';
import { prisma } from '../database';
import { HikCentralService } from '../services/HikCentralService';
import { EntityMappingService } from '../services/EntityMappingService';
import { HIK_ORG_NAMES, resolveRoleFromOrg } from '../config/hik-constants';

export class StaffController {
    async list(req: Request, res: Response) {
        try {
            const { search = '' } = req.query as any;
            const staffOrgCodes = await EntityMappingService.resolveOrgCodesWithFallback('/painel/staff');
            console.log(`[HikCentral] STAFF orgCodes resolvidos: ${staffOrgCodes.join(',')}`);

            try {
                const hikStaffPromise = HikCentralService.getPersonList({
                    pageNo: 1,
                    pageSize: 500,
                });
                const hikStaffTimeout = new Promise<null>((_, reject) =>
                    setTimeout(() => reject(new Error('HikCentral timeout')), 10000)
                );
                const hikResult = await Promise.race([hikStaffPromise, hikStaffTimeout]) as any;
                const hikPersons = hikResult?.data?.list || [];

                if (hikPersons.length > 0) {
                    const allPersonsStaff = hikPersons.map((p: any) => {
                        const orgCode = String(p.orgIndexCode || '');
                        const role = resolveRoleFromOrg(orgCode);
                        const orgName = HIK_ORG_NAMES[orgCode] || p.orgName || 'DESCONHECIDO';
                        return {
                            id: p.personId || p.indexCode || `staff-${Math.random().toString(36).substr(2, 9)}`,
                            firstName: p.personGivenName || p.personName || '',
                            lastName: p.personFamilyName || '',
                            phone: p.phoneNo || p.phone || null,
                            email: p.email || null,
                            orgIndexCode: orgCode,
                            hikPersonId: p.personId || p.indexCode || null,
                            orgName,
                            role,
                            personPhoto: p.personPhoto?.picUri || p.personPhoto?.uri || null,
                            createdAt: p.createTime || new Date().toISOString(),
                            updatedAt: p.updateTime || new Date().toISOString(),
                        };
                    });

                    const staff = allPersonsStaff.filter((r: any) => staffOrgCodes.includes(r.orgIndexCode));
                    let filtered = staff;
                    if (search) {
                        const searchLower = (search as string).toLowerCase();
                        filtered = staff.filter((r: any) =>
                            (r.firstName + ' ' + r.lastName).toLowerCase().includes(searchLower) ||
                            r.phone?.toLowerCase().includes(searchLower) ||
                            r.email?.toLowerCase().includes(searchLower)
                        );
                    }

                    const localPhotos: Record<string, string | null> = {};
                    for (const r of staff) {
                        try {
                            const existing = await prisma.person.findFirst({ where: { hikPersonId: r.hikPersonId } });
                            const upserted = await prisma.person.upsert({
                                where: { hikPersonId: r.hikPersonId || `temp-staff-${r.id}` },
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
                            localPhotos[r.hikPersonId] = existing?.photoUrl || upserted.photoUrl || null;
                        } catch (e) { }
                    }

                    return res.json({
                        success: true,
                        data: filtered.map((p: any) => ({
                            id: p.id || p.indexCode,
                            full_name: `${p.firstName} ${p.lastName}`.trim() || '-',
                            first_name: p.firstName,
                            last_name: p.lastName,
                            phone: p.phone,
                            email: p.email,
                            department: p.orgName,
                            role: p.role,
                            photo_url: localPhotos[p.hikPersonId] || (p.hikPersonId ? `/api/hikcentral/person-photo/${p.hikPersonId}${p.personPhoto ? `?picUri=${encodeURIComponent(p.personPhoto)}` : ''}` : null),
                            hikPersonId: p.hikPersonId || null,
                            created_at: p.createdAt || new Date().toISOString()
                        }))
                    });
                }
            } catch (hikError: any) {
                console.error('Staff HikCentral Error:', hikError.message);
            }

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

            let hikPersonId = body.hikcentral_person_id || null;

            if (!hikPersonId) {
                const hikResponse: any = await HikCentralService.addPerson({
                    personGivenName: prismaData.firstName,
                    personFamilyName: prismaData.lastName,
                    orgIndexCode: prismaData.orgIndexCode,
                    phoneNo: prismaData.phone || undefined,
                    email: prismaData.email || undefined,
                });
                hikPersonId = hikResponse?.data?.personId;
            }

            prismaData.hikPersonId = hikPersonId;
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
