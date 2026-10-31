import crypto from 'crypto';
import { Invite, Visit } from '@prisma/client';
import { prisma } from '../db';
import { config } from '../config';
import { Resident, findResidentById } from '../hikcentral/residents';
import { buildVisitorAppointmentPayload } from '../hikcentral/visitorAppointment';
import { createAppointment, deleteAppointment, pickLevelForTowers } from '../hikcentral/visitors';
import { pickDestination, sendText } from '../notify/notifier';
import { SessionPayload } from '../auth/session';
import { toE164Br } from '../utils/cpf';
import { HttpError } from './errors';
import { canManageResident, visibleResidentIds } from './family';
import { sendPush } from '../push';

export { HttpError };

export const FACE_MIN_BYTES = 10 * 1024;
export const FACE_MAX_BYTES = 100 * 1024; // limite do HikCentral para a foto facial (JPG, 10 a 100 KB)
export const DOC_MAX_BYTES = 1_500_000;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- datas ----------

/** AAAA-MM-DD de um instante, no fuso do HikCentral. */
export function dayInTz(date: Date, offset = config.tzOffset): string {
    const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
    if (!m) throw new Error(`HIKCENTRAL_TZ_OFFSET inválido: ${offset}`);
    const minutes = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
    return new Date(date.getTime() + minutes * 60_000).toISOString().slice(0, 10);
}

export const startOfDay = (day: string, offset = config.tzOffset) => new Date(`${day}T00:00:00${offset}`);
export const endOfDay = (day: string, offset = config.tzOffset) => new Date(`${day}T23:59:59${offset}`);

// ---------- convites (lado do morador) ----------

export interface CreateInviteInput {
    type?: string;
    label?: string;
    allowVehicle?: boolean;
    validFrom?: string; // AAAA-MM-DD
    validUntil?: string; // AAAA-MM-DD
}

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export async function createInvite(session: SessionPayload, input: CreateInviteInput): Promise<Invite> {
    const today = dayInTz(new Date());
    const from = input.validFrom ?? today;
    const until = input.validUntil ?? dayInTz(new Date(Date.now() + config.inviteDays * DAY_MS));
    if (!isDay(from) || !isDay(until)) throw new HttpError(400, 'Datas inválidas (use AAAA-MM-DD).');
    if (until < today) throw new HttpError(400, 'A validade do convite já passou.');
    if (until < from) throw new HttpError(400, 'A data final é anterior à inicial.');
    if (Date.parse(until) - Date.parse(from) > 90 * DAY_MS) throw new HttpError(400, 'O convite pode valer no máximo 90 dias.');

    const type = input.type === 'PROVIDER' ? 'PROVIDER' : 'VISITOR';
    return prisma.invite.create({
        data: {
            token: crypto.randomBytes(24).toString('base64url'),
            residentId: session.sub,
            residentName: session.name,
            towers: session.towers.join(','),
            type,
            label: input.label?.trim().slice(0, 80) || null,
            allowVehicle: input.allowVehicle === true,
            validFrom: startOfDay(from),
            validUntil: endOfDay(until),
        },
    });
}

/** Envia o link ao visitante por WhatsApp ou e-mail (telefone ou endereço informado pelo morador). */
export async function sendInviteLink(invite: Invite, recipient: string, resident: { name: string }): Promise<boolean> {
    const phone = recipient.includes('@') ? null : toE164Br(recipient);
    const email = recipient.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim()) ? recipient.trim() : null;
    const dest = pickDestination(phone, email);
    if (!dest) return false;
    await sendText(
        dest,
        `${resident.name} convidou você para uma visita. Faça seu cadastro pelo link (vale até ${dayInTz(invite.validUntil)}): ${inviteLink(invite.token)}`,
        'Convite de visita',
    );
    return true;
}

export const inviteLink = (token: string) => `${config.publicUrl}/v/${token}`;

export async function cancelInvite(session: SessionPayload, id: string): Promise<void> {
    const res = await prisma.invite.updateMany({
        where: { id, residentId: session.sub, status: 'OPEN' },
        data: { status: 'CANCELLED' },
    });
    if (res.count === 0) throw new HttpError(409, 'Só convites ainda não usados podem ser cancelados.');
}

// ---------- cadastro do visitante (lado público) ----------

