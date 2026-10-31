import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'resident-fam-')), 'test.db');
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.PUBLIC_URL = 'https://morador.exemplo.com.br';

const hik = { createAppointment: vi.fn(), deleteAppointment: vi.fn(), pickLevelForTowers: vi.fn() };
vi.mock('../src/hikcentral/visitors', () => hik);

const people = {
    '52998224725': { hikPersonId: '10', name: 'Ana Souza', cpf: '52998224725', email: null, phoneE164: '+5511911110000', orgIndexCode: '1', towers: ['TORRE-1'] },
    '11144477735': { hikPersonId: '20', name: 'Bia Souza', cpf: '11144477735', email: null, phoneE164: '+5511922220000', orgIndexCode: '1', towers: ['TORRE-1'] },
    '39053344705': { hikPersonId: '30', name: 'Caio Lima', cpf: '39053344705', email: null, phoneE164: '+5511933330000', orgIndexCode: '2', towers: [] },
};
vi.mock('../src/hikcentral/residents', () => ({
    findResidentByCpf: async (cpf: string) => (people as any)[cpf] ?? null,
    findResidentById: async (id: string) => Object.values(people).find((p) => p.hikPersonId === id) ?? null,
}));
const sent: string[] = [];
vi.mock('../src/notify/notifier', async (orig) => ({
    ...(await orig<typeof import('../src/notify/notifier')>()),
    sendText: async (_d: unknown, body: string) => { sent.push(body); },
}));

let svc: typeof import('../src/invites/service');
let fam: typeof import('../src/invites/family');
let saved: typeof import('../src/invites/saved');
let prisma: typeof import('../src/db').prisma;

const ana = { sub: '10', name: 'Ana Souza', towers: ['TORRE-1'] };
const bia = { sub: '20', name: 'Bia Souza', towers: ['TORRE-1'] };
const caio = { sub: '30', name: 'Caio Lima', towers: [] };
const jpeg = (bytes: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes)]).toString('base64');
const dayFromNow = (n: number) => new Date(Date.now() + n * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10);
const form = (over: Record<string, unknown> = {}) => ({
    name: 'Carlos', surname: 'Pereira', phone: '(11) 98888-7777', visitDate: dayFromNow(1),
    faceBase64: jpeg(30_000), documentBase64: jpeg(200_000), lgpdConsent: true, ...over,
});

beforeAll(async () => {
    execSync('npx prisma db push --skip-generate', { env: { ...process.env }, stdio: 'ignore' });
    svc = await import('../src/invites/service');
    fam = await import('../src/invites/family');
    saved = await import('../src/invites/saved');
    prisma = (await import('../src/db')).prisma;
});
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => {
    for (const m of ['visit', 'invite', 'savedVisitor', 'familyLink'] as const) await (prisma as any)[m].deleteMany();
    sent.length = 0; vi.clearAllMocks();
    hik.pickLevelForTowers.mockResolvedValue('35');
    hik.createAppointment.mockResolvedValue({ visitorId: '1282', appointRecordId: '771' });
    hik.deleteAppointment.mockResolvedValue(undefined);
});

async function registered(owner = ana, over: Record<string, unknown> = {}) {
    const invite = await svc.createInvite(owner, { allowVehicle: true });
    return svc.registerVisit(invite.token, form(over));
}

async function linked() {
    await fam.requestFamilyLink(ana, '111.444.777-35');
    const link = await prisma.familyLink.findFirstOrThrow();
    await fam.answerFamilyRequest(bia, link.id, true);
    return link;
}

