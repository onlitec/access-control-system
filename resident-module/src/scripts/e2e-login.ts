import fs from 'fs';
import { setPassword } from '../auth/password';
import { findResidentByCpf } from '../hikcentral/residents';

type Call = (method: string, path: string, body?: unknown, token?: string) => Promise<{ status: number; data: any }>;

const PASSWORD = 'E2eSenha123';

/**
 * Login de teste ponta a ponta: grava uma senha direto no banco (os moradores do dev quase não têm e-mail,
 * que o fluxo de primeiro acesso exige), faz CPF + senha e lê o código da 2ª etapa no log do servidor
 * (NOTIFY_MODE=console). O servidor e este script precisam usar o mesmo DATABASE_URL.
 */
export async function loginAs(call: Call, cpf: string, serverLog: string): Promise<string> {
    const resident = await findResidentByCpf(cpf);
    if (!resident) throw new Error('morador não encontrado no HikCentral');
    await setPassword(cpf, resident.hikPersonId, PASSWORD);

    const before = fs.readFileSync(serverLog, 'utf8').length;
    const step1 = await call('POST', '/api/auth/login', { cpf, password: PASSWORD });
    if (!step1.data.challenge) throw new Error(`senha recusada: ${step1.status} ${step1.data.error ?? ''}`);
    await new Promise((s) => setTimeout(s, 600));
    const codes = [...fs.readFileSync(serverLog, 'utf8').slice(before).matchAll(/é (\d{6})\./g)];
    const step2 = await call('POST', '/api/auth/verify-code', { challenge: step1.data.challenge, code: codes[codes.length - 1]?.[1] ?? '' });
    if (!step2.data.token) throw new Error('código recusado: ' + step2.status);
    return step2.data.token;
}
