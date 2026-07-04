import { Request, Response } from 'express';
import { prisma } from '../database';
import { HikCentralService } from '../services/HikCentralService';
import { EntityMappingService } from '../services/EntityMappingService';
import { HikCentralSyncService } from '../services/HikCentralSyncService';
import { HIK_ORG_NAMES, resolveRoleFromOrg } from '../config/hik-constants';

const isHikCentralMode = () => (process.env.PROVIDER_TYPE ?? 'local').toLowerCase() === 'hikcentral';

export class ResidentsController {
    async list(req: Request, res: Response) {
        try {
            const { page = 1, limit = 20, search = '' } = req.query as any;
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);

            const residentOrgCodes = await EntityMappingService.resolveOrgCodesWithFallback('/painel/residents');

            if (isHikCentralMode()) try {
                const hikPromise = HikCentralService.getPersonList({
                    pageNo: 1,
                    pageSize: 500,
                });
                const timeoutPromise = new Promise<null>((_, reject) =>
                    setTimeout(() => reject(new Error('HikCentral timeout')), 10000)
                );
                const hikResult = await Promise.race([hikPromise, timeoutPromise]) as any;
                const hikPersons = hikResult?.data?.list || [];

                if (hikPersons.length > 0) {
                    const allPersons = hikPersons.map((p: any) => {
                        const orgCode = String(p.orgIndexCode || '');
                        const role = resolveRoleFromOrg(orgCode);
                        const orgName = HIK_ORG_NAMES[orgCode] || p.orgName || 'DESCONHECIDO';
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
                            personPhoto: p.personPhoto?.picUri || p.personPhoto?.uri || null,
                            createdAt: p.createTime || new Date().toISOString(),
                            updatedAt: p.updateTime || new Date().toISOString(),
                        };
                    });

                    const residents = allPersons.filter((r: any) => residentOrgCodes.includes(r.orgIndexCode));
                    console.log(`[HikCentral] Total recebido: ${allPersons.length} | Filtrado MORADORES (${residentOrgCodes}): ${residents.length}`);

                    let filtered = residents;
                    if (search) {
                        const searchLower = (search as string).toLowerCase();
                        filtered = residents.filter((r: any) =>
                            (r.firstName + ' ' + r.lastName).toLowerCase().includes(searchLower) ||
                            r.phone?.toLowerCase().includes(searchLower) ||
                            r.email?.toLowerCase().includes(searchLower)
                        );
                    }

                    const localPhotos: Record<string, string | null> = {};
                    for (const r of residents) {
                        try {
                            const existing = await prisma.person.findFirst({ where: { hikPersonId: r.hikPersonId } });
                            const upserted = await prisma.person.upsert({
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
                            localPhotos[r.hikPersonId] = existing?.photoUrl || upserted.photoUrl || null;
                        } catch (e) { }
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
                            photo_url: localPhotos[r.hikPersonId] || (r.hikPersonId ? `/api/hikcentral/person-photo/${r.hikPersonId}${r.personPhoto ? `?picUri=${encodeURIComponent(r.personPhoto)}` : ''}` : null),
                            is_owner: true,
                            hikcentral_person_id: r.hikPersonId || null,
                            notes: `HikCentral | Depto: ${r.orgName} | Perfil: ${r.role}`,
                            created_by: null,
                            created_at: r.createdAt,
                            updated_at: r.updatedAt,
                        })),
                        count: filtered.length,
                        source: 'hikcentral',
                    });
                }
            } catch (hikError: any) {
                console.log('Fallback to local DB for residents:', hikError.message);
            }

            const skip = (pageNum - 1) * limitNum;
            const where = search ? {
                OR: [
                    { firstName: { contains: search as string, mode: 'insensitive' as const } },
                    { lastName: { contains: search as string, mode: 'insensitive' as const } },
                ]
            } : {};

            const data = await prisma.person.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
                include: { department: { select: { id: true, name: true, color: true } } }
            });
            const count = await prisma.person.count({ where });
            const localMapped = data.map((p: any) => ({
                id: p.id,
                full_name: `${p.firstName} ${p.lastName}`.trim() || '-',
                cpf: p.cpf || '',
                rg: p.rg || '',
                phone: p.phone || null,
                email: p.email || null,
                unit_number: p.unit_number || p.orgIndexCode || '',
                block: p.block || null,
                tower: p.tower || HIK_ORG_NAMES[p.orgIndexCode] || null,
                photo_url: p.photoUrl || (p.hikPersonId ? `/api/hikcentral/person-photo/${p.hikPersonId}` : null),
                is_owner: p.is_owner !== null ? p.is_owner : true,
                hikcentral_person_id: p.hikPersonId || null,
                notes: p.notes || null,
                parkingSpaces: p.parkingSpaces || null,
                vehiclePlate: p.vehiclePlate || null,
                created_at: p.createdAt,
                updated_at: p.updatedAt,
                department: p.department || null,
            }));
            res.json({ data: localMapped, count, source: 'local' });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async sync(req: Request, res: Response) {
        try {
            const count = await HikCentralSyncService.syncResidents();
            res.json({ success: true, count });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}
