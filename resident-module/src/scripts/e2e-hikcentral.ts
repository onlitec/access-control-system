/**
 * Teste de ponta a ponta contra um HikCentral de TESTE: login do morador, convite, cadastro do
 * visitante, aprovação (cria o agendamento no HikCentral) e cancelamento (apaga o agendamento).
 * Não imprime CPF, telefone nem e-mail.
 *
 * Pré-requisitos: servidor rodando com NOTIFY_MODE=console e a saída gravada em E2E_SERVER_LOG
 * (o código de login é lido de lá); E2E_FACE_B64 com um JPEG de 10 a 100 KB em Base64.
 *   E2E_BASE=http://127.0.0.1:4199 E2E_SERVER_LOG=/caminho/servidor.log E2E_FACE_B64=... npm run e2e:hik
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

const listWindow = (today: string) => ({
    pageNo: 1, pageSize: 20, appointStartTime: `${today}T00:00:00-03:00`,
    appointEndTime: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 19) + '+00:00', visitorName: 'Teste', appointState: -1,
});

/** Campos que provam nível, placa e morador visitado; valores de pessoas aparecem só como preenchido/vazio. */
function pick(obj: any, path = '', out: Record<string, unknown> = {}): Record<string, unknown> {
    for (const [k, v] of Object.entries(obj ?? {})) {
        const p = path ? `${path}.${k}` : k;
        if (v && typeof v === 'object' && /^accessLevelList$/i.test(k)) out[p] = JSON.stringify(v);
        else if (v && typeof v === 'object') pick(v, p, out);
        else if (/level|plate|interview|receptionist|host|visitedperson/i.test(k)) out[p] = /name/i.test(k) ? (v ? 'preenchido' : 'vazio') : v;
    }
    return out;
}

async function main() {
    if (!serverLog || !face) throw new Error('Defina E2E_SERVER_LOG e E2E_FACE_B64.');
    const list = await hikPost('/artemis/api/resource/v1/person/personList', { pageNo: 1, pageSize: 500 });
    const r = (list.data?.list ?? []).map(normalizePerson).find((p: any) => p.cpf && p.phoneE164);
    if (!r) throw new Error('nenhum morador com CPF e telefone');

    await call('POST', '/api/auth/request-code', { cpf: r.cpf });
    await new Promise((s) => setTimeout(s, 600));
    const code = /é (\d{6})\./.exec(fs.readFileSync(serverLog, 'utf8'))?.[1] ?? '';
    const login = await call('POST', '/api/auth/verify-code', { cpf: r.cpf, code });
    if (!login.data.token) throw new Error('login falhou: ' + login.status);
    const token = login.data.token as string;
    log('login:', login.status, '| torres do morador:', r.towers.length);

    const inv = await call('POST', '/api/invites', { type: 'VISITOR', label: 'E2E teste', allowVehicle: true }, token);
    const t = (inv.data.link as string).split('/v/')[1];
    log('criar convite:', inv.status, '| link absoluto:', String(inv.data.link).startsWith('http'));
    log('convite público:', (await call('GET', `/api/public/invite/${t}`)).data.state);

    const today = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const reg = await call('POST', `/api/public/invite/${t}/register`, {
        name: 'Teste', surname: 'E2E Convite', phone: '11999990000', email: '', document: '', plate: 'tst-1a23',
        visitDate: today, faceBase64: face, documentBase64: face, lgpdConsent: true,
    });
    log('cadastro do visitante:', reg.status, reg.data.status ?? reg.data.error);
    log('reuso do convite:', (await call('POST', `/api/public/invite/${t}/register`, {})).status);
    log('status público:', (await call('GET', `/api/public/invite/${t}`)).data.visit?.status);

    const pend = await call('GET', '/api/visits?status=PENDING_APPROVAL', undefined, token);
    log('pendentes do morador:', pend.data.length);
    const id = pend.data[0].id as string;
    const ph = await fetch(`${base}/api/visits/${id}/photo/face`, { headers: { Authorization: `Bearer ${token}` } });
    log('foto para o morador:', ph.status, ph.headers.get('content-type'));
    log('foto sem login:', (await fetch(`${base}/api/visits/${id}/photo/face`)).status);

    const ap = await call('POST', `/api/visits/${id}/approve`, undefined, token);
    log('aprovar:', ap.status, ap.data.status ?? ap.data.error);
    log('status público:', (await call('GET', `/api/public/invite/${t}`)).data.visit?.status);

    const found = await hikPost('/artemis/api/visitor/v1/appointment/appointmentlist', listWindow(today));
    const rec = (found.data?.list ?? []).find((x: any) => JSON.stringify(x).includes('E2E'));
    log('no HikCentral:', rec ? JSON.stringify(pick(rec)) : 'agendamento não encontrado');

    const cancel = await call('POST', `/api/visits/${id}/cancel`, undefined, token);
    log('cancelar acesso:', cancel.status, cancel.data.status ?? cancel.data.error);
    const after = await hikPost('/artemis/api/visitor/v1/appointment/appointmentlist', listWindow(today));
    log('restou no HikCentral:', (after.data?.list ?? []).filter((x: any) => JSON.stringify(x).includes('E2E')).length);
}

main().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
