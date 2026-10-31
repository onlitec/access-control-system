import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { HttpError, findInviteByToken, inviteState, registerVisit, dayInTz } from '../invites/service';

const router = Router();

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Tente novamente mais tarde.' },
});

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** Dados mínimos para o formulário e a página de status; nada além do que o visitante já informou. */
router.get('/invite/:token', readLimiter, wrap(async (req, res) => {
    const invite = await findInviteByToken(req.params.token);
    if (!invite) throw new HttpError(404, 'Convite não encontrado.');
    const visit = invite.visit;
    res.set('Cache-Control', 'no-store').json({
        state: inviteState(invite),
        type: invite.type,
        residentName: invite.residentName.split(' ')[0],
        allowVehicle: invite.allowVehicle,
        validFrom: dayInTz(invite.validFrom),
        validUntil: dayInTz(invite.validUntil),
        visit: visit
            ? {
                status: visit.status === 'APPROVING' ? 'PENDING_APPROVAL' : visit.status,
                name: visit.name,
                visitDate: visit.visitDate,
                rejectReason: visit.status === 'REJECTED' ? visit.rejectReason : null,
            }
            : null,
    });
}));

router.post('/invite/:token/register', writeLimiter, wrap(async (req, res) => {
    const visit = await registerVisit(req.params.token, req.body ?? {});
    res.status(201).json({ status: visit.status });
}));

export default router;
