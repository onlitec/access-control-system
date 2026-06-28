import { HikCentralService } from './HikCentralService';
import { HIK_ORG_NAMES } from '../config/hik-constants';

let orgNameCache: Record<string, string> = {};
let orgCacheTimestamp = 0;
const ORG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export class OrgResolverService {
    /**
     * Busca os orgIndexCodes do HikCentral pelo nome do departamento.
     * Usa cache TTL de 5 minutos para evitar chamadas excessivas.
     * Fallback para mapa estático se HikCentral não responder.
     */
    static async resolveOrgCodesByName(): Promise<Record<string, string>> {
        const now = Date.now();
        if (Object.keys(orgNameCache).length > 0 && (now - orgCacheTimestamp) < ORG_CACHE_TTL_MS) {
            return orgNameCache;
        }
        try {
            const result = await Promise.race([
                HikCentralService.getOrgList(1, 200),
                new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]) as any;
            
            const list: any[] = result?.data?.list || [];
            if (list.length > 0) {
                const map: Record<string, string> = {};
                list.forEach((org: any) => {
                    const name = (org.orgName || '').toUpperCase().trim();
                    const code = String(org.orgIndexCode);
                    map[name] = code;
                    // Note: Update HIK_ORG_NAMES dynamically might be tricky if it's a constant
                    // For now we just return the map and log it
                });
                orgNameCache = map;
                orgCacheTimestamp = now;
                console.log('[HikCentral] Departamentos resolvidos:', JSON.stringify(map));
                return map;
            }
        } catch (e: any) {
            console.warn('[HikCentral] Falha ao buscar orgs, usando mapa estático:', e.message);
        }
        
        // Fallback: mapa estático invertido
        const staticMap: Record<string, string> = {};
        Object.entries(HIK_ORG_NAMES).forEach(([code, name]) => { 
            staticMap[name.toUpperCase()] = code; 
        });
        return staticMap;
    }

    /**
     * Retorna os orgIndexCodes para um tipo de departamento.
     * keywords: array de nomes (uppercase) a buscar no HikCentral.
     * staticFallback: codes a usar se HikCentral não retornar match.
     */
    static async getOrgCodesForType(keywords: string[], staticFallback: string[]): Promise<string[]> {
        const nameMap = await this.resolveOrgCodesByName();
        const codes = new Set<string>();
        keywords.forEach(kw => {
            Object.entries(nameMap).forEach(([name, code]) => {
                if (name.includes(kw)) codes.add(code);
            });
        });
        return codes.size > 0 ? Array.from(codes) : staticFallback;
    }
}
