"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntityMappingService = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * Serviço para resolver mapeamentos de entidades para páginas do painel
 * Permite que o sistema seja 100% data-driven
 */
class EntityMappingService {
    /**
     * Resolve todos os mapeamentos ativos para uma página específica
     * Retorna lista de entityIds ordenados por prioridade
     */
    static async resolveForPage(pageRoute) {
        const mappings = await prisma.entityMapping.findMany({
            where: {
                pageRoute,
                isActive: true,
            },
            orderBy: { priority: 'asc' },
        });
        return mappings.map(m => ({
            hikEntityId: m.hikEntityId,
            hikEntityName: m.hikEntityName,
            entityType: m.entityType,
            priority: m.priority,
            filterConfig: m.filterConfig,
        }));
    }
    /**
     * Resolve orgIndexCodes para uma página (quando entityType = ORGANIZATION)
     * Útil para buscar pessoas por departamento
     */
    static async resolveOrgCodesForPage(pageRoute) {
        const mappings = await this.resolveForPage(pageRoute);
        return mappings
            .filter(m => m.entityType === 'ORGANIZATION')
            .map(m => m.hikEntityId);
    }
    /**
     * Resolve múltiplas páginas de uma vez, retornando um mapa
     * Útil para o dashboard que precisa de contagens de várias páginas
     */
    static async resolveMultiplePages(pageRoutes) {
        const mappings = await prisma.entityMapping.findMany({
            where: {
                pageRoute: { in: pageRoutes },
                isActive: true,
            },
            orderBy: [{ pageRoute: 'asc' }, { priority: 'asc' }],
        });
        const result = new Map();
        for (const route of pageRoutes) {
            result.set(route, []);
        }
        for (const m of mappings) {
            const list = result.get(m.pageRoute) || [];
            list.push({
                hikEntityId: m.hikEntityId,
                hikEntityName: m.hikEntityName,
                entityType: m.entityType,
                priority: m.priority,
                filterConfig: m.filterConfig,
            });
            result.set(m.pageRoute, list);
        }
        return result;
    }
    /**
     * Verifica se uma página tem mapeamentos configurados
     * Se não tiver, pode usar fallback hardcoded
     */
    static async hasMappings(pageRoute) {
        const count = await prisma.entityMapping.count({
            where: { pageRoute, isActive: true },
        });
        return count > 0;
    }
    /**
     * Fallback hardcoded para compatibilidade durante transição
     * Usado quando não há mapeamentos configurados
     */
    static getFallbackOrgCodes(pageRoute) {
        const fallbacks = {
            '/painel/residents': ['2'], // MORADORES
            '/painel/staff': ['4'], // PORTARIA
            '/painel/service-providers': ['3'], // PRESTADORES
        };
        return fallbacks[pageRoute] || [];
    }
    /**
     * Resolve orgCodes com fallback automático
     * Se não houver mapeamentos, usa o fallback hardcoded
     */
    static async resolveOrgCodesWithFallback(pageRoute) {
        const hasMapping = await this.hasMappings(pageRoute);
        if (hasMapping) {
            return this.resolveOrgCodesForPage(pageRoute);
        }
        console.log(`[EntityMappingService] No mappings for ${pageRoute}, using fallback`);
        return this.getFallbackOrgCodes(pageRoute);
    }
}
exports.EntityMappingService = EntityMappingService;
