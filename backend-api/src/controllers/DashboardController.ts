import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { HikCentralService } from '../services/HikCentralService';
import { EntityMappingService } from '../services/EntityMappingService';
import { DeviceStatusService } from '../services/DeviceStatusService';
import { prisma } from '../index';

export class DashboardController extends BaseController {
    public getStats = async (req: Request, res: Response) => {
        try {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfYesterday = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);

            // Resolver departamentos via EntityMappings (data-driven) com fallback
            const [residentCodes, prestadoresCodes, staffCodes] = await Promise.all([
                EntityMappingService.resolveOrgCodesWithFallback('/painel/residents'),
                EntityMappingService.resolveOrgCodesWithFallback('/painel/service-providers'),
                EntityMappingService.resolveOrgCodesWithFallback('/painel/staff'),
            ]);

            // Contar do banco local (sincronizado em tempo real pelos endpoints).
            // "Moradores" = quem efetivamente reside (is_resident); proprietário
            // não-residente conta só em totalOwners. Null = true (cadastros antigos),
            // por isso os filtros aceitam explicitamente true OU null.
            const residesFilter = { OR: [{ is_resident: true }, { is_resident: null }] };
            const ownerFilter = { OR: [{ is_owner: true }, { is_owner: null }] };
            const [totalResidents, totalOwners, ownersResiding, totalProviders, totalStaff] = await Promise.all([
                prisma.person.count({ where: { orgIndexCode: { in: residentCodes }, ...residesFilter } }),
                prisma.person.count({ where: { orgIndexCode: { in: residentCodes }, ...ownerFilter } }),
                prisma.person.count({ where: { orgIndexCode: { in: residentCodes }, AND: [residesFilter, ownerFilter] } }),
                prisma.person.count({ where: { orgIndexCode: { in: prestadoresCodes } } }),
                prisma.person.count({ where: { orgIndexCode: { in: staffCodes } } }),
            ]);

            console.log(`[Dashboard] Mappings: residents=${residentCodes.join(',')}, providers=${prestadoresCodes.join(',')}, staff=${staffCodes.join(',')}`);
            console.log(`[Dashboard] Local DB | Moradores:${totalResidents} Prestadores:${totalProviders} Staff:${totalStaff}`);

            const [totalVisitors, todayAccess, totalAccessEvents, yesterdayAccess] = await Promise.all([
                prisma.visitor.count(),
                prisma.accessEvent.count({ where: { occurredAt: { gte: startOfDay } } }),
                prisma.accessEvent.count(),
                prisma.accessEvent.count({ where: { occurredAt: { gte: startOfYesterday, lt: startOfDay } } }),
            ]);
            // Comparativo vs ontem no mesmo horário (janela equivalente do dia anterior)
            const yesterdaySameTime = await prisma.accessEvent.count({
                where: {
                    occurredAt: {
                        gte: startOfYesterday,
                        lt: new Date(startOfYesterday.getTime() + (now.getTime() - startOfDay.getTime())),
                    },
                },
            });
            const accessDeltaPct = yesterdaySameTime > 0
                ? Math.round(((todayAccess - yesterdaySameTime) / yesterdaySameTime) * 100)
                : null;

            const activeVisits = await prisma.visitor.count({
                where: { visitStartTime: { lte: now }, visitEndTime: { gte: now } }
            });

            // Presença no interior: último evento de acesso autorizado por pessoa hoje
            const todayAccessEvents = await prisma.accessEvent.findMany({
                where: {
                    occurredAt: { gte: startOfDay },
                    status: 'authorized',
                    personId: { not: null },
                },
                select: { personId: true, personType: true, eventType: true, occurredAt: true, unit: true },
                orderBy: { occurredAt: 'desc' },
            });

            // Para cada personId, o primeiro resultado (mais recente) é o estado atual
            const lastEventByPerson = new Map<string, { personType: string; eventType: string | null; unit: string | null }>();
            for (const ev of todayAccessEvents) {
                if (ev.personId && !lastEventByPerson.has(ev.personId)) {
                    lastEventByPerson.set(ev.personId, { personType: ev.personType, eventType: ev.eventType, unit: ev.unit });
                }
            }
            const insideEvents = [...lastEventByPerson.values()].filter(e => e.eventType !== 'EXIT');
            const insideResidents = insideEvents.filter(e => e.personType === 'resident').length;
            const insideProviders = insideEvents.filter(e => ['provider_condo', 'provider_resident'].includes(e.personType)).length;
            const insideStaff = insideEvents.filter(e => e.personType === 'staff').length;
            const insideVisitors = activeVisits;
            const occupiedUnits = new Set(insideEvents.map(e => e.unit).filter(Boolean)).size;
            const totalUnits = await prisma.unit.count().catch(() => 0);

            // Acessos por hora hoje (todos os eventos autorizados)
            const allTodayEvents = await prisma.accessEvent.findMany({
                where: { occurredAt: { gte: startOfDay }, status: 'authorized' },
                select: { occurredAt: true },
            });
            const hourCounts = new Array(24).fill(0);
            for (const ev of allTodayEvents) {
                hourCounts[ev.occurredAt.getHours()]++;
            }
            const hourlyAccess = hourCounts.map((count, hour) => ({ hour, count }));

            // Status de dispositivos: locais (videoporteiros + MG3000) + HikCentral (se configurado)
            let onlineDevices = 0;
            let offlineDevices = 0;
            try {
                const devices = await DeviceStatusService.getAll();
                onlineDevices = devices.filter((d) => d.status === 'online').length;
                offlineDevices = devices.filter((d) => d.status === 'offline').length;
            } catch (err) {
                console.error('Error fetching devices for stats:', err);
            }

            const pendingDeliveries = await prisma.delivery.count({ where: { status: 'awaiting' } });

            return this.success(res, {
                totalResidents,
                totalOwners,
                ownersResiding,
                totalVisitors,
                activeVisits,
                completedVisits: totalVisitors - activeVisits,
                totalProviders,
                totalStaff,
                todayAccess,
                yesterdayAccess,
                accessDeltaPct,
                totalAccessEvents,
                onlineDevices,
                offlineDevices,
                totalDevices: onlineDevices + offlineDevices,
                insideResidents,
                insideVisitors,
                insideProviders,
                insideStaff,
                occupiedUnits,
                totalUnits,
                pendingDeliveries,
                hourlyAccess,
            });
        } catch (error: any) {
            console.error('[DashboardController] Error:', error);
            return this.error(res, error.message);
        }
    };

    /** Alertas recentes: passback pendente + acessos negados/alarmes das últimas 24h. */
    public getAlerts = async (req: Request, res: Response) => {
        try {
            const limit = Math.min(Number(req.query.limit) || 10, 50);
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const [passbackAlerts, deniedEvents] = await Promise.all([
                prisma.guaritaPassbackAlert.findMany({
                    where: { resolved: false },
                    orderBy: { occurredAt: 'desc' },
                    take: limit,
                }),
                prisma.accessEvent.findMany({
                    where: {
                        occurredAt: { gte: since },
                        OR: [{ status: 'denied' }, { category: 'alarm' }],
                    },
                    orderBy: { occurredAt: 'desc' },
                    take: limit,
                }),
            ]);

            const alerts = [
                ...passbackAlerts.map(a => ({
                    id: `passback-${a.id}`,
                    kind: 'passback' as const,
                    title: 'Anti-passback',
                    description: `${a.personName}${a.unit ? ` • ${a.unit}` : ''}`,
                    deviceName: a.deviceName,
                    photoUrl: a.photoUrl,
                    occurredAt: a.occurredAt,
                })),
                ...deniedEvents.map(e => ({
                    id: `event-${e.id}`,
                    kind: (e.category === 'alarm' ? 'alarm' : 'denied') as 'alarm' | 'denied',
                    title: e.category === 'alarm' ? 'Alarme' : 'Acesso negado',
                    description: `${e.personName}${e.unit ? ` • ${e.unit}` : ''}${e.notes ? ` • ${e.notes}` : ''}`,
                    deviceName: e.deviceName,
                    photoUrl: e.photoUrl,
                    occurredAt: e.occurredAt,
                })),
            ]
                .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
                .slice(0, limit);

            return this.success(res, alerts);
        } catch (error: any) {
            console.error('[DashboardController] Alerts error:', error);
            return this.error(res, error.message);
        }
    };
}
