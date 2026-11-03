import { FamilyLink } from '@prisma/client';
import { prisma } from '../db';
import { SessionPayload } from '../auth/session';
import { HttpError } from './errors';
import { findResidentByCpf } from '../hikcentral/residents';
import { pickDestination, sendText } from '../notify/notifier';
import { isValidCpf, onlyDigits } from '../utils/cpf';

export const MAX_OPEN_REQUESTS = 10;

/** Moradores cujos convites este morador enxerga e decide: ele mesmo e os membros que aceitaram. */
export async function visibleResidentIds(session: SessionPayload): Promise<string[]> {
    const links = await prisma.familyLink.findMany({
        where: { responsibleId: session.sub, status: 'ACTIVE' },
        select: { memberId: true },
    });
    return [session.sub, ...links.map((l) => l.memberId)];
}

export async function canManageResident(session: SessionPayload, ownerId: string): Promise<boolean> {
    if (ownerId === session.sub) return true;
    const link = await prisma.familyLink.findFirst({ where: { responsibleId: session.sub, memberId: ownerId, status: 'ACTIVE' } });
    return !!link;
}

/**
 * O responsável pede para vincular um familiar pelo CPF. A resposta é a mesma exista ou não o CPF,
 * para não servir de consulta de moradores; o familiar recebe o pedido e precisa aceitar.
 */
export async function requestFamilyLink(session: SessionPayload, cpfInput: string): Promise<void> {
    const cpf = onlyDigits(cpfInput);
    if (!isValidCpf(cpf)) throw new HttpError(400, 'CPF inválido.');

    const open = await prisma.familyLink.count({ where: { responsibleId: session.sub, status: 'PENDING' } });
    if (open >= MAX_OPEN_REQUESTS) throw new HttpError(429, 'Há pedidos demais aguardando resposta.');

    const member = await findResidentByCpf(cpf);
    if (!member || member.hikPersonId === session.sub) return;

    const existing = await prisma.familyLink.findUnique({
        where: { responsibleId_memberId: { responsibleId: session.sub, memberId: member.hikPersonId } },
    });
    if (existing && existing.status !== 'REJECTED') return;

    await prisma.familyLink.upsert({
        where: { responsibleId_memberId: { responsibleId: session.sub, memberId: member.hikPersonId } },
        create: { responsibleId: session.sub, responsibleName: session.name, memberId: member.hikPersonId, memberName: member.name },
        update: { status: 'PENDING', responsibleName: session.name, memberName: member.name, decidedAt: null, createdAt: new Date() },
    });

    const dest = pickDestination(member.phoneE164, member.email);
    if (dest) {
        void sendText(
            dest,
            `${session.name} quer vincular você como familiar no app do morador. Entre no app para aceitar ou recusar.`,
            'Pedido de vínculo familiar',
        ).catch((err) => console.error('[family] aviso ao familiar:', err.message));
    }
}

const brief = (l: FamilyLink, other: 'responsible' | 'member') => ({
    id: l.id,
    name: other === 'responsible' ? l.responsibleName : l.memberName,
});

export async function listFamily(session: SessionPayload) {
    const [asResponsible, asMember] = await Promise.all([
        prisma.familyLink.findMany({ where: { responsibleId: session.sub }, orderBy: { createdAt: 'desc' } }),
        prisma.familyLink.findMany({ where: { memberId: session.sub }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
        members: asResponsible.filter((l) => l.status === 'ACTIVE').map((l) => brief(l, 'member')),
        waitingAnswer: asResponsible.filter((l) => l.status === 'PENDING').map((l) => brief(l, 'member')),
        responsibles: asMember.filter((l) => l.status === 'ACTIVE').map((l) => brief(l, 'responsible')),
        requests: asMember.filter((l) => l.status === 'PENDING').map((l) => brief(l, 'responsible')),
    };
}

export async function answerFamilyRequest(session: SessionPayload, id: string, accept: boolean): Promise<void> {
    const res = await prisma.familyLink.updateMany({
        where: { id, memberId: session.sub, status: 'PENDING' },
        data: { status: accept ? 'ACTIVE' : 'REJECTED', decidedAt: new Date() },
    });
    if (res.count === 0) throw new HttpError(404, 'Pedido não encontrado.');
}

/** Qualquer um dos dois lados pode desfazer o vínculo. */
export async function removeFamilyLink(session: SessionPayload, id: string): Promise<void> {
    const res = await prisma.familyLink.deleteMany({
        where: { id, OR: [{ responsibleId: session.sub }, { memberId: session.sub }] },
    });
    if (res.count === 0) throw new HttpError(404, 'Vínculo não encontrado.');
}

