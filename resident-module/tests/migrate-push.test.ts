import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'resident-mig-')), 'test.db');
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.VAPID_PUBLIC_KEY = 'pub';
process.env.VAPID_PRIVATE_KEY = 'priv';

const send = vi.fn();
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => send(...a) } }));

let prisma: typeof import('../src/db').prisma;
let migrate: typeof import('../src/migrate');
let push: typeof import('../src/push');

beforeAll(async () => {
    ({ prisma } = await import('../src/db'));
    migrate = await import('../src/migrate');
    push = await import('../src/push');
});
afterAll(async () => { await prisma.$disconnect(); });

const sub = (n: string) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: 'k', auth: 'a' } });

describe('migrações', () => {
    it('cria o banco do zero, uma vez só, e todas as tabelas do schema funcionam', async () => {
        expect(await migrate.runMigrations(prisma)).toEqual(['001_init.sql']);
        expect(await migrate.runMigrations(prisma)).toEqual([]);
        expect(await prisma.invite.count()).toBe(0);
        expect(await prisma.pushSubscription.count()).toBe(0);
        expect(await prisma.familyLink.count()).toBe(0);
    });

    it('splitSql ignora comentários', () => {
        expect(migrate.splitSql('-- a\nCREATE TABLE x (a INT);\n\n-- b\nCREATE INDEX i ON x(a);\n')).toEqual([
            'CREATE TABLE x (a INT)', 'CREATE INDEX i ON x(a)',
        ]);
    });
});

describe('push', () => {
    it('rejeita inscrição inválida e guarda a válida sem duplicar', async () => {
        await expect(push.saveSubscription('1', { endpoint: 'http://x', keys: { p256dh: 'k', auth: 'a' } })).rejects.toThrow();
        await push.saveSubscription('1', sub('a'));
        await push.saveSubscription('1', sub('a'));
        expect(await prisma.pushSubscription.count()).toBe(1);
    });

    it('envia aos aparelhos dos moradores informados e apaga inscrição expirada', async () => {
        await push.saveSubscription('2', sub('b'));
        await push.saveSubscription('3', sub('c'));
        send.mockImplementation(async (s: { endpoint: string }) => {
            if (s.endpoint.endsWith('/b')) throw Object.assign(new Error('gone'), { statusCode: 410 });
        });
        const sent = await push.sendPush(['1', '2'], { title: 't', body: 'b' });
        expect(sent).toBe(1);
        expect(send).toHaveBeenCalledTimes(2);
        expect(await prisma.pushSubscription.findUnique({ where: { endpoint: 'https://push.example.com/b' } })).toBeNull();
        expect(await prisma.pushSubscription.findUnique({ where: { endpoint: 'https://push.example.com/c' } })).not.toBeNull();
    });

    it('remove só a inscrição do próprio morador', async () => {
        await push.removeSubscription('999', 'https://push.example.com/c');
        expect(await prisma.pushSubscription.count({ where: { endpoint: 'https://push.example.com/c' } })).toBe(1);
        await push.removeSubscription('3', 'https://push.example.com/c');
        expect(await prisma.pushSubscription.count({ where: { endpoint: 'https://push.example.com/c' } })).toBe(0);
    });
});
