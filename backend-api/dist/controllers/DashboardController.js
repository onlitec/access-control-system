"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardController = void 0;
const BaseController_1 = require("./BaseController");
const HikCentralService_1 = require("../services/HikCentralService");
const EntityMappingService_1 = require("../services/EntityMappingService");
const index_1 = require("../index");
class DashboardController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        this.getStats = async (req, res) => {
            try {
                const now = new Date();
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const startOfYesterday = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);
                // Resolver departamentos via EntityMappings (data-driven) com fallback
                const [residentCodes, prestadoresCodes, staffCodes] = await Promise.all([
                    EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/residents'),
                    EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/service-providers'),
                    EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/staff'),
                ]);
                // Contar do banco local (sincronizado em tempo real pelos endpoints)
                const [totalResidents, totalProviders, totalStaff] = await Promise.all([
                    index_1.prisma.person.count({ where: { orgIndexCode: { in: residentCodes } } }),
                    index_1.prisma.person.count({ where: { orgIndexCode: { in: prestadoresCodes } } }),
                    index_1.prisma.person.count({ where: { orgIndexCode: { in: staffCodes } } }),
                ]);
                console.log(`[Dashboard] Mappings: residents=${residentCodes.join(',')}, providers=${prestadoresCodes.join(',')}, staff=${staffCodes.join(',')}`);
                console.log(`[Dashboard] Local DB | Moradores:${totalResidents} Prestadores:${totalProviders} Staff:${totalStaff}`);
                const [totalVisitors, todayAccess, totalAccessEvents, yesterdayAccess] = await Promise.all([
                    index_1.prisma.visitor.count(),
                    index_1.prisma.accessEvent.count({ where: { occurredAt: { gte: startOfDay } } }),
                    index_1.prisma.accessEvent.count(),
                    index_1.prisma.accessEvent.count({ where: { occurredAt: { gte: startOfYesterday, lt: startOfDay } } }),
                ]);
                // Comparativo vs ontem no mesmo horário (janela equivalente do dia anterior)
                const yesterdaySameTime = await index_1.prisma.accessEvent.count({
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
                const activeVisits = await index_1.prisma.visitor.count({
                    where: { visitStartTime: { lte: now }, visitEndTime: { gte: now } }
                });
                // Presença no interior: último evento de acesso autorizado por pessoa hoje
                const todayAccessEvents = await index_1.prisma.accessEvent.findMany({
                    where: {
                        occurredAt: { gte: startOfDay },
                        status: 'authorized',
                        personId: { not: null },
                    },
                    select: { personId: true, personType: true, eventType: true, occurredAt: true, unit: true },
                    orderBy: { occurredAt: 'desc' },
                });
                // Para cada personId, o primeiro resultado (mais recente) é o estado atual
                const lastEventByPerson = new Map();
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
                const totalUnits = await index_1.prisma.unit.count().catch(() => 0);
                // Acessos por hora hoje (todos os eventos autorizados)
                const allTodayEvents = await index_1.prisma.accessEvent.findMany({
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
                    const deviceResult = await HikCentralService_1.HikCentralService.getAcsDeviceList(1, 100);
                    const devices = deviceResult?.data?.list || [];
                    onlineDevices = devices.filter((d) => d.status === 1).length;
                    offlineDevices = devices.filter((d) => d.status === 0).length;
                }
                catch (err) {
                    console.error('Error fetching devices for stats:', err);
                }
                const pendingDeliveries = await index_1.prisma.delivery.count({ where: { status: 'awaiting' } });
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
            }
            catch (error) {
                console.error('[DashboardController] Error:', error);
                return this.error(res, error.message);
            }
        };
        /** Alertas recentes: passback pendente + acessos negados/alarmes das últimas 24h. */
        this.getAlerts = async (req, res) => {
            try {
                const limit = Math.min(Number(req.query.limit) || 10, 50);
                const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const [passbackAlerts, deniedEvents] = await Promise.all([
                    index_1.prisma.guaritaPassbackAlert.findMany({
                        where: { resolved: false },
                        orderBy: { occurredAt: 'desc' },
                        take: limit,
                    }),
                    index_1.prisma.accessEvent.findMany({
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
                        kind: 'passback',
                        title: 'Anti-passback',
                        description: `${a.personName}${a.unit ? ` • ${a.unit}` : ''}`,
                        deviceName: a.deviceName,
                        photoUrl: a.photoUrl,
                        occurredAt: a.occurredAt,
                    })),
                    ...deniedEvents.map(e => ({
                        id: `event-${e.id}`,
                        kind: (e.category === 'alarm' ? 'alarm' : 'denied'),
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
            }
            catch (error) {
                console.error('[DashboardController] Alerts error:', error);
                return this.error(res, error.message);
            }
        };
    }
}
exports.DashboardController = DashboardController;
