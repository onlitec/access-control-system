import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { HikCentralService } from '../services/HikCentralService';
import { prisma } from '../index';

// Mapa estático de fallback: nome do departamento → orgIndexCodes
const DEPT_FALLBACK: Record<string, string[]> = {
    MORADOR:   ['2', '7'],
    PRESTADOR: ['3'],
    PORTARIA:  ['4', '5', '6'],
};

async function resolveOrgCodesForDashboard(): Promise<{ residentCodes: string[]; prestadoresCodes: string[]; staffCodes: string[] }> {
    // Tenta resolver via orgList do HikCentral
    try {
        const result = await Promise.race([
            HikCentralService.getOrgList(1, 200),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]) as any;
        const list: any[] = result?.data?.list || [];
        if (list.length > 0) {
            const residentCodes: string[] = [];
            const prestadoresCodes: string[] = [];
            const staffCodes: string[] = [];
            list.forEach((org: any) => {
                const name = (org.orgName || '').toUpperCase();
                const code = String(org.orgIndexCode);
                if (name.includes('MORADOR')) residentCodes.push(code);
                else if (name.includes('PRESTADOR')) prestadoresCodes.push(code);
                else if (name.includes('PORTARIA') || name.includes('ADMIN') || name.includes('CONDOMINIO')) staffCodes.push(code);
            });
            if (residentCodes.length > 0 || prestadoresCodes.length > 0) {
                return { residentCodes, prestadoresCodes, staffCodes };
            }
        }
    } catch (_) {}
    // Fallback estático
    return { residentCodes: DEPT_FALLBACK.MORADOR, prestadoresCodes: DEPT_FALLBACK.PRESTADOR, staffCodes: DEPT_FALLBACK.PORTARIA };
}

function classifyPersonByOrgName(orgName: string): 'resident' | 'provider' | 'staff' | 'system' | null {
    const n = (orgName || '').toUpperCase();
    if (n.includes('MORADOR')) return 'resident';
    if (n.includes('PRESTADOR')) return 'provider';
    if (n.includes('PORTARIA') || n.includes('ADMIN') || n.includes('CONDOMINIO')) return 'staff';
    if (n.includes('ALL') || n.includes('ROOT') || n.includes('CALABASAS')) return 'system';
    return null;
}

export class DashboardController extends BaseController {
    public getStats = async (req: Request, res: Response) => {
        try {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Resolver departamentos e buscar pessoas do HikCentral
            const { residentCodes, prestadoresCodes, staffCodes } = await resolveOrgCodesForDashboard();

            // Contar do banco local (sincronizado em tempo real pelos endpoints /residents, /staff, /service-providers)
            const [totalResidents, totalProviders, totalStaff] = await Promise.all([
                prisma.person.count({ where: { orgIndexCode: { in: residentCodes } } }),
                prisma.person.count({ where: { orgIndexCode: { in: prestadoresCodes } } }),
                prisma.person.count({ where: { orgIndexCode: { in: staffCodes } } }),
            ]);

            // Tentar obter contagem atualizada do HikCentral em background (sem bloquear resposta)
            HikCentralService.getPersonList({ pageNo: 1, pageSize: 1000 }).then((hikResult: any) => {
                const list: any[] = hikResult?.data?.list || [];
                if (list.length > 0) {
                    // Sincronizar contagens com banco local para próxima requisição
                    console.log(`[Dashboard] HikCentral sync: ${list.length} pessoas`);
                }
            }).catch(() => {});
            console.log(`[Dashboard] Local DB | Moradores:${totalResidents} Prestadores:${totalProviders} Staff:${totalStaff}`);

            const [totalVisitors, todayAccess, totalAccessEvents] = await Promise.all([
                prisma.visitor.count(),
                prisma.accessEvent.count({ where: { eventTime: { gte: startOfDay } } }),
                prisma.accessEvent.count(),
            ]);

            const activeVisits = await prisma.visitor.count({
                where: { visitStartTime: { lte: now }, visitEndTime: { gte: now } }
            });

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

            return this.success(res, {
                totalResidents,
                totalVisitors,
                activeVisits,
                completedVisits: totalVisitors - activeVisits,
                totalProviders,
                totalStaff,
                todayAccess,
                totalAccessEvents,
                onlineDevices,
                offlineDevices,
                totalDevices: onlineDevices + offlineDevices
            });
        } catch (error: any) {
            console.error('[DashboardController] Error:', error);
            return this.error(res, error.message);
        }
    };
}