describe('visitantes salvos', () => {
    it('só guarda se o visitante autorizou e o morador aprovou', async () => {
        const plain = await registered(ana, { phone: '11911112222' });
        await svc.approveVisit(ana, plain.id);
        expect(await prisma.savedVisitor.count()).toBe(0);

        const consenting = await registered(ana, { saveConsent: true, plate: 'abc1d23' });
        expect(await prisma.savedVisitor.count()).toBe(0); // ainda não aprovado
        await svc.approveVisit(ana, consenting.id);
        const [s] = await prisma.savedVisitor.findMany();
        expect(s).toMatchObject({ residentId: '10', name: 'Carlos', plate: 'ABC1D23', phone: '11988887777' });
        expect(s.faceJpeg.length).toBeGreaterThan(1000);
        expect((await prisma.visit.findUniqueOrThrow({ where: { id: consenting.id } })).faceJpeg).toBeNull();
    });

    it('não guarda cadastro recusado e não duplica o mesmo telefone', async () => {
        const rejected = await registered(ana, { saveConsent: true });
        await svc.rejectVisit(ana, rejected.id);
        expect(await prisma.savedVisitor.count()).toBe(0);

        for (let i = 0; i < 2; i++) await svc.approveVisit(ana, (await registered(ana, { saveConsent: true })).id);
        expect(await prisma.savedVisitor.count()).toBe(1);
    });

    it('convida de novo sem novo cadastro: cria a visita já aprovada com as fotos guardadas', async () => {
        await svc.approveVisit(ana, (await registered(ana, { saveConsent: true })).id);
        const [s] = await saved.listSavedVisitors(ana);
        hik.createAppointment.mockClear();

        const visit = await saved.reinviteSavedVisitor(ana, s.id, dayFromNow(3));
        expect(visit).toMatchObject({ status: 'APPROVED', visitDate: dayFromNow(3) });
        const info = (hik.createAppointment.mock.calls[0][0] as any).visitorInfoList[0].VisitorInfo;
        expect(info.faces[0].faceData.length).toBeGreaterThan(1000);
        expect((await prisma.invite.findFirstOrThrow({ where: { id: visit.inviteId } })).status).toBe('USED');
    });

    it('se o HikCentral recusar a visita fica pendente para tentar de novo', async () => {
        await svc.approveVisit(ana, (await registered(ana, { saveConsent: true })).id);
        const [s] = await saved.listSavedVisitors(ana);
        hik.createAppointment.mockRejectedValueOnce(new Error('indisponível'));
        await expect(saved.reinviteSavedVisitor(ana, s.id, dayFromNow(2))).rejects.toThrow('recusou');
        const pending = await svc.listVisits(ana, 'PENDING_APPROVAL');
        expect(pending).toHaveLength(1);
        expect(pending[0].hikError).toContain('indisponível');
    });

    it('valida a data e o dono, e permite esquecer', async () => {
        await svc.approveVisit(ana, (await registered(ana, { saveConsent: true })).id);
        const [s] = await saved.listSavedVisitors(ana);
        await expect(saved.reinviteSavedVisitor(ana, s.id, dayFromNow(-1))).rejects.toThrow('passado');
        await expect(saved.reinviteSavedVisitor(ana, s.id, dayFromNow(200))).rejects.toThrow('90 dias');
        await expect(saved.reinviteSavedVisitor(ana, s.id, 'amanhã')).rejects.toThrow('data');
        await expect(saved.reinviteSavedVisitor(bia, s.id, dayFromNow(1))).rejects.toThrow('não encontrado');
        expect(await saved.listSavedVisitors(bia)).toHaveLength(0);
        await expect(saved.forgetSavedVisitor(bia, s.id)).rejects.toThrow('não encontrado');
        await saved.forgetSavedVisitor(ana, s.id);
        expect(await saved.listSavedVisitors(ana)).toHaveLength(0);
    });

    it('apaga por inatividade', async () => {
        await svc.approveVisit(ana, (await registered(ana, { saveConsent: true })).id);
        expect(await saved.purgeStaleSavedVisitors()).toBe(0);
        await prisma.savedVisitor.updateMany({ data: { lastVisitAt: new Date(Date.now() - 200 * 86_400_000) } });
        expect(await saved.purgeStaleSavedVisitors()).toBe(1);
    });
});

