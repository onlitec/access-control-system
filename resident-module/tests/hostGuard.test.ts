import { describe, expect, it } from 'vitest';
import { visitorHostGuard } from '../src/hostGuard';

function run(guard: ReturnType<typeof visitorHostGuard>, host: string, path: string) {
    let status = 200;
    let nexted = false;
    const res: any = { status(c: number) { status = c; return res; }, json() { return res; } };
    guard({ headers: { host }, path } as any, res, () => { nexted = true; });
    return nexted ? 200 : status;
}

describe('visitorHostGuard', () => {
    const guard = visitorHostGuard('https://visitantes.x.com', 'https://app.x.com');

    it('no endereço do visitante só passa o que o visitante usa', () => {
        for (const p of ['/v/abc', '/api/public/invite/abc', '/api/health', '/visitor.js', '/style.css'])
            expect(run(guard, 'visitantes.x.com', p)).toBe(200);
        for (const p of ['/', '/app.html', '/api/invites', '/api/auth/request-code', '/sw.js'])
            expect(run(guard, 'visitantes.x.com', p)).toBe(404);
    });

    it('no endereço do morador nada é bloqueado', () => {
        expect(run(guard, 'app.x.com', '/app.html')).toBe(200);
    });

    it('com um endereço só (ou sem VISITOR_URL) não bloqueia nada', () => {
        expect(run(visitorHostGuard('https://app.x.com', 'https://app.x.com'), 'app.x.com', '/api/invites')).toBe(200);
        expect(run(visitorHostGuard('', ''), 'qualquer', '/api/invites')).toBe(200);
    });
});
