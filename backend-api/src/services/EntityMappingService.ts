import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ResolvedMapping {
    hikEntityId: string;
    hikEntityName: string;
    entityType: string;
    priority: number;
    filterConfig: any;
}

/**
 * Serviço para resolver mapeamentos de entidades para páginas do painel
 * Permite que o sistema seja 100% data-driven
 */
export class EntityMappingService {

    /**
     * Resolve todos os mapeamentos ativos para uma página específica
     * Retorna lista de entityIds ordenados por prioridade
     */
    public static async resolveForPage(pageRoute: string): Promise<ResolvedMapping[]> {
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
    public static async resolveOrgCodesForPage(pageRoute: string): Promise<string[]> {
        const mappings = await this.resolveForPage(pageRoute);
        return mappings
            .filter(m => m.entityType === 'ORGANIZATION')
            .map(m => m.hikEntityId);
    }

    /**
     * Resolve múltiplas páginas de uma vez, retornando um mapa
     * Útil para o dashboard que precisa de contagens de várias páginas
     */
    public static async resolveMultiplePages(pageRoutes: string[]): Promise<Map<string, ResolvedMapping[]>> {
        const mappings = await prisma.entityMapping.findMany({
            where: {
                pageRoute: { in: pageRoutes },
                isActive: true,
            },
            orderBy: [{ pageRoute: 'asc' }, { priority: 'asc' }],
        });

        const result = new Map<string, ResolvedMapping[]>();
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
    public static async hasMappings(pageRoute: string): Promise<boolean> {
        const count = await prisma.entityMapping.count({
            where: { pageRoute, isActive: true },
        });
        return count > 0;
    }

    /**
     * Fallback hardcoded para compatibilidade durante transição
     * Usado quando não há mapeamentos configurados
     */
    public static getFallbackOrgCodes(pageRoute: string): string[] {
        const fallbacks: Record<string, string[]> = {
            '/painel/residents': ['2'],       // MORADORES
            '/painel/staff': ['4'],           // PORTARIA
            '/painel/service-providers': ['3'], // PRESTADORES
        };
        return fallbacks[pageRoute] || [];
    }

    /**
     * Resolve orgCodes com fallback automático
     * Se não houver mapeamentos, usa o fallback hardcoded
     */
    public static async resolveOrgCodesWithFallback(pageRoute: string): Promise<string[]> {
        const hasMapping = await this.hasMappings(pageRoute);
        if (hasMapping) {
            return this.resolveOrgCodesForPage(pageRoute);
        }
        console.log(`[EntityMappingService] No mappings for ${pageRoute}, using fallback`);
        return this.getFallbackOrgCodes(pageRoute);
    }
}
