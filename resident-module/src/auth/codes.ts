import crypto from 'crypto';
import { prisma } from '../db';
import { config } from '../config';
import { findResidentByCpf, Resident } from '../hikcentral/residents';
import { Channel, pickDestination, sendLoginCode } from '../notify/notifier';
import { isValidCpf, onlyDigits } from '../utils/cpf';

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MIN_INTERVAL_MS = 60 * 1000;
export const MAX_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;

export const generateCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

export const hashCode = (cpf: string, code: string) =>
    crypto.createHmac('sha256', config.jwtSecret).update(`${cpf}:${code}`).digest('hex');

function safeEqualHex(a: string, b: string): boolean {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Pede um código de login. O resultado para quem chama é sempre o mesmo
 * (exista ou não o CPF), para a API não servir de consulta de moradores.
 */
export async function requestLoginCode(cpfInput: string, preferred?: Channel): Promise<void> {
    const cpf = onlyDigits(cpfInput);
    if (!isValidCpf(cpf)) return;

    const resident = await findResidentByCpf(cpf);
    if (!resident) return;
    const dest = pickDestination(resident.phoneE164, resident.email, preferred);
    if (!dest) {
        console.warn(`[auth] morador ${resident.hikPersonId} sem telefone nem e-mail no HikCentral`);
        return;
    }

    const now = Date.now();
    const recent = await prisma.loginCode.findMany({
        where: { cpf, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
        orderBy: { createdAt: 'desc' },
    });
    if (recent.length >= MAX_PER_HOUR) return;
    if (recent[0] && now - recent[0].createdAt.getTime() < MIN_INTERVAL_MS) return;

    const code = generateCode();
    await prisma.loginCode.create({
        data: {
            cpf,
            hikPersonId: resident.hikPersonId,
            codeHash: hashCode(cpf, code),
            channel: dest.channel,
            expiresAt: new Date(now + CODE_TTL_MS),
        },
    });
    try {
        await sendLoginCode(dest, code);
    } catch (err: any) {
        console.error(`[auth] falha ao enviar código (${dest.channel}):`, err.message);
    }
}

/** Confere o código e devolve o morador, ou null se for inválido, vencido ou já usado. */
export async function verifyLoginCode(cpfInput: string, codeInput: string): Promise<Resident | null> {
    const cpf = onlyDigits(cpfInput);
    const code = onlyDigits(codeInput);
    if (!isValidCpf(cpf) || code.length !== 6) return null;

    const entry = await prisma.loginCode.findFirst({
        where: { cpf, usedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
    });
    if (!entry || entry.attempts >= MAX_ATTEMPTS) return null;

    const ok = safeEqualHex(entry.codeHash, hashCode(cpf, code));
    await prisma.loginCode.update({
        where: { id: entry.id },
        data: ok ? { usedAt: new Date(), attempts: { increment: 1 } } : { attempts: { increment: 1 } },
    });
    return ok ? findResidentByCpf(cpf) : null;
}
