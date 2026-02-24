import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Controller para CRUD de EntityMappings
 * Mapeia entidades HikCentral às páginas do painel
 */
export class EntityMappingsController {

    /**
     * GET /api/admin/mappings
     * Lista todos os mapeamentos ou filtra por pageRoute
     */
    public list = async (req: Request, res: Response) => {
        try {
            const { pageRoute, entityType, isActive } = req.query;
            
            const where: any = {};
            if (pageRoute) where.pageRoute = pageRoute;
            if (entityType) where.entityType = entityType;
            if (isActive !== undefined) where.isActive = isActive === 'true';
            
            const mappings = await prisma.entityMapping.findMany({
                where,
                orderBy: [{ pageRoute: 'asc' }, { priority: 'asc' }],
            });
            
            res.json({ success: true, data: mappings, total: mappings.length });
        } catch (error: any) {
            console.error('[EntityMappings] list error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * GET /api/admin/mappings/:id
     * Busca um mapeamento específico
     */
    public get = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            
            const mapping = await prisma.entityMapping.findUnique({
                where: { id },
            });
            
            if (!mapping) {
                return res.status(404).json({ success: false, error: 'Mapping not found' });
            }
            
            res.json({ success: true, data: mapping });
        } catch (error: any) {
            console.error('[EntityMappings] get error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * POST /api/admin/mappings
     * Cria um novo mapeamento
     */
    public create = async (req: Request, res: Response) => {
        try {
            const { pageRoute, entityType, hikEntityId, hikEntityName, priority, filterConfig, createdBy } = req.body;
            
            if (!pageRoute || !entityType || !hikEntityId) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'pageRoute, entityType and hikEntityId are required' 
                });
            }
            
            // Verifica se já existe mapeamento idêntico
            const existing = await prisma.entityMapping.findFirst({
                where: { pageRoute, entityType, hikEntityId },
            });
            
            if (existing) {
                return res.status(409).json({ 
                    success: false, 
                    error: 'Mapping already exists for this page/entity combination',
                    data: existing 
                });
            }
            
            const mapping = await prisma.entityMapping.create({
                data: {
                    pageRoute,
                    entityType,
                    hikEntityId,
                    hikEntityName: hikEntityName || '',
                    priority: priority || 0,
                    filterConfig: filterConfig || null,
                    createdBy: createdBy || null,
                },
            });
            
            console.log(`[EntityMappings] Created: ${pageRoute} -> ${entityType}:${hikEntityId}`);
            res.status(201).json({ success: true, data: mapping });
        } catch (error: any) {
            console.error('[EntityMappings] create error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * PUT /api/admin/mappings/:id
     * Atualiza um mapeamento existente
     */
    public update = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { pageRoute, entityType, hikEntityId, hikEntityName, isActive, priority, filterConfig } = req.body;
            
            const mapping = await prisma.entityMapping.update({
                where: { id },
                data: {
                    ...(pageRoute && { pageRoute }),
                    ...(entityType && { entityType }),
                    ...(hikEntityId && { hikEntityId }),
                    ...(hikEntityName !== undefined && { hikEntityName }),
                    ...(isActive !== undefined && { isActive }),
                    ...(priority !== undefined && { priority }),
                    ...(filterConfig !== undefined && { filterConfig }),
                },
            });
            
            console.log(`[EntityMappings] Updated: ${id}`);
            res.json({ success: true, data: mapping });
        } catch (error: any) {
            console.error('[EntityMappings] update error:', error);
            if (error.code === 'P2025') {
                return res.status(404).json({ success: false, error: 'Mapping not found' });
            }
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * DELETE /api/admin/mappings/:id
     * Remove um mapeamento
     */
    public delete = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            
            await prisma.entityMapping.delete({
                where: { id },
            });
            
            console.log(`[EntityMappings] Deleted: ${id}`);
            res.json({ success: true, message: 'Mapping deleted' });
        } catch (error: any) {
            console.error('[EntityMappings] delete error:', error);
            if (error.code === 'P2025') {
                return res.status(404).json({ success: false, error: 'Mapping not found' });
            }
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * POST /api/admin/mappings/batch
     * Cria múltiplos mapeamentos de uma vez
     */
    public batchCreate = async (req: Request, res: Response) => {
        try {
            const { mappings } = req.body;
            
            if (!Array.isArray(mappings) || mappings.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'mappings array is required' 
                });
            }
            
            const results = await prisma.entityMapping.createMany({
                data: mappings.map((m: any) => ({
                    pageRoute: m.pageRoute,
                    entityType: m.entityType,
                    hikEntityId: m.hikEntityId,
                    hikEntityName: m.hikEntityName || '',
                    priority: m.priority || 0,
                    filterConfig: m.filterConfig || null,
                    createdBy: m.createdBy || null,
                })),
                skipDuplicates: true,
            });
            
            console.log(`[EntityMappings] Batch created: ${results.count} mappings`);
            res.status(201).json({ success: true, created: results.count });
        } catch (error: any) {
            console.error('[EntityMappings] batchCreate error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };

    /**
     * GET /api/admin/mappings/pages
     * Lista todas as páginas que têm mapeamentos
     */
    public listPages = async (req: Request, res: Response) => {
        try {
            const pages = await prisma.entityMapping.groupBy({
                by: ['pageRoute'],
                _count: { id: true },
                orderBy: { pageRoute: 'asc' },
            });
            
            res.json({ 
                success: true, 
                data: pages.map(p => ({ 
                    pageRoute: p.pageRoute, 
                    mappingCount: p._count.id 
                })) 
            });
        } catch (error: any) {
            console.error('[EntityMappings] listPages error:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    };
}