export interface RegisterInput {
    name?: unknown;
    surname?: unknown;
    phone?: unknown;
    email?: unknown;
    document?: unknown;
    company?: unknown;
    plate?: unknown;
    visitDate?: unknown;
    faceBase64?: unknown;
    documentBase64?: unknown;
    lgpdConsent?: unknown;
    saveConsent?: unknown;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function decodeJpeg(value: unknown, label: string, min: number, max: number): Buffer {
    if (typeof value !== 'string' || !value) throw new HttpError(400, `Envie a ${label}.`);
    const buf = Buffer.from(value.replace(/^data:image\/[a-z]+;base64,/i, ''), 'base64');
    if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
        throw new HttpError(400, `A ${label} precisa ser uma imagem JPEG.`);
    }
    if (buf.length < min) throw new HttpError(400, `A ${label} está pequena demais.`);
    if (buf.length > max) throw new HttpError(400, `A ${label} está grande demais (máximo ${Math.round(max / 1024)} KB).`);
    return buf;
}

export type InviteState = 'OPEN' | 'EXPIRED' | 'CANCELLED' | 'USED';

export function inviteState(invite: Invite, now = new Date()): InviteState {
    if (invite.status === 'CANCELLED') return 'CANCELLED';
    if (invite.status === 'USED') return 'USED';
    return invite.validUntil < now ? 'EXPIRED' : 'OPEN';
}

export async function findInviteByToken(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    return prisma.invite.findUnique({ where: { token }, include: { visit: true } });
}

