import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { HikCentralService } from '../services/HikCentralService';
import { EntityMappingService } from '../services/EntityMappingService';
import { prisma } from '../index';

export class DashboardController extends BaseController {
    /**
     * Pessoas presentes agora: para cada personId com evento autorizado hoje,
     * pega o evento mais recente e mantém só quem NÃO saiu (eventType !== 'EXIT').
     * Usado tanto pelas contagens do getStats quanto pelas listas dos cards —
     * os dois lados precisam usar exatamente o mesmo critério.
     */
    private async getInsideEvents(startOfDay: Date) {
        const todayAccessEvents = await prisma.accessEvent.findMany({
            where: {
                occurredAt: { gte: startOfDay },
                status: 'authorized',
                personId: { not: null },
            },
            select: {
                personId: true, personType: true, eventType: true,
                occurredAt: true, unit: true, personName: true, deviceName: true,
            },
            orderBy: { occurredAt: 'desc' },
        });
        const lastEventByPerson = new Map<string, (typeof todayAccessEvents)[number]>();
        for (const ev of todayAccessEvents) {
            if (ev.personId && !lastEventByPerson.has(ev.personId)) {
                lastEventByPerson.set(ev.personId, ev);
            }
        }
        return [...lastEventByPerson.values()].filter(e => e.eventType !== 'EXIT');
    }

    private startOfToday() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    /** Lista de acessos de hoje — mesmo critério do contador todayAccess (qualquer status). */
    public getTodayAccesses = async (req: Request, res: Response) => {
        try {
            const events = await prisma.accessEvent.findMany({
                where: { occurredAt: { gte: this.startOfToday() } },
                select: {
                    id: true, personName: true, personType: true, eventType: true,
                    deviceName: true, unit: true, status: true, occurredAt: true, photoUrl: true,
                },
                orderBy: { occurredAt: 'desc' },
                take: 500,
            });
            return this.success(res, { total: events.length, list: events });
        } catch (error: any) {
            console.error('[DashboardController] TodayAccesses error:', error);
            return this.error(res, error.message);
        }
    };

    /** Lista de presentes por tipo — mesmo critério dos contadores insideResidents/insideProviders/insideStaff. */
    public getPresentPeople = async (req: Request, res: Response) => {
        try {
            const type = String(req.query.type || 'resident');
            const typeFilters: Record<string, string[]> = {
                resident: ['resident'],
                provider: ['provider_condo', 'provider_resident'],
                staff: ['staff'],
            };
            const personTypes = typeFilters[type];
            if (!personTypes) return this.badRequest(res, `Tipo inválido: ${type}`);

            const insideEvents = await this.getInsideEvents(this.startOfToday());
            const list = insideEvents
                .filter(e => personTypes.includes(e.personType))
                .map(e => ({
                    personId: e.personId,
                    personName: e.personName,
                    personType: e.personType,
                    unit: e.unit,
                    deviceName: e.deviceName,
                    enteredAt: e.occurredAt,
                }));
            return this.success(res, { total: list.length, list });
        } catch (error: any) {
            console.error('[DashboardController] PresentPeople error:', error);
            return this.error(res, error.message);
        }
    };

    /** Lista de visitantes presentes — mesmo critério do contador insideVisitors (janela da visita contém agora). */
    public getPresentVisitors = async (req: Request, res: Response) => {
        try {
            const now = new Date();
            const visitors = await prisma.visitor.findMany({
                where: { visitStartTime: { lte: now }, visitEndTime: { gte: now } },
                select: {
                    id: true, name: true, surname: true, full_name: true, document: true,
                    phone: true, purpose: true, status: true,
                    visiting_resident: true, visiting_unit: true, visiting_block: true, tower: true,
                    visitStartTime: true, visitEndTime: true,
                },
                orderBy: { visitStartTime: 'desc' },
            });
            const list = visitors.map(v => ({
                id: v.id,
                name: v.full_name || [v.name, v.surname].filter(Boolean).join(' '),
                document: v.document,
                phone: v.phone,
                purpose: v.purpose,
                status: v.status,
                host: v.visiting_resident,
                unit: [v.tower, v.visiting_block, v.visiting_unit].filter(Boolean).join(' / '),
                visitStartTime: v.visitStartTime,
                visitEndTime: v.visitEndTime,
            }));
            return this.success(res, { total: list.length, list });
        } catch (error: any) {
            console.error('[DashboardController] PresentVisitors error:', error);
            return this.error(res, error.message);
        }
    };

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

            // Contar do banco local (sincronizado em tempo real pelos endpoints)
            const [totalResidents, totalProviders, totalStaff] = await Promise.all([
                prisma.person.count({ where: { orgIndexCode: { in: residentCodes } } }),
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
            const insideEvents = await this.getInsideEvents(startOfDay);
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

            // Fetch device status from HikCentral
            let onlineDevices = 0;
            let offlineDevices = 0;
            try {
                const deviceResult = await HikCentralService.getAcsDeviceList(1, 100);
                const devices = deviceResult?.data?.list || [];
                onlineDevices = devices.filter((d: any) => d.status === 1).length;
                offlineDevices = devices.filter((d: any) => d.status === 0).length;
            } catch (err) {
                console.error('Error fetching devices for stats:', err);
            }

            const pendingDeliveries = await prisma.delivery.count({ where: { status: 'awaiting' } });

            return this.success(res, {
                totalResidents,
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
