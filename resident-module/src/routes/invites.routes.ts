import { Router, Request, Response, NextFunction } from 'express';
import { requireResident, SessionPayload } from '../auth/session';
import {
    HttpError, approveVisit, cancelInvite, cancelVisit, createInvite, inviteLink,
    listInvites, listVisits, rejectVisit, sendInviteLink, visitPhoto,
} from '../invites/service';
import { answerFamilyRequest, listFamily, removeFamilyLink, requestFamilyLink } from '../invites/family';
import { forgetSavedVisitor, listSavedVisitors, reinviteSavedVisitor } from '../invites/saved';

import { pushEnabled, removeSubscription, saveSubscription } from '../push';
import { config } from '../config';

const router = Router();
router.use(requireResident);

const session = (req: Request) => (req as any).resident as SessionPayload;
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

router.get('/invites', wrap(async (req, res) => {
    res.json(await listInvites(session(req)));
}));

router.post('/invites', wrap(async (req, res) => {
    const body = req.body ?? {};
    const invite = await createInvite(session(req), body);
    let sent = false;
    if (typeof body.recipient === 'string' && body.recipient.trim()) {
        try {
            sent = await sendInviteLink(invite, body.recipient, { name: session(req).name });
        } catch (err: any) {
            console.error('[invites] envio do link:', err.message);
        }
    }
    res.status(201).json({ id: invite.id, link: inviteLink(invite.token), sent });
}));

router.delete('/invites/:id', wrap(async (req, res) => {
    await cancelInvite(session(req), req.params.id);
    res.status(204).end();
}));

router.get('/visits', wrap(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(await listVisits(session(req), status));
}));

router.get('/visits/:id/photo/:kind', wrap(async (req, res) => {
    const kind = req.params.kind === 'face' ? 'face' : req.params.kind === 'document' ? 'document' : null;
    if (!kind) throw new HttpError(404, 'Foto não encontrada.');
    const photo = await visitPhoto(session(req), req.params.id, kind);
    if (!photo) throw new HttpError(404, 'Foto não encontrada.');
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' }).send(photo);
}));

router.post('/visits/:id/approve', wrap(async (req, res) => {
    const v = await approveVisit(session(req), req.params.id);
    res.json({ id: v.id, status: v.status });
}));

router.post('/visits/:id/reject', wrap(async (req, res) => {
    const v = await rejectVisit(session(req), req.params.id, typeof req.body?.reason === 'string' ? req.body.reason : undefined);
    res.json({ id: v.id, status: v.status });
}));

router.post('/visits/:id/cancel', wrap(async (req, res) => {
    const v = await cancelVisit(session(req), req.params.id);
    res.json({ id: v.id, status: v.status });
}));

// ---------- visitantes salvos ----------

router.get('/saved-visitors', wrap(async (req, res) => {
    res.json(await listSavedVisitors(session(req)));
}));

router.post('/saved-visitors/:id/invite', wrap(async (req, res) => {
    const v = await reinviteSavedVisitor(session(req), req.params.id, req.body?.visitDate);
    res.status(201).json({ id: v.id, status: v.status });
}));

router.delete('/saved-visitors/:id', wrap(async (req, res) => {
    await forgetSavedVisitor(session(req), req.params.id);
    res.status(204).end();
}));

// ---------- família ----------

router.get('/family', wrap(async (req, res) => {
    res.json(await listFamily(session(req)));
}));

router.post('/family', wrap(async (req, res) => {
    if (typeof req.body?.cpf !== 'string') throw new HttpError(400, 'Informe o CPF do familiar.');
    await requestFamilyLink(session(req), req.body.cpf);
    res.status(202).json({ message: 'Se o CPF estiver cadastrado, o familiar recebeu o pedido e precisa aceitar.' });
}));

router.post('/family/:id/accept', wrap(async (req, res) => {
    await answerFamilyRequest(session(req), req.params.id, true);
    res.status(204).end();
}));

router.post('/family/:id/reject', wrap(async (req, res) => {
    await answerFamilyRequest(session(req), req.params.id, false);
    res.status(204).end();
}));

router.delete('/family/:id', wrap(async (req, res) => {
    await removeFamilyLink(session(req), req.params.id);
    res.status(204).end();
}));

router.get('/push/key', (_req, res) => {
    res.json({ enabled: pushEnabled(), publicKey: pushEnabled() ? config.vapid.publicKey : null });
});

router.post('/push/subscribe', wrap(async (req, res) => {
    if (!pushEnabled()) throw new HttpError(503, 'Notificações não estão ativas neste servidor.');
    try {
        await saveSubscription(session(req).sub, req.body ?? {}, req.get('user-agent') || undefined);
    } catch (err: any) {
        throw new HttpError(400, err.message);
    }
    res.status(204).end();
}));

router.post('/push/unsubscribe', wrap(async (req, res) => {
    if (typeof req.body?.endpoint === 'string') await removeSubscription(session(req).sub, req.body.endpoint);
    res.status(204).end();
}));

export default router;
