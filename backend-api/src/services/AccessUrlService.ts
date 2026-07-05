import { prisma } from '../database';

export interface AccessUrlConfig {
    mode: 'ip' | 'domain';
    urlIp: string | null;
    urlDomain: string | null;
    effectiveUrl: string;
}

const ENV_FALLBACK = process.env.APP_URL || 'https://127.0.0.1:8443';

function stripTrailingSlash(url: string): string {
    return url.trim().replace(/\/+$/, '');
}

/**
 * URL base usada nos links enviados a moradores e visitantes (onboarding,
 * pré-cadastro de visita). O instalador grava em APP_URL (.env) o IP da rede
 * local detectado na instalação, que normalmente não é alcançável de fora do
 * condomínio - esse serviço deixa o painel admin sobrepor esse valor com um
 * IP público/WAN ou um domínio (DNS + proxy reverso), conforme o que estiver
 * de fato acessível para quem recebe o link.
 */
export class AccessUrlService {
    private static cached: AccessUrlConfig | null = null;
    private static cachedAt = 0;
    private static readonly CACHE_TTL_MS = 30_000;

    static invalidateCache(): void {
        this.cached = null;
        this.cachedAt = 0;
    }

    static async getEffectiveConfig(): Promise<AccessUrlConfig> {
        const now = Date.now();
        if (this.cached && now - this.cachedAt < this.CACHE_TTL_MS) {
            return this.cached;
        }

        let db: any = null;
        try {
            db = await prisma.systemSettings.findUnique({ where: { id: 'singleton' } });
        } catch (err: any) {
            console.error('[AccessUrl] Falha ao ler SystemSettings (usando .env):', err?.message || err);
        }

        const mode: 'ip' | 'domain' = db?.accessMode === 'domain' ? 'domain' : 'ip';
        const urlIp = db?.accessUrlIp?.trim() || null;
        const urlDomain = db?.accessUrlDomain?.trim() || null;

        const chosen = mode === 'domain' ? urlDomain : urlIp;
        const effectiveUrl = stripTrailingSlash(chosen || ENV_FALLBACK);

        const effective: AccessUrlConfig = { mode, urlIp, urlDomain, effectiveUrl };
        this.cached = effective;
        this.cachedAt = now;
        return effective;
    }

    static async getEffectiveAppUrl(): Promise<string> {
        const { effectiveUrl } = await this.getEffectiveConfig();
        return effectiveUrl;
    }
}
