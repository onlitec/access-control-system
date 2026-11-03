import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { requestLoginCode, verifyLoginCode } from '../auth/codes';
import { setPassword, validateNewPassword, verifyPassword } from '../auth/password';
import { issueSession, requireResident, SessionPayload } from '../auth/session';
import { findResidentByCpf } from '../hikcentral/residents';
import { isValidCpf, onlyDigits } from '../utils/cpf';

const router = Router();

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test', // os testes fazem dezenas de chamadas seguidas
    message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
});

const BAD_LOGIN = 'CPF ou senha inválidos.';
const CHALLENGE_MIN = 10;

/** Prova de que a senha já foi aceita; só vale junto com o código da 2ª etapa. */
const issueChallenge = (cpf: string) => jwt.sign({ typ: 'mfa', cpf }, config.jwtSecret, { expiresIn: `${CHALLENGE_MIN}m` });

function readChallenge(token: unknown): string | null {
    try {
        const p = jwt.verify(String(token), config.jwtSecret) as { typ?: string; cpf?: string };
        return p.typ === 'mfa' && p.cpf ? p.cpf : null;
    } catch {
        return null;
    }
}

// 1ª etapa: CPF + senha. Se estiver certo, envia o código (2ª etapa) para o contato do HikCentral.
router.post('/login', limiter, async (req, res) => {
    const { cpf: cpfInput, password } = req.body ?? {};
    const cpf = onlyDigits(String(cpfInput ?? ''));
    if (!isValidCpf(cpf) || typeof password !== 'string' || !password) {
        res.status(401).json({ error: BAD_LOGIN });
        return;
    }
    try {
        const result = await verifyPassword(cpf, password);
        if (result === 'locked') {
            res.status(429).json({ error: 'Muitas tentativas erradas. Tente novamente em 15 minutos ou redefina a senha.' });
            return;
        }
        if (result !== 'ok') {
            res.status(401).json({ error: BAD_LOGIN });
            return;
        }
        const resident = await findResidentByCpf(cpf);
        if (!resident) {
            res.status(401).json({ error: BAD_LOGIN });
            return;
        }
        if (!resident.phoneE164 && !resident.email) {
            res.status(409).json({ error: 'Seu cadastro no condomínio não tem e-mail nem celular. Procure a administração.' });
            return;
        }
        await requestLoginCode(cpf);
        res.json({ challenge: issueChallenge(cpf), message: 'Enviamos um código para o contato cadastrado.' });
    } catch (err: any) {
        console.error('[auth] login:', err.message);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

// Reenvio do código da 2ª etapa (a senha já foi aceita).
router.post('/resend-code', limiter, async (req, res) => {
    const cpf = readChallenge(req.body?.challenge);
    if (!cpf) {
        res.status(401).json({ error: 'Sessão de login vencida. Comece de novo.' });
        return;
    }
    const channel = req.body?.channel === 'email' || req.body?.channel === 'whatsapp' ? req.body.channel : undefined;
    await requestLoginCode(cpf, channel).catch((err) => console.error('[auth] resend-code:', err.message));
    res.json({ message: 'Se for possível, enviamos um novo código (um por minuto).' });
});

// 2ª etapa: código.
router.post('/verify-code', limiter, async (req, res) => {
    const cpf = readChallenge(req.body?.challenge);
    const { code } = req.body ?? {};
    if (!cpf || typeof code !== 'string') {
        res.status(401).json({ error: 'Sessão de login vencida. Comece de novo.' });
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

// Primeiro acesso e "esqueci a senha": o código vai só para o e-mail cadastrado no HikCentral.
router.post('/password/request', limiter, async (req, res) => {
    const { cpf } = req.body ?? {};
    if (typeof cpf !== 'string') {
        res.status(400).json({ error: 'Informe o CPF.' });
        return;
    }
    await requestLoginCode(cpf, undefined, 'RESET').catch((err) => console.error('[auth] password/request:', err.message));
    res.json({ message: 'Se o CPF estiver cadastrado e tiver e-mail no cadastro do condomínio, enviamos um código para esse e-mail.' });
});

router.post('/password/confirm', limiter, async (req, res) => {
    const { cpf: cpfInput, code, password } = req.body ?? {};
    const cpf = onlyDigits(String(cpfInput ?? ''));
    if (typeof code !== 'string') {
        res.status(400).json({ error: 'Informe o CPF, o código e a nova senha.' });
        return;
    }
    try {
        validateNewPassword(password, cpf);
    } catch (err: any) {
        res.status(err.status ?? 400).json({ error: err.message });
        return;
    }
    try {
        const resident = await verifyLoginCode(cpf, code, 'RESET');
        if (!resident) {
            res.status(401).json({ error: 'Código inválido ou vencido.' });
            return;
        }
        await setPassword(cpf, resident.hikPersonId, password);
        res.json({ message: 'Senha cadastrada. Agora entre com o CPF e a senha.' });
    } catch (err: any) {
        console.error('[auth] password/confirm:', err.message);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

router.get('/me', requireResident, (req, res) => {
    const { sub, name, towers } = (req as any).resident as SessionPayload;
    res.json({ id: sub, name, towers });
});

export default router;
