"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityMappingsController = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * Controller para CRUD de EntityMappings
 * Mapeia entidades HikCentral às páginas do painel
 */
class EntityMappingsController {
    constructor() {
        /**
         * GET /api/admin/mappings
         * Lista todos os mapeamentos ou filtra por pageRoute
         */
        this.list = async (req, res) => {
            try {
                const { pageRoute, entityType, isActive } = req.query;
                const where = {};
                if (pageRoute)
                    where.pageRoute = pageRoute;
                if (entityType)
                    where.entityType = entityType;
                if (isActive !== undefined)
                    where.isActive = isActive === 'true';
                const mappings = await prisma.entityMapping.findMany({
                    where,
                    orderBy: [{ pageRoute: 'asc' }, { priority: 'asc' }],
                });
                res.json({ success: true, data: mappings, total: mappings.length });
            }
            catch (error) {
                console.error('[EntityMappings] list error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/admin/mappings/:id
         * Busca um mapeamento específico
         */
        this.get = async (req, res) => {
            try {
                const { id } = req.params;
                const mapping = await prisma.entityMapping.findUnique({
                    where: { id },
                });
                if (!mapping) {
                    return res.status(404).json({ success: false, error: 'Mapping not found' });
                }
                res.json({ success: true, data: mapping });
            }
            catch (error) {
                console.error('[EntityMappings] get error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * POST /api/admin/mappings
         * Cria um novo mapeamento
         */
        this.create = async (req, res) => {
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
            }
            catch (error) {
                console.error('[EntityMappings] create error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * PUT /api/admin/mappings/:id
         * Atualiza um mapeamento existente
         */
        this.update = async (req, res) => {
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
            }
            catch (error) {
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
        this.delete = async (req, res) => {
            try {
                const { id } = req.params;
                await prisma.entityMapping.delete({
                    where: { id },
                });
                console.log(`[EntityMappings] Deleted: ${id}`);
                res.json({ success: true, message: 'Mapping deleted' });
            }
            catch (error) {
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
        this.batchCreate = async (req, res) => {
            try {
                const { mappings } = req.body;
                if (!Array.isArray(mappings) || mappings.length === 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'mappings array is required'
                    });
                }
                const results = await prisma.entityMapping.createMany({
                    data: mappings.map((m) => ({
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
            }
            catch (error) {
                console.error('[EntityMappings] batchCreate error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/admin/mappings/pages
         * Lista todas as páginas que têm mapeamentos
         */
        this.listPages = async (req, res) => {
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
            }
            catch (error) {
                console.error('[EntityMappings] listPages error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
    }
}
exports.EntityMappingsController = EntityMappingsController;