export async function registerVisit(token: string, input: RegisterInput): Promise<Visit> {
    const invite = await findInviteByToken(token);
    if (!invite) throw new HttpError(404, 'Convite não encontrado.');
    const state = inviteState(invite);
    if (state === 'USED') throw new HttpError(409, 'Este convite já foi usado.');
    if (state !== 'OPEN') throw new HttpError(410, 'Este convite não está mais válido.');

    const name = text(input.name, 64);
    const surname = text(input.surname, 64);
    const phone = text(input.phone, 24).replace(/[^\d+]/g, '');
    const email = text(input.email, 120);
    if (!name || !surname) throw new HttpError(400, 'Informe nome e sobrenome.');
    if (phone.replace(/\D/g, '').length < 10) throw new HttpError(400, 'Informe um telefone com DDD.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
    if (input.lgpdConsent !== true) throw new HttpError(400, 'É preciso aceitar o tratamento dos dados (LGPD).');

    const visitDate = input.visitDate;
    if (!isDay(visitDate)) throw new HttpError(400, 'Informe a data da visita.');
    const today = dayInTz(new Date());
    if (visitDate < today) throw new HttpError(400, 'A data da visita não pode estar no passado.');
    if (visitDate < dayInTz(invite.validFrom) || visitDate > dayInTz(invite.validUntil)) {
        throw new HttpError(400, 'A data da visita está fora do período permitido neste convite.');
    }

    const faceJpeg = decodeJpeg(input.faceBase64, 'foto do rosto', FACE_MIN_BYTES, FACE_MAX_BYTES);
    const documentJpeg = decodeJpeg(input.documentBase64, 'foto do documento', 1024, DOC_MAX_BYTES);

    // Hoje: o acesso começa agora (o HikCentral não aceita início no passado).
    const dayStart = startOfDay(visitDate);
    const visitStart = dayStart.getTime() < Date.now() ? new Date() : dayStart;

    const visit = await prisma.$transaction(async (tx) => {
        // Convite de uso único: só quem trocar OPEN por USED segue.
        const claimed = await tx.invite.updateMany({ where: { id: invite.id, status: 'OPEN' }, data: { status: 'USED' } });
        if (claimed.count === 0) throw new HttpError(409, 'Este convite já foi usado.');
        return tx.visit.create({
            data: {
                inviteId: invite.id,
                name,
                surname,
                phone,
                email: email || null,
                document: text(input.document, 20) || null,
                company: invite.type === 'PROVIDER' ? text(input.company, 64) || null : null,
                plate: invite.allowVehicle ? text(input.plate, 10).toUpperCase().replace(/[\s-]/g, '') || null : null,
                visitDate,
                visitStart,
                visitEnd: endOfDay(visitDate),
                faceJpeg,
                documentJpeg,
                lgpdConsentAt: new Date(),
                saveConsent: input.saveConsent === true,
            },
        });
    });
    void notifyResident(invite, `${name} ${surname}`).catch((err) => console.error('[invites] aviso ao morador:', err.message));
    return visit;
}

async function notifyResident(invite: Invite, visitorName: string): Promise<void> {
    const message = `${visitorName} concluiu o cadastro pelo seu convite e aguarda sua aprovação no app do morador.`;
    // Push: o morador e os responsáveis de família que decidem por ele.
    const links = await prisma.familyLink.findMany({ where: { memberId: invite.residentId, status: 'ACTIVE' }, select: { responsibleId: true } });
    const pushed = await sendPush([invite.residentId, ...links.map((l) => l.responsibleId)], {
        title: 'Visitante aguardando aprovação',
        body: `${visitorName} concluiu o cadastro.`,
        url: '/app.html',
    });
    // Sem nenhum aparelho com push ativo, avisa por WhatsApp/e-mail como antes.
    if (pushed > 0) return;
    const resident = await findResidentById(invite.residentId);
    if (!resident) return;
    const dest = pickDestination(resident.phoneE164, resident.email);
    if (!dest) return;
    await sendText(dest, message, 'Visitante aguardando aprovação');
}

// ---------- visitantes salvos ----------

/** Guarda dados e fotos do visitante para novos convites, só se ele autorizou e o morador aprovou. */
async function rememberVisitor(visit: Visit & { invite: Invite }): Promise<void> {
    if (!visit.saveConsent || !visit.faceJpeg || !visit.documentJpeg) return;
    const data = {
        type: visit.invite.type,
        name: visit.name,
        surname: visit.surname,
        email: visit.email,
        document: visit.document,
        company: visit.company,
        plate: visit.plate,
        faceJpeg: visit.faceJpeg,
        documentJpeg: visit.documentJpeg,
        consentAt: visit.lgpdConsentAt,
        lastVisitAt: new Date(),
    };
    await prisma.savedVisitor.upsert({
        where: { residentId_phone: { residentId: visit.invite.residentId, phone: visit.phone } },
        create: { residentId: visit.invite.residentId, phone: visit.phone, ...data },
        update: data,
    });
}

// ---------- decisão do morador ----------

/** O morador dono do convite ou o responsável de família dele. */
async function ownVisit(session: SessionPayload, id: string) {
    const visit = await prisma.visit.findUnique({ where: { id }, include: { invite: true } });
    if (!visit || !(await canManageResident(session, visit.invite.residentId))) throw new HttpError(404, 'Cadastro não encontrado.');
    return visit;
}

export async function approveVisit(session: SessionPayload, id: string): Promise<Visit> {
    const visit = await ownVisit(session, id);

    // Trava contra clique duplo: só um pedido muda PENDING_APPROVAL para APPROVING.
    const claimed = await prisma.visit.updateMany({ where: { id, status: 'PENDING_APPROVAL' }, data: { status: 'APPROVING' } });
    if (claimed.count === 0) throw new HttpError(409, 'Este cadastro já foi decidido ou está em andamento.');

    const fail = async (message: string, status: number): Promise<never> => {
        await prisma.visit.update({ where: { id }, data: { status: 'PENDING_APPROVAL', hikError: message.slice(0, 300) } });
        throw new HttpError(status, message);
    };

    const towers = visit.invite.towers ? visit.invite.towers.split(',') : [];
    let levelId: string | undefined;
    try {
        levelId = await pickLevelForTowers(towers);
    } catch (err: any) {
        return fail(`Não foi possível consultar os níveis de acesso: ${err.message}`, 502);
    }
    if (!levelId) {
        return fail('Nenhum nível de acesso de visitante está configurado no HikCentral para esta torre.', 409);
    }

    let payload: Record<string, unknown>;
    try {
        payload = buildVisitorAppointmentPayload({
            givenName: visit.name,
            familyName: visit.surname,
            visitStartTime: visit.visitStart,
            visitEndTime: visit.visitEnd,
            receptionistId: visit.invite.residentId,
            accessLevelIds: [levelId],
            faceBase64: visit.faceJpeg?.toString('base64'),
            documentPhotoBase64: visit.documentJpeg?.toString('base64'),
            certificateNo: visit.document ?? undefined,
            phoneNo: visit.phone,
            email: visit.email ?? undefined,
            plateNo: visit.plate ?? undefined,
            companyName: visit.company ?? undefined,
            visitorType: visit.invite.type,
            remark: `Convite de ${visit.invite.residentName}`,
        });
    } catch (err: any) {
        return fail(err.message, 400);
    }

    try {
        const created = await createAppointment(payload);
        await rememberVisitor(visit).catch((err) => console.error('[invites] visitante salvo:', err.message));
        return await prisma.visit.update({
            where: { id },
            data: {
                status: 'APPROVED',
                hikVisitorId: created.visitorId,
                hikAppointRecordId: created.appointRecordId,
                hikError: null,
                decidedAt: new Date(),
                // O HikCentral já tem as fotos; não guardamos mais cópia aqui.
                faceJpeg: null,
                documentJpeg: null,
            },
        });
    } catch (err: any) {
        return fail(`O HikCentral recusou o cadastro: ${err.message}`, 502);
    }
}

export async function rejectVisit(session: SessionPayload, id: string, reason?: string): Promise<Visit> {
    await ownVisit(session, id);
    const res = await prisma.visit.updateMany({
        where: { id, status: 'PENDING_APPROVAL' },
        data: { status: 'REJECTED', rejectReason: reason?.trim().slice(0, 200) || null, decidedAt: new Date(), faceJpeg: null, documentJpeg: null },
    });
    if (res.count === 0) throw new HttpError(409, 'Este cadastro já foi decidido ou está em andamento.');
    return prisma.visit.findUniqueOrThrow({ where: { id } });
}

/** Cancela uma visita já aprovada e remove o agendamento (e o acesso) no HikCentral. */
export async function cancelVisit(session: SessionPayload, id: string): Promise<Visit> {
    const visit = await ownVisit(session, id);
    if (visit.status !== 'APPROVED') throw new HttpError(409, 'Só visitas aprovadas podem ser canceladas.');
    if (visit.hikAppointRecordId) {
        try {
            await deleteAppointment(visit.hikAppointRecordId);
        } catch (err: any) {
            throw new HttpError(502, `O HikCentral não removeu o agendamento: ${err.message}`);
        }
    }
    return prisma.visit.update({ where: { id }, data: { status: 'CANCELLED', decidedAt: new Date() } });
}

// ---------- listagens ----------

export async function listInvites(session: SessionPayload) {
    const invites = await prisma.invite.findMany({
        where: { residentId: { in: await visibleResidentIds(session) } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { visit: { select: { id: true, name: true, surname: true, status: true } } },
    });
    return invites.map((i) => ({
        id: i.id,
        mine: i.residentId === session.sub,
        owner: i.residentName,
        type: i.type,
        label: i.label,
        allowVehicle: i.allowVehicle,
        validFrom: dayInTz(i.validFrom),
        validUntil: dayInTz(i.validUntil),
        state: inviteState(i),
        link: inviteLink(i.token),
        visit: i.visit,
    }));
}

export async function listVisits(session: SessionPayload, status?: string) {
    const visits = await prisma.visit.findMany({
        where: { invite: { residentId: { in: await visibleResidentIds(session) } }, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { invite: { select: { type: true, label: true, allowVehicle: true, residentId: true, residentName: true } } },
    });
    return visits.map((v) => ({
        id: v.id,
        mine: v.invite.residentId === session.sub,
        owner: v.invite.residentName,
        status: v.status,
        type: v.invite.type,
        label: v.invite.label,
        name: v.name,
        surname: v.surname,
        phone: v.phone,
        email: v.email,
        document: v.document,
        company: v.company,
        plate: v.plate,
        visitDate: v.visitDate,
        createdAt: v.createdAt,
        rejectReason: v.rejectReason,
        hikError: v.hikError,
        hasFace: !!v.faceJpeg,
        hasDocument: !!v.documentJpeg,
    }));
}

export async function visitPhoto(session: SessionPayload, id: string, kind: 'face' | 'document'): Promise<Buffer | null> {
    const visit = await ownVisit(session, id);
    const blob = kind === 'face' ? visit.faceJpeg : visit.documentJpeg;
    return blob ? Buffer.from(blob) : null;
}

export type { Resident };
