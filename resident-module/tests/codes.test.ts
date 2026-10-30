import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'resident-')), 'test.db');
process.env.DATABASE_URL = `file:${dbFile}`;

const sent: { address: string; code: string }[] = [];
const resident = { hikPersonId: '10', name: 'Maria', cpf: '52998224725', email: null, phoneE164: '+5511988887777', orgIndexCode: '1', towers: [] };

vi.mock('../src/hikcentral/residents', () => ({
    findResidentByCpf: async (cpf: string) => (cpf === resident.cpf ? resident : null),
}));
vi.mock('../src/notify/notifier', async (orig) => ({
    ...(await orig<typeof import('../src/notify/notifier')>()),
    sendLoginCode: async (dest: { address: string }, code: string) => { sent.push({ address: dest.address, code }); },
}));

let codes: typeof import('../src/auth/codes');
let prisma: typeof import('../src/db').prisma;

beforeAll(async () => {
    execSync('npx prisma db push --skip-generate', { env: { ...process.env }, stdio: 'ignore' });
    codes = await import('../src/auth/codes');
    prisma = (await import('../src/db')).prisma;
});
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { sent.length = 0; await prisma.loginCode.deleteMany(); });

describe('código de login', () => {
    it('entra com o código enviado e não aceita reuso', async () => {
        await codes.requestLoginCode('529.982.247-25');
        expect(sent).toHaveLength(1);
        expect(sent[0].address).toBe('+5511988887777');
        expect((await codes.verifyLoginCode('52998224725', sent[0].code))?.hikPersonId).toBe('10');
        expect(await codes.verifyLoginCode('52998224725', sent[0].code)).toBeNull();
    });

    it('não envia nada para CPF desconhecido ou inválido', async () => {
        await codes.requestLoginCode('111.444.777-35');
        await codes.requestLoginCode('123');
        expect(sent).toHaveLength(0);
    });

    it('limita um código por minuto', async () => {
        await codes.requestLoginCode('52998224725');
        await codes.requestLoginCode('52998224725');
        expect(sent).toHaveLength(1);
    });

    it('bloqueia o código após 5 tentativas erradas', async () => {
        await codes.requestLoginCode('52998224725');
        const right = sent[0].code;
        const wrong = right === '000000' ? '111111' : '000000';
        for (let i = 0; i < codes.MAX_ATTEMPTS; i++) expect(await codes.verifyLoginCode('52998224725', wrong)).toBeNull();
        expect(await codes.verifyLoginCode('52998224725', right)).toBeNull();
    });
});
