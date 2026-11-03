import { NextFunction, Request, Response } from 'express';

const VISITOR_PATHS = [/^\/v\//, /^\/api\/public\//, /^\/api\/health$/, /^\/(visitor\.js|style\.css|icon-\d+\.png)$/];

/**
 * Quando o módulo é publicado em dois endereços (um do morador, outro do visitante),
 * o endereço do visitante só atende o que o visitante usa: nada do app do morador fica exposto nele.
 */
export function visitorHostGuard(visitorUrl: string, residentUrl: string) {
    const host = (url: string) => { try { return new URL(url).host.toLowerCase(); } catch { return ''; } };
    const visitorHost = host(visitorUrl);
    const residentHost = host(residentUrl);
    const active = !!visitorHost && visitorHost !== residentHost;
    return (req: Request, res: Response, next: NextFunction) => {
        if (!active || (req.headers.host || '').toLowerCase() !== visitorHost) return next();
        if (VISITOR_PATHS.some((re) => re.test(req.path))) return next();
        res.status(404).json({ error: 'Não encontrado.' });
    };
}
