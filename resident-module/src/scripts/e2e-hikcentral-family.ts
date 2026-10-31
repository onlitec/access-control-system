/**
 * Ponta a ponta da fase 3 contra um HikCentral de TESTE: vínculo de família (pedido e aceite), aprovação
 * feita pelo responsável, visitante salvo e convite de novo sem novo cadastro. Apaga tudo no fim.
 * Mesmos pré-requisitos de e2e-hikcentral.ts (servidor em NOTIFY_MODE=console, E2E_SERVER_LOG, E2E_FACE_B64).
 */
import fs from 'fs';
import { hikPost } from '../hikcentral/client';
import { normalizePerson } from '../hikcentral/residents';

const base = process.env.E2E_BASE || 'http://127.0.0.1:4199';
const serverLog = process.env.E2E_SERVER_LOG || '';
const face = process.env.E2E_FACE_B64 || '';
const log = (...a: unknown[]) => console.log(...a);

async function call(method: string, path: string, body?: unknown, token?: string) {
    const res = await fetch(base + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data: any = res.status === 204 ? null : await res.json().catch(() => ({}));
    return { status: res.status, data };
}

async function login(cpf: string): Promise<string> {
    await call('POST', '/api/auth/request-code', { cpf });
    await new Promise((s) => setTimeout(s, 600));
    const codes = [...fs.readFileSync(serverLog, 'utf8').matchAll(/é (\d{6})\./g)];
    const res = await call('POST', '/api/auth/verify-code', { cpf, code: codes[codes.length - 1]?.[1] ?? '' });
    if (!res.data.token) throw new Error('login falhou: ' + res.status);
    return res.data.token;
}

const day = (n: number) => new Date(Date.now() + n * 864e5 - 3 * 3600e3).toISOString().slice(0, 10);
const e2eAppointments = async () => {
    const r = await hikPost('/artemis/api/visitor/v1/appointment/appointmentlist', {
        pageNo: 1, pageSize: 50, appointStartTime: `${day(0)}T00:00:00-03:00`,
        appointEndTime: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 19) + '+00:00', visitorName: 'Teste', appointState: -1,
    });
    return (r.data?.list ?? []).filter((x: any) => JSON.stringify(x).includes('E2E Familia'));
};

async function main() {
    if (!serverLog || !face) throw new Error('Defina E2E_SERVER_LOG e E2E_FACE_B64.');
    const list = await hikPost('/artemis/api/resource/v1/person/personList', { pageNo: 1, pageSize: 500 });
    const people = (list.data?.list ?? []).map(normalizePerson).filter((p: any) => p.cpf && p.phoneE164);
    if (people.length < 2) throw new Error('precisa de dois moradores com CPF e telefone');
    const [resp, member] = people;
    const tA = await login(resp.cpf);
    const tB = await login(member.cpf);
    log('logins: ok');

    log('pedido de vínculo:', (await call('POST', '/api/family', { cpf: member.cpf }, tA)).status);
    const reqs = (await call('GET', '/api/family', undefined, tB)).data.requests;
    log('familiar vê o pedido:', reqs.length);
    log('responsável antes do aceite vê convites do familiar:', (await call('GET', '/api/invites', undefined, tA)).data.length);
    log('aceite:', (await call('POST', `/api/family/${reqs[0].id}/accept`, undefined, tB)).status);

    const inv = await call('POST', '/api/invites', { label: 'E2E familia' }, tB);
    const token = (inv.data.link as string).split('/v/')[1];
    const reg = await call('POST', `/api/public/invite/${token}/register`, {
        name: 'Teste', surname: 'E2E Familia', phone: '11999990001', visitDate: day(0),
        faceBase64: face, documentBase64: face, lgpdConsent: true, saveConsent: true,
    });
    log('cadastro (convite do familiar):', reg.status);

    const pend = (await call('GET', '/api/visits?status=PENDING_APPROVAL', undefined, tA)).data;
    log('responsável vê o cadastro do familiar:', pend.length, '| mine:', pend[0]?.mine);
    const ap = await call('POST', `/api/visits/${pend[0].id}/approve`, undefined, tA);
    log('responsável aprova:', ap.status, ap.data.status ?? ap.data.error);
    const first = (await e2eAppointments())[0];
    log('visitado no HikCentral é o familiar:', first?.receptionistId === member.hikPersonId);

    const savedList = (await call('GET', '/api/saved-visitors', undefined, tB)).data;
    log('visitante salvo para o familiar:', savedList.length, '| para o responsável:', (await call('GET', '/api/saved-visitors', undefined, tA)).data.length);
    const again = await call('POST', `/api/saved-visitors/${savedList[0].id}/invite`, { visitDate: day(1) }, tB);
    log('convidar de novo sem cadastro:', again.status, again.data.status ?? again.data.error);
    log('agendamentos E2E no HikCentral:', (await e2eAppointments()).length);

    // limpeza
    for (const v of (await call('GET', '/api/visits', undefined, tB)).data.filter((x: any) => x.status === 'APPROVED')) {
        await call('POST', `/api/visits/${v.id}/cancel`, undefined, tA);
    }
    await call('DELETE', `/api/saved-visitors/${savedList[0].id}`, undefined, tB);
    const fam = (await call('GET', '/api/family', undefined, tA)).data.members[0];
    log('desfazer vínculo:', (await call('DELETE', `/api/family/${fam.id}`, undefined, tA)).status);
    log('restou no HikCentral:', (await e2eAppointments()).length);
}

main().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
