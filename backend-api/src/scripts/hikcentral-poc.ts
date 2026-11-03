/**
 * Prova de conceito da OpenAPI do HikCentral Professional 3.1.1 (Fase 0).
 *
 * Não usa o banco: lê as credenciais das variáveis de ambiente.
 *   HIK_HOST        ex.: https://dev.exemplo.com.br  (com porta, se não for 443)
 *   HIK_APP_KEY     chave do parceiro de integração
 *   HIK_APP_SECRET  segredo do parceiro de integração
 *   HIK_USER_ID     opcional, usuário do cabeçalho userId (padrão: admin)
 *
 * Uso:
 *   npx tsx src/scripts/hikcentral-poc.ts            # só leitura
 *   npx tsx src/scripts/hikcentral-poc.ts --write    # cria e apaga um visitante de teste
 *   npx tsx src/scripts/hikcentral-poc.ts --write --face=foto.jpg --tower="Torre 1"
 */
import crypto from 'crypto';
import fs from 'fs';
import fetch from 'node-fetch';
import { buildVisitorAppointmentPayload, pickVisitorAccessLevelForTower } from '../services/hikcentralVisitorAppointment';

const HOST = (process.env.HIK_HOST || '').replace(/\/+$/, '');
const APP_KEY = process.env.HIK_APP_KEY || '';
const APP_SECRET = process.env.HIK_APP_SECRET || '';
const USER_ID = process.env.HIK_USER_ID || 'admin';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const argValue = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

async function call(path: string, body: unknown) {
    const json = JSON.stringify(body);
    const headers: Record<string, string> = {
        Accept: '*/*',
        'Content-Type': 'application/json',
        'Content-MD5': crypto.createHash('md5').update(json, 'utf8').digest('base64'),
        'X-Ca-Key': APP_KEY,
        'X-Ca-Timestamp': Date.now().toString(),
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
        userId: USER_ID,
    };
    const stringToSign = [
        'POST',
        headers.Accept,
        headers['Content-MD5'],
        headers['Content-Type'],
        // Sem cabeçalho Date: o guia manda omitir a linha (e não deixar uma linha vazia).
        `x-ca-key:${headers['X-Ca-Key']}`,
        `x-ca-timestamp:${headers['X-Ca-Timestamp']}`,
        path,
    ].join('\n');
    headers['X-Ca-Signature'] = crypto.createHmac('sha256', APP_SECRET).update(stringToSign, 'utf8').digest('base64');

    const res = await fetch(`${HOST}${path}`, { method: 'POST', headers, body: json });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
    const ok = res.ok && String(data?.code) === '0';
    console.log(`${ok ? 'OK   ' : 'FALHA'} ${path} -> HTTP ${res.status}, code ${data?.code ?? '-'} ${data?.msg ?? ''}`);
    return { ok, data };
}

async function main() {
    if (!HOST || !APP_KEY || !APP_SECRET) {
        console.error('Defina HIK_HOST, HIK_APP_KEY e HIK_APP_SECRET.');
        process.exit(1);
    }

    console.log(`\n== Leitura (${HOST})`);
    const orgs = await call('/artemis/api/resource/v1/org/orgList', { pageNo: 1, pageSize: 20 });
    console.log(`   organizações: ${orgs.data?.data?.total ?? '?'}`);
    const persons = await call('/artemis/api/resource/v1/person/personList', { pageNo: 1, pageSize: 5 });
    console.log(`   pessoas: ${persons.data?.data?.total ?? '?'}`);
    const acs = await call('/artemis/api/acs/v1/privilege/group', { pageNo: 1, pageSize: 100, type: 1 });
    for (const g of acs.data?.data?.list || []) console.log(`   nível de acesso: ${g.privilegeGroupId} ${g.privilegeGroupName}`);
    const vis = await call('/artemis/api/acs/v1/privilege/group', { pageNo: 1, pageSize: 100, type: 2 });
    const visitorLevels = vis.data?.data?.list || [];
    if (!(acs.data?.data?.list || []).length && !visitorLevels.length) {
        console.log('   nenhum nível de acesso visível para este usuário (sem dispositivos/níveis cadastrados ou sem permissão)');
    }
    for (const g of visitorLevels) {
        console.log(`   nível de visitante: ${g.privilegeGroupId} ${g.privilegeGroupName}${Number(g.isDefault) === 1 ? ' (padrão)' : ''}`);
    }
    await call('/artemis/api/visitor/v1/visitorgroups', { pageNo: 1, pageSize: 20 });

    if (!WRITE) {
        console.log('\nSó leitura. Rode com --write para criar e apagar um visitante de teste.');
        return;
    }

    console.log('\n== Escrita: agendamento de visitante de teste (v2/appointment)');
    const facePath = argValue('face');
    const faceBase64 = facePath ? fs.readFileSync(facePath).toString('base64') : undefined;
    if (faceBase64) {
        const kb = Math.round(Buffer.from(faceBase64, 'base64').length / 1024);
        console.log(`   face: ${facePath} (${kb} KB; o guia pede JPG de 10 a 100 KB)`);
    }
    const tower = argValue('tower');
    const levelId = pickVisitorAccessLevelForTower(visitorLevels, tower);
    console.log(`   nível escolhido para "${tower ?? '(sem torre)'}": ${levelId ?? 'nenhum'}`);

    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const payload = buildVisitorAppointmentPayload({
        givenName: 'Teste',
        familyName: 'PoC Convite',
        visitStartTime: start,
        visitEndTime: end,
        accessLevelIds: levelId ? [levelId] : [],
        faceBase64,
        phoneNo: '11999990000',
        plateNo: 'TST1A23',
        remark: 'Teste automatico - pode apagar',
    });
    const created = await call('/artemis/api/visitor/v2/appointment', payload);
    const appointRecordId = created.data?.data?.appointRecordId;
    console.log(`   visitorId=${created.data?.data?.visitorId ?? '-'} appointRecordId=${appointRecordId ?? '-'}`);

    if (appointRecordId) {
        console.log('\n== Limpeza');
        await call('/artemis/api/visitor/v1/appointment/single/delete', { appointRecordId: String(appointRecordId) });
    }
}

main().catch((err) => {
    console.error('Erro:', err.message);
    process.exit(1);
});
