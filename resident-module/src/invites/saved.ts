import crypto from 'crypto';
import { prisma } from '../db';
import { config } from '../config';
import { SessionPayload } from '../auth/session';
import { HttpError } from './errors';
import { approveVisit, dayInTz, endOfDay, startOfDay } from './service';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listSavedVisitors(session: SessionPayload) {
    const saved = await prisma.savedVisitor.findMany({
        where: { residentId: session.sub },
        orderBy: { lastVisitAt: 'desc' },
        select: { id: true, type: true, name: true, surname: true, phone: true, company: true, plate: true, lastVisitAt: true },
    });
    return saved;
}

export async function forgetSavedVisitor(session: SessionPayload, id: string): Promise<void> {
    const res = await prisma.savedVisitor.deleteMany({ where: { id, residentId: session.sub } });
    if (res.count === 0) throw new HttpError(404, 'Visitante não encontrado.');
}

/**
 * Convida de novo um visitante salvo sem novo cadastro: cria o convite já usado e o cadastro com as
 * fotos guardadas, e segue direto para a aprovação (quem pede é o próprio morador).
 * Se o HikCentral recusar, o cadastro fica pendente com o motivo para tentar de novo.
 */
export async function reinviteSavedVisitor(session: SessionPayload, id: string, visitDate: unknown) {
    const saved = await prisma.savedVisitor.findFirst({ where: { id, residentId: session.sub } });
    if (!saved) throw new HttpError(404, 'Visitante não encontrado.');

    const today = dayInTz(new Date());
    if (typeof visitDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(visitDate) || Number.isNaN(Date.parse(visitDate))) {
        throw new HttpError(400, 'Informe a data da visita.');
    }
    if (visitDate < today) throw new HttpError(400, 'A data da visita não pode estar no passado.');
    if (Date.parse(visitDate) - Date.parse(today) > 90 * DAY_MS) throw new HttpError(400, 'Escolha uma data nos próximos 90 dias.');

    const dayStart = startOfDay(visitDate);
    const visit = await prisma.$transaction(async (tx) => {
        const invite = await tx.invite.create({
            data: {
                token: crypto.randomBytes(24).toString('base64url'),
                residentId: session.sub,
                residentName: session.name,
                towers: session.towers.join(','),
                type: saved.type,
                label: `${saved.name} ${saved.surname}`.slice(0, 80),
                allowVehicle: !!saved.plate,
                validFrom: dayStart,
                validUntil: endOfDay(visitDate),
                status: 'USED',
            },
        });
        return tx.visit.create({
            data: {
                inviteId: invite.id,
                name: saved.name,
                surname: saved.surname,
                phone: saved.phone,
                email: saved.email,
                document: saved.document,
                company: saved.company,
                plate: saved.plate,
                visitDate,
                visitStart: dayStart.getTime() < Date.now() ? new Date() : dayStart,
                visitEnd: endOfDay(visitDate),
                faceJpeg: saved.faceJpeg,
                documentJpeg: saved.documentJpeg,
                lgpdConsentAt: saved.consentAt,
                saveConsent: true,
            },
        });
    });
    return approveVisit(session, visit.id);
}

/** Apaga visitantes salvos sem visita há mais de SAVED_RETENTION_DAYS (LGPD: dados e fotos). */
export async function purgeStaleSavedVisitors(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - config.savedRetentionDays * DAY_MS);
    const res = await prisma.savedVisitor.deleteMany({ where: { lastVisitAt: { lt: cutoff } } });
    return res.count;
}
