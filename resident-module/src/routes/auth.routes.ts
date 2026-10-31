import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requestLoginCode, verifyLoginCode } from '../auth/codes';
import { issueSession, requireResident, SessionPayload } from '../auth/session';

const router = Router();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
});

router.post('/request-code', limiter, async (req, res) => {
    const { cpf, channel } = req.body ?? {};
    if (typeof cpf !== 'string') {
        res.status(400).json({ error: 'Informe o CPF.' });
        return;
    }
    try {
        await requestLoginCode(cpf, channel === 'email' || channel === 'whatsapp' ? channel : undefined);
    } catch (err: any) {
        console.error('[auth] request-code:', err.message);
    }
    res.json({ message: 'Se o CPF estiver cadastrado, enviamos um código para o contato registrado.' });
});

router.post('/verify-code', limiter, async (req, res) => {
    const { cpf, code } = req.body ?? {};
    if (typeof cpf !== 'string' || typeof code !== 'string') {
        res.status(400).json({ error: 'Informe o CPF e o código.' });
        return;
    }
    try {
        const resident = await verifyLoginCode(cpf, code);
        if (!resident) {
            res.status(401).json({ error: 'Código inválido ou vencido.' });
            return;
        }
        res.json({ token: issueSession(resident), resident: { id: resident.hikPersonId, name: resident.name, towers: resident.towers } });
    } catch (err: any) {
        console.error('[auth] verify-code:', err.message);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

router.get('/me', requireResident, (req, res) => {
    const { sub, name, towers } = (req as any).resident as SessionPayload;
    res.json({ id: sub, name, towers });
});

export default router;
