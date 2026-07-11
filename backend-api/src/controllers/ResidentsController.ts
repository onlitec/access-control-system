import { Request, Response } from 'express';
import { prisma } from '../database';
import { HIK_ORG_NAMES } from '../config/hik-constants';

export class ResidentsController {
    async list(req: Request, res: Response) {
        try {
            const { page = 1, limit = 20, search = '' } = req.query as any;
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);

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
                include: {
                    department: { select: { id: true, name: true, color: true } },
                    unit: {  // ✓ NEW: Include unit relation after unitId migration
                        select: {
                            id: true,
                            number: true,
                            floor: true,
                            tower: { select: { id: true, name: true } },
                            block: { select: { id: true, name: true } }
                        }
                    }
                }
            });
            const count = await prisma.person.count({ where });
            const localMapped = data.map((p: any) => ({
                id: p.id,
                full_name: `${p.firstName} ${p.lastName}`.trim() || '-',
                cpf: p.cpf || '',
                rg: p.rg || '',
                phone: p.phone || null,
                email: p.email || null,
                // ✓ FIXED: Use unitId FK if available (new path), fallback to string fields (migration period)
                unit_number: p.unit?.number || p.unit_number || null,
                block: p.unit?.block?.name || p.block || null,
                tower: p.unit?.tower?.name || p.tower || null,
                // ✓ NEW: Expose organization separately (not location!)
                org_index_code: p.orgIndexCode || null,
                org_name: HIK_ORG_NAMES[p.orgIndexCode] || null,
                photo_url: p.photoUrl || (p.hikPersonId ? `/api/hikcentral/person-photo/${p.hikPersonId}` : null),
                is_owner: p.is_owner !== null ? p.is_owner : true,
                is_resident: p.is_resident !== null ? p.is_resident : true,
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
        // Standalone: não há sistema externo para sincronizar — dados são locais
        res.json({ success: true, count: 0, info: 'Sistema standalone: dados 100% locais, nada a sincronizar' });
    }
}
