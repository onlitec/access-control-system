import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { HikCentralService } from '../services/HikCentralService';
import { EntityMappingService } from '../services/EntityMappingService';
import { prisma } from '../index';

export class DashboardController extends BaseController {
    public getStats = async (req: Request, res: Response) => {
        try {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