describe('família', () => {
    it('pede o vínculo, avisa o familiar e só vale depois do aceite', async () => {
        await fam.requestFamilyLink(ana, '111.444.777-35');
        expect(sent[0]).toContain('Ana Souza');
        expect((await fam.listFamily(bia)).requests).toHaveLength(1);
        expect((await fam.listFamily(ana)).waitingAnswer).toHaveLength(1);
        expect(await fam.visibleResidentIds(ana)).toEqual(['10']);

        const link = await prisma.familyLink.findFirstOrThrow();
        await expect(fam.answerFamilyRequest(ana, link.id, true)).rejects.toThrow('não encontrado');
        await fam.answerFamilyRequest(bia, link.id, true);
        expect(await fam.visibleResidentIds(ana)).toEqual(['10', '20']);
        expect((await fam.listFamily(ana)).members).toEqual([{ id: link.id, name: 'Bia Souza' }]);
        expect((await fam.listFamily(bia)).responsibles).toEqual([{ id: link.id, name: 'Ana Souza' }]);
    });

    it('não revela se o CPF existe e ignora o próprio CPF e duplicados', async () => {
        await fam.requestFamilyLink(ana, '000.000.000-00').catch(() => {});
        await fam.requestFamilyLink(ana, '390.533.447-05'); // existe
        await fam.requestFamilyLink(ana, '529.982.247-25'); // o próprio
        await fam.requestFamilyLink(ana, '390.533.447-05'); // de novo
        expect(await prisma.familyLink.count()).toBe(1);
        await expect(fam.requestFamilyLink(ana, '123')).rejects.toThrow('CPF inválido');
        // CPF válido mas que não é morador: mesma resposta, sem vínculo nem aviso
        sent.length = 0;
        await fam.requestFamilyLink(ana, '168.995.350-09');
        expect(await prisma.familyLink.count()).toBe(1);
        expect(sent).toHaveLength(0);
    });

    it('permite recusar, pedir de novo e desfazer pelos dois lados', async () => {
        await fam.requestFamilyLink(ana, '111.444.777-35');
        const link = await prisma.familyLink.findFirstOrThrow();
        await fam.answerFamilyRequest(bia, link.id, false);
        expect((await fam.listFamily(ana)).waitingAnswer).toHaveLength(0);
        await fam.requestFamilyLink(ana, '111.444.777-35');
        expect((await prisma.familyLink.findFirstOrThrow()).status).toBe('PENDING');
        await fam.answerFamilyRequest(bia, link.id, true);
        await expect(fam.removeFamilyLink(caio, link.id)).rejects.toThrow('não encontrado');
        await fam.removeFamilyLink(bia, link.id);
        expect(await fam.visibleResidentIds(ana)).toEqual(['10']);
    });

    it('o responsável vê os convites e cadastros do membro, mas não o contrário', async () => {
        await linked();
        const v = await registered(bia);
        const visits = await svc.listVisits(ana);
        expect(visits).toHaveLength(1);
        expect(visits[0]).toMatchObject({ id: v.id, mine: false, owner: 'Bia Souza' });
        expect((await svc.listInvites(ana))[0]).toMatchObject({ mine: false, owner: 'Bia Souza' });
        expect(await svc.listVisits(caio)).toHaveLength(0);

        await registered(ana, { phone: '11911119999' });
        expect(await svc.listVisits(bia)).toHaveLength(1); // a Bia só vê o dela
        expect(await svc.listVisits(ana)).toHaveLength(2);
    });

    it('o responsável aprova pelo membro; o visitado no HikCentral continua sendo o membro', async () => {
        await linked();
        const v = await registered(bia);
        expect((await svc.visitPhoto(ana, v.id, 'face'))?.length).toBeGreaterThan(1000);
        await expect(svc.approveVisit(caio, v.id)).rejects.toThrow('não encontrado');
        await svc.approveVisit(ana, v.id);
        expect((hik.createAppointment.mock.calls[0][0] as any).receptionistId).toBe('20');
        await svc.cancelVisit(ana, v.id);
        expect(hik.deleteAppointment).toHaveBeenCalledWith('771');
    });

    it('vínculo pendente ou desfeito não dá acesso', async () => {
        await fam.requestFamilyLink(ana, '111.444.777-35');
        const v = await registered(bia);
        await expect(svc.approveVisit(ana, v.id)).rejects.toThrow('não encontrado');
        expect(await svc.listVisits(ana)).toHaveLength(0);
    });
});
