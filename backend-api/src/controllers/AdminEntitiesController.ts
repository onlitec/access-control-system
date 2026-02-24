import { Request, Response } from 'express';
import { HikCentralService } from '../services/HikCentralService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Controller para endpoints de administração de entidades HikCentral
 * Usado na página /admin/settings para popular tree views e selects
 */
export class AdminEntitiesController {
    
    /**
     * GET /api/admin/entities/organizations
     * Lista departamentos/organizações do HikCentral (tree view)
     */
    public getOrganizations = async (req: Request, res: Response) => {
        try {
            const result = await HikCentralService.getOrgListCached(1, 500);
            const list = result?.data?.list || [];
            
            // Monta estrutura hierárquica
            const orgs = list.map((org: any) => ({
                id: org.orgIndexCode,
                name: org.orgName,
                parentOrgIndexCode: org.parentOrgIndexCode,
                orgCode: org.orgCode,
                description: org.description || '',
            }));
            
            res.json({ success: true, data: orgs, total: orgs.length });
        } catch (error: any) {
            console.error('[AdminEntities] getOrganizations error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * GET /api/admin/entities/areas
     * Lista áreas físicas (regions) do HikCentral (tree view)
     */
    public getAreas = async (req: Request, res: Response) => {
        try {
            const result = await HikCentralService.getRegionsList(1, 500);
            const list = result?.data?.list || [];
            
            const areas = list.map((area: any) => ({
                id: area.indexCode,
                name: area.name,
                parentIndexCode: area.parentIndexCode,
                description: area.description || '',
            }));
            
            res.json({ success: true, data: areas, total: areas.length });
        } catch (error: any) {
            console.error('[AdminEntities] getAreas error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * GET /api/admin/entities/access-levels
     * Lista níveis de acesso / privilege groups
     */
    public getAccessLevels = async (req: Request, res: Response) => {
        try {
            const type = parseInt(req.query.type as string) || 1; // 1=geral, 2=visitantes
            const result = await HikCentralService.getPrivilegeGroups(type, 1, 500);
            const list = result?.data?.list || [];
            
            const levels = list.map((level: any) => ({
                id: level.privilegeGroupId || level.id,
                name: level.privilegeGroupName || level.name,
                type: level.type,
                description: level.description || '',
            }));
            
            res.json({ success: true, data: levels, total: levels.length });
        } catch (error: any) {
            console.error('[AdminEntities] getAccessLevels error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * GET /api/admin/entities/custom-fields
     * Lista campos customizados (cargos, posições, etc)
     */
    public getCustomFields = async (req: Request, res: Response) => {
        try {
            const result = await HikCentralService.getCustomFieldsCached();
            const list = result?.data?.list || [];
            
            const fields = list.map((field: any) => ({
                id: field.id || field.fieldId,
                name: field.customFieldName || field.name,
                type: field.fieldType,
                required: field.required || false,
            }));
            
            res.json({ success: true, data: fields, total: fields.length });
        } catch (error: any) {
            console.error('[AdminEntities] getCustomFields error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * GET /api/admin/entities/floors
     * Lista pisos/andares
     */
    public getFloors = async (req: Request, res: Response) => {
        try {
            const result = await HikCentralService.getFloorsList(1, 500);
            const list = result?.data?.list || [];
            
            const floors = list.map((floor: any) => ({
                id: floor.floorIndexCode || floor.id,
                name: floor.floorName || floor.name,
                description: floor.description || '',
            }));
            
            res.json({ success: true, data: floors, total: floors.length });
        } catch (error: any) {
            console.error('[AdminEntities] getFloors error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * GET /api/admin/entities/visitor-groups
     * Lista grupos de visitantes
     */
    public getVisitorGroups = async (req: Request, res: Response) => {
        try {
            const result = await HikCentralService.getVisitorGroups(1, 500);
            const list = result?.data?.list || [];
            
            const groups = list.map((group: any) => ({
                id: group.visitorGroupId || group.id,
                name: group.visitorGroupName || group.name,
                description: group.description || '',
            }));
            
            res.json({ success: true, data: groups, total: groups.length });
        } catch (error: any) {
            console.error('[AdminEntities] getVisitorGroups error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * POST /api/admin/cache/refresh
     * Limpa cache de entidades
     */
    public refreshCache = async (req: Request, res: Response) => {
        try {
            const { entityType } = req.body;
            HikCentralService.clearCache(entityType);
            res.json({ success: true, message: `Cache cleared: ${entityType || 'all'}` });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    };
}
