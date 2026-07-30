import type { Request, Response, NextFunction } from 'express';
import { isStandby } from '../utils/dbRole';

/**
 * Segundo servidor (réplica de leitura do Postgres): enquanto este processo
 * estiver rodando contra um standby, requisições de escrita precisam ser
 * encaminhadas ao primário — senão falhariam com "cannot execute ... in a
 * read-only transaction". Isso permite manter os dois servidores atrás do
 * mesmo túnel Cloudflare (roteamento sem preferência por servidor) sem
 * quebrar escritas quando calharem no standby.
 */

const PRIMARY_INTERNAL_URL = process.env.PRIMARY_INTERNAL_URL?.replace(/\/+$/, '');
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const HOP_BY_HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length']);

export async function standbyForwardMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!PRIMARY_INTERNAL_URL || !WRITE_METHODS.has(req.method) || !req.originalUrl.startsWith('/api')) {
        return next();
    }

    if (!(await isStandby())) {
        return next();
    }

    try {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === 'string' && !HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) {
                headers[key] = value;
            }
        }

        const hasBody = req.body !== undefined && req.body !== null && Object.keys(req.body).length > 0;
        const upstream = await fetch(`${PRIMARY_INTERNAL_URL}${req.originalUrl}`, {
            method: req.method,
            headers,
            body: hasBody ? JSON.stringify(req.body) : undefined,
        });

        const bodyText = await upstream.text();
        res.status(upstream.status);
        const contentType = upstream.headers.get('content-type');
        if (contentType) res.setHeader('content-type', contentType);
        res.setHeader('x-forwarded-to-primary', '1');
        res.send(bodyText);
    } catch (error: any) {
        console.error('[StandbyForward] Falha ao encaminhar escrita ao primário:', error?.message || error);
        res.status(503).json({ error: 'Servidor em modo standby e primário indisponível para escrita.' });
    }
}
