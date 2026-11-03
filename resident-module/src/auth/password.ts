import crypto from 'crypto';
import { prisma } from '../db';
import { HttpError } from '../invites/errors';

export const MAX_FAILED = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const MIN_LENGTH = 8;

const KEY_LEN = 64;

export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, KEY_LEN);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function checkPassword(password: string, stored: string): boolean {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
}

// Hash de mentira para gastar o mesmo tempo quando o CPF não tem senha (não revela quem tem conta).
const DUMMY = hashPassword('dummy-password-0');

/** Regras simples: 8+ caracteres, com letra e número, e diferente do CPF. */
export function validateNewPassword(password: unknown, cpf: string): string {
    if (typeof password !== 'string' || password.length < MIN_LENGTH) {
        throw new HttpError(400, `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
    }
    if (password.length > 128) throw new HttpError(400, 'A senha é longa demais.');
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        throw new HttpError(400, 'Use letras e números na senha.');
    }
    if (password.replace(/\D/g, '') === cpf) throw new HttpError(400, 'A senha não pode ser o seu CPF.');
    return password;
}

export async function setPassword(cpf: string, hikPersonId: string, password: string): Promise<void> {
    const passwordHash = hashPassword(password);
    await prisma.residentCredential.upsert({
        where: { cpf },
        create: { cpf, hikPersonId, passwordHash },
        update: { hikPersonId, passwordHash, failedAttempts: 0, lockedUntil: null, passwordChangedAt: new Date() },
    });
}

export type PasswordResult = 'ok' | 'invalid' | 'locked';

/** Confere a senha. Sem senha cadastrada, ou senha errada, o resultado é igual: 'invalid'. */
export async function verifyPassword(cpf: string, password: string): Promise<PasswordResult> {
    const cred = await prisma.residentCredential.findUnique({ where: { cpf } });
    if (!cred) {
        checkPassword(password, DUMMY);
        return 'invalid';
    }
    if (cred.lockedUntil && cred.lockedUntil > new Date()) return 'locked';

    if (checkPassword(password, cred.passwordHash)) {
        if (cred.failedAttempts > 0 || cred.lockedUntil) {
            await prisma.residentCredential.update({ where: { cpf }, data: { failedAttempts: 0, lockedUntil: null } });
        }
        return 'ok';
    }
    const failed = cred.failedAttempts + 1;
    await prisma.residentCredential.update({
        where: { cpf },
        data: failed >= MAX_FAILED
            ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
            : { failedAttempts: failed },
    });
    return failed >= MAX_FAILED ? 'locked' : 'invalid';
}

export const hasPassword = async (cpf: string) => !!(await prisma.residentCredential.findUnique({ where: { cpf }, select: { cpf: true } }));
