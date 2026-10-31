import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'resident-inv-')), 'test.db');
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.PUBLIC_URL = 'https://morador.exemplo.com.br';

const hik = {
    createAppointment: vi.fn(),
    deleteAppointment: vi.fn(),
    pickLevelForTowers: vi.fn(),
};
vi.mock('../src/hikcentral/visitors', () => hik);
vi.mock('../src/hikcentral/residents', () => ({ findResidentById: async () => null }));
const sent: string[] = [];
vi.mock('../src/notify/notifier', async (orig) => ({
    ...(await orig<typeof import('../src/notify/notifier')>()),
    sendText: async (_d: unknown, body: string) => { sent.push(body); },
}));

let svc: typeof import('../src/invites/service');
let prisma: typeof import('../src/db').prisma;

const maria = { sub: '10', name: 'Maria Souza', towers: ['TORRE-1'] };
const joao = { sub: '20', name: 'João Lima', towers: [] };
const jpeg = (bytes: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes)]).toString('base64');
// Dia no fuso padrão do módulo (-03:00); não depende de `svc`, que só carrega no beforeAll.
const dayFromNow = (n: number) => new Date(Date.now() + n * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10);

const form = (over: Record<string, unknown> = {}) => ({
    name: 'Carlos', surname: 'Pereira', phone: '(11) 98888-7777', email: 'carlos@exemplo.com', document: '123456789',
    visitDate: dayFromNow(1), faceBase64: jpeg(30_000), documentBase64: jpeg(200_000), lgpdConsent: true, ...over,
});

beforeAll(async () => {
    execSync('npx prisma db push --skip-generate', { env: { ...process.env }, stdio: 'ignore' });
    svc = await import('../src/invites/service');
    prisma = (await import('../src/db')).prisma;
});
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => {
    await prisma.visit.deleteMany(); await prisma.invite.deleteMany();
    sent.length = 0; vi.clearAllMocks();
    hik.pickLevelForTowers.mockResolvedValue('35');
    hik.createAppointment.mockResolvedValue({ visitorId: '1282', appointRecordId: '771' });
    hik.deleteAppointment.mockResolvedValue(undefined);
});

async function registered(over: Record<string, unknown> = {}, inviteInput: Record<string, unknown> = {}) {
    const invite = await svc.createInvite(maria, inviteInput);
    const visit = await svc.registerVisit(invite.token, form(over));
    return { invite, visit };
}

describe('criar convite', () => {
    it('gera link único com validade padrão', async () => {
        const a = await svc.createInvite(maria, {});
        const b = await svc.createInvite(maria, { type: 'PROVIDER', allowVehicle: true, label: ' Encanador ' });
        expect(a.token).not.toBe(b.token);
        expect(svc.inviteLink(a.token)).toBe(`https://morador.exemplo.com.br/v/${a.token}`);
        expect(b).toMatchObject({ type: 'PROVIDER', allowVehicle: true, label: 'Encanador', towers: 'TORRE-1' });
    });

    it('recusa datas inválidas', async () => {
        await expect(svc.createInvite(maria, { validUntil: dayFromNow(-1) })).rejects.toThrow('já passou');
        await expect(svc.createInvite(maria, { validFrom: dayFromNow(5), validUntil: dayFromNow(2) })).rejects.toThrow('anterior');
        await expect(svc.createInvite(maria, { validUntil: 'amanhã' })).rejects.toThrow('inválidas');
    });
});

describe('cadastro do visitante', () => {
    it('grava o pedido e usa o convite', async () => {
        const { invite, visit } = await registered();
        expect(visit).toMatchObject({ status: 'PENDING_APPROVAL', name: 'Carlos', phone: '11988887777', plate: null });
        expect((await prisma.invite.findUnique({ where: { id: invite.id } }))?.status).toBe('USED');
        await expect(svc.registerVisit(invite.token, form())).rejects.toThrow('já foi usado');
    });

    it('só guarda a placa quando o convite permite veículo', async () => {
        expect((await registered({ plate: 'abc-1d23' }, { allowVehicle: true })).visit.plate).toBe('ABC1D23');
        expect((await registered({ plate: 'abc-1d23' })).visit.plate).toBeNull();
    });

    it.each([
        ['sem LGPD', { lgpdConsent: false }, 'LGPD'],
        ['telefone curto', { phone: '123' }, 'telefone'],
        ['e-mail ruim', { email: 'x@' }, 'E-mail'],
        ['data no passado', { visitDate: dayFromNow(-1) }, 'passado'],
        ['data fora do convite', { visitDate: dayFromNow(30) }, 'fora do período'],
        ['rosto pequeno demais', { faceBase64: jpeg(2_000) }, 'pequena'],
        ['rosto acima de 100 KB', { faceBase64: jpeg(120_000) }, 'grande demais'],
        ['rosto que não é JPEG', { faceBase64: Buffer.from('PNG....').toString('base64') }, 'JPEG'],
        ['sem foto do documento', { documentBase64: undefined }, 'documento'],
    ])('recusa %s', async (_t, over, expected) => {
        const invite = await svc.createInvite(maria, {});
        await expect(svc.registerVisit(invite.token, form(over))).rejects.toThrow(expected);
        expect((await prisma.invite.findUnique({ where: { id: invite.id } }))?.status).toBe('OPEN');
    });

    it('recusa convite vencido, cancelado ou inexistente', async () => {
        const invite = await svc.createInvite(maria, {});
        await prisma.invite.update({ where: { id: invite.id }, data: { validUntil: new Date(Date.now() - 1000) } });
        await expect(svc.registerVisit(invite.token, form())).rejects.toThrow('não está mais válido');
        const other = await svc.createInvite(maria, {});
        await svc.cancelInvite(maria, other.id);
        await expect(svc.registerVisit(other.token, form())).rejects.toThrow('não está mais válido');
        await expect(svc.registerVisit('x'.repeat(32), form())).rejects.toThrow('não encontrado');
    });
});

