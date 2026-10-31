import { Router, Request, Response, NextFunction } from 'express';
import { requireResident, SessionPayload } from '../auth/session';
import {
    HttpError, approveVisit, cancelInvite, cancelVisit, createInvite, inviteLink,
    listInvites, listVisits, rejectVisit, sendInviteLink, visitPhoto,
} from '../invites/service';

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

export default router;
