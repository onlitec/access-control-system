import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'resident-pw-')), 'test.db');
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.JWT_SECRET = 'test-secret-0123456789abcdef';

const sent: { channel: string; address: string; code: string; purpose: string }[] = [];
const state = { email: 'maria@exemplo.com' as string | null, phone: '+5511988887777' as string | null };
const resident = () => ({ hikPersonId: '10', name: 'Maria', cpf: '52998224725', email: state.email, phoneE164: state.phone, orgIndexCode: '1', towers: [] });

vi.mock('../src/hikcentral/residents', () => ({
    findResidentByCpf: async (cpf: string) => (cpf === '52998224725' ? resident() : null),
}));
vi.mock('../src/notify/notifier', async (orig) => ({
    ...(await orig<typeof import('../src/notify/notifier')>()),
    sendLoginCode: async (dest: { channel: string; address: string }, code: string, purpose = 'LOGIN') => {
        sent.push({ channel: dest.channel, address: dest.address, code, purpose });
    },
}));

let base = '';
let close: () => void;
let prisma: typeof import('../src/db').prisma;
const CPF = '529.982.247-25';

async function post(p: string, body: unknown) {
    const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as any };
}

/** Cria a senha pelo fluxo de primeiro acesso. */
async function createPassword(password = 'Senha1234') {
    await prisma.loginCode.deleteMany(); // o limite de 1 pedido por minuto não vale para o teste
    await post('/password/request', { cpf: CPF });
    const code = sent[sent.length - 1].code;
    return post('/password/confirm', { cpf: CPF, code, password });
}

beforeAll(async () => {
    execSync('npx prisma db push --skip-generate', { env: { ...process.env }, stdio: 'ignore' });
    prisma = (await import('../src/db')).prisma;
    const express = (await import('express')).default;
    const routes = (await import('../src/routes/auth.routes')).default;
    const app = express();
    app.use(express.json());
    app.use(routes);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
});
afterAll(async () => { close(); await prisma.$disconnect(); });
beforeEach(async () => {
    sent.length = 0;
    state.email = 'maria@exemplo.com';
    state.phone = '+5511988887777';
    await prisma.loginCode.deleteMany();
    await prisma.residentCredential.deleteMany();
});

describe('primeiro acesso e recuperação de senha', () => {
    it('manda o código só para o e-mail do HikCentral, mesmo havendo celular', async () => {
        await post('/password/request', { cpf: CPF });
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ channel: 'email', address: 'maria@exemplo.com', purpose: 'RESET' });
    });

    it('responde igual para CPF que não existe e não envia nada', async () => {
        const a = await post('/password/request', { cpf: CPF });
        const b = await post('/password/request', { cpf: '111.444.777-35' });
        expect(b.status).toBe(a.status);
        expect(b.body).toEqual(a.body);
        expect(sent).toHaveLength(1);
    });

    it('sem e-mail no HikCentral não envia código (celular não serve para redefinir)', async () => {
        state.email = null;
        await post('/password/request', { cpf: CPF });
        expect(sent).toHaveLength(0);
    });

    it('cria a senha com o código e não aceita o mesmo código duas vezes', async () => {
        await post('/password/request', { cpf: CPF });
        const code = sent[0].code;
        expect((await post('/password/confirm', { cpf: CPF, code, password: 'Senha1234' })).status).toBe(200);
        expect((await post('/password/confirm', { cpf: CPF, code, password: 'Outra1234' })).status).toBe(401);
        const stored = await prisma.residentCredential.findUnique({ where: { cpf: '52998224725' } });
        expect(stored?.passwordHash).not.toContain('Senha1234');
    });

    it('recusa código errado e senha fraca', async () => {
        await post('/password/request', { cpf: CPF });
        const code = sent[0].code;
        expect((await post('/password/confirm', { cpf: CPF, code: code === '000000' ? '111111' : '000000', password: 'Senha1234' })).status).toBe(401);
        for (const weak of ['curta1', 'somenteletras', '12345678', '52998224725']) {
            expect((await post('/password/confirm', { cpf: CPF, code, password: weak })).status).toBe(400);
        }
        expect(await prisma.residentCredential.count()).toBe(0);
    });

    it('um código de login (2ª etapa) não serve para criar senha', async () => {
        await createPassword();
        sent.length = 0;
        await post('/login', { cpf: CPF, password: 'Senha1234' });
        expect(sent[0].purpose).toBe('LOGIN');
        expect((await post('/password/confirm', { cpf: CPF, code: sent[0].code, password: 'Nova12345' })).status).toBe(401);
    });
});

describe('login com senha e código', () => {
    it('senha certa leva ao código e o código abre a sessão', async () => {
        await createPassword();
        sent.length = 0;
        const step1 = await post('/login', { cpf: CPF, password: 'Senha1234' });
        expect(step1.status).toBe(200);
        expect(step1.body.token).toBeUndefined();
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ channel: 'whatsapp', purpose: 'LOGIN' });
        const step2 = await post('/verify-code', { challenge: step1.body.challenge, code: sent[0].code });
        expect(step2.status).toBe(200);
        expect(step2.body.token).toBeTruthy();
    });

    it('sem a senha ou sem o desafio não há sessão', async () => {
        await createPassword();
        expect((await post('/verify-code', { code: '123456' })).status).toBe(401);
        expect((await post('/verify-code', { challenge: 'inventado', code: '123456' })).status).toBe(401);
    });

    it('CPF sem senha cadastrada e senha errada recebem a mesma resposta', async () => {
        const noPassword = await post('/login', { cpf: CPF, password: 'Senha1234' });
        await createPassword();
        const wrong = await post('/login', { cpf: CPF, password: 'Errada1234' });
        const unknown = await post('/login', { cpf: '111.444.777-35', password: 'Senha1234' });
        for (const r of [noPassword, wrong, unknown]) expect(r).toMatchObject({ status: 401, body: { error: 'CPF ou senha inválidos.' } });
        expect(sent.filter((s) => s.purpose === 'LOGIN')).toHaveLength(0);
    });

    it('bloqueia após 5 senhas erradas, mesmo que a próxima esteja certa', async () => {
        await createPassword();
        for (let i = 0; i < 4; i++) expect((await post('/login', { cpf: CPF, password: 'Errada1234' })).status).toBe(401);
        expect((await post('/login', { cpf: CPF, password: 'Errada1234' })).status).toBe(429);
        expect((await post('/login', { cpf: CPF, password: 'Senha1234' })).status).toBe(429);
    });

    it('redefinir a senha libera o bloqueio e a senha antiga deixa de valer', async () => {
        await createPassword();
        for (let i = 0; i < 5; i++) await post('/login', { cpf: CPF, password: 'Errada1234' });
        await prisma.loginCode.deleteMany();
        expect((await createPassword('Nova12345')).status).toBe(200);
        expect((await post('/login', { cpf: CPF, password: 'Senha1234' })).status).toBe(401);
        expect((await post('/login', { cpf: CPF, password: 'Nova12345' })).status).toBe(200);
    });

    it('avisa quando o cadastro no HikCentral perdeu e-mail e celular', async () => {
        await createPassword();
        state.email = null; state.phone = null;
        expect((await post('/login', { cpf: CPF, password: 'Senha1234' })).status).toBe(409);
    });
});