describe('decisão do morador', () => {
    it('aprova: cria o agendamento com morador, nível e fotos, e apaga as fotos locais', async () => {
        const { visit } = await registered();
        const approved = await svc.approveVisit(maria, visit.id);
        expect(approved).toMatchObject({ status: 'APPROVED', hikVisitorId: '1282', hikAppointRecordId: '771', faceJpeg: null, documentJpeg: null });
        expect(hik.pickLevelForTowers).toHaveBeenCalledWith(['TORRE-1']);
        const payload = hik.createAppointment.mock.calls[0][0] as any;
        expect(payload.receptionistId).toBe('10');
        expect(payload.accessInfo.accessLevelList[0].accessLevel.id).toBe(35);
        const info = payload.visitorInfoList[0].VisitorInfo;
        expect(info.faces[0].faceData.length).toBeGreaterThan(1000);
        expect(info.identiPhoto[0].identiPhoto.length).toBeGreaterThan(1000);
    });

    it('volta para aguardando se o HikCentral recusar, guardando o motivo', async () => {
        const { visit } = await registered();
        hik.createAppointment.mockRejectedValueOnce(new Error('code 4 face inválida'));
        await expect(svc.approveVisit(maria, visit.id)).rejects.toThrow('recusou');
        const after = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
        expect(after.status).toBe('PENDING_APPROVAL');
        expect(after.hikError).toContain('face inválida');
        expect(after.faceJpeg).not.toBeNull();
        await expect(svc.approveVisit(maria, visit.id)).resolves.toMatchObject({ status: 'APPROVED' });
    });

    it('não aprova sem nível de acesso de visitante', async () => {
        const { visit } = await registered();
        hik.pickLevelForTowers.mockResolvedValueOnce(undefined);
        await expect(svc.approveVisit(maria, visit.id)).rejects.toThrow('Nenhum nível');
        expect(hik.createAppointment).not.toHaveBeenCalled();
    });

    it('não deixa aprovar duas vezes nem aprovar o convite de outro morador', async () => {
        const { visit } = await registered();
        await expect(svc.approveVisit(joao, visit.id)).rejects.toThrow('não encontrado');
        await svc.approveVisit(maria, visit.id);
        await expect(svc.approveVisit(maria, visit.id)).rejects.toThrow('já foi decidido');
        expect(hik.createAppointment).toHaveBeenCalledTimes(1);
    });

    it('recusa e apaga as fotos', async () => {
        const { visit } = await registered();
        const rejected = await svc.rejectVisit(maria, visit.id, ' não conheço ');
        expect(rejected).toMatchObject({ status: 'REJECTED', rejectReason: 'não conheço', faceJpeg: null });
        expect(hik.createAppointment).not.toHaveBeenCalled();
    });

    it('cancela a visita aprovada removendo o agendamento no HikCentral', async () => {
        const { visit } = await registered();
        await expect(svc.cancelVisit(maria, visit.id)).rejects.toThrow('aprovadas');
        await svc.approveVisit(maria, visit.id);
        expect((await svc.cancelVisit(maria, visit.id)).status).toBe('CANCELLED');
        expect(hik.deleteAppointment).toHaveBeenCalledWith('771');
    });

    it('só mostra as fotos ao dono do convite', async () => {
        const { visit } = await registered();
        expect((await svc.visitPhoto(maria, visit.id, 'face'))?.length).toBeGreaterThan(1000);
        await expect(svc.visitPhoto(joao, visit.id, 'face')).rejects.toThrow('não encontrado');
        expect(await svc.listVisits(joao)).toHaveLength(0);
        expect(await svc.listVisits(maria, 'PENDING_APPROVAL')).toHaveLength(1);
    });
});
