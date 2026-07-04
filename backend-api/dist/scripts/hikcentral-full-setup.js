"use strict";
/**
 * ==========================================================================
 * HikCentral Full Setup Script – Condomínio Calabasas v2
 * ==========================================================================
 * Target HikCentral: https://100.77.145.39
 *
 * WHAT THIS SCRIPT DOES:
 *  1. Audits existing orgs (found: CALABASAS, PRESTADORES, PORTARIA,
 *     CONDOMINIO, ADMINISTRADORES, MORADORES)
 *  2. Maps existing orgs to our platform aliases
 *  3. Audits existing privilege groups (found: TORRE-01, MORADORES,
 *     ZELADORIA, TORRE-PARAISO, TORRE-NOBILE, TORRE-DESEO, TORRE-PERFECTO,
 *     PORTARIA - CONTROLE DE ACESSO, PRETADORES-HIK)
 *  4. Creates MISSING privilege groups (staff groups per document)
 *  5. Audits ACS devices
 *  6. Saves all mappings to local DB (EntityMapping table)
 *  7. Generates JSON report
 *
 * RUN: HIK_SSL_VERIFY=false npx tsx src/scripts/hikcentral-full-setup.ts
 * ==========================================================================
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const https_1 = require("https");
const fs = __importStar(require("fs"));
const db_1 = require("../db");
// ---- Config ----------------------------------------------------------------
const HIK_API_URL = 'https://100.77.145.39';
const HIK_APP_KEY = '15581689';
const HIK_APP_SECRET = 'pA9wh6Y2chcm5wUBe49O';
const SSL_VERIFY = process.env.HIK_SSL_VERIFY !== 'false';
const httpsAgent = new https_1.Agent({ rejectUnauthorized: SSL_VERIFY });
const TIMEOUT_MS = 20000;
// ---- Signature Generation --------------------------------------------------
async function generateSignature(method, urlPath, headers) {
    let s = method.toUpperCase() + '\n';
    s += (headers['Accept'] || '') + '\n';
    s += (headers['Content-MD5'] || '') + '\n';
    s += (headers['Content-Type'] || '') + '\n';
    s += (headers['Date'] || '') + '\n';
    const xCaKeys = Object.keys(headers)
        .filter(k => k.toLowerCase().startsWith('x-ca-') &&
        !['x-ca-signature', 'x-ca-signature-headers'].includes(k.toLowerCase()))
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    if (xCaKeys.length > 0) {
        s += xCaKeys.map(k => `${k.toLowerCase()}:${headers[k]}`).join('\n') + '\n';
    }
    s += urlPath;
    return crypto_1.default.createHmac('sha256', HIK_APP_SECRET).update(s, 'utf8').digest('base64');
}
// ---- HTTP Request Helper ---------------------------------------------------
async function hikReq(urlPath, body = {}, method = 'POST') {
    const timestamp = Date.now().toString();
    const dateStr = new Date().toUTCString();
    const bodyStr = method === 'POST' ? JSON.stringify(body) : '';
    const headers = {
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'Date': dateStr,
        'X-Ca-Key': HIK_APP_KEY,
        'X-Ca-Timestamp': timestamp,
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
    };
    if (bodyStr) {
        headers['Content-MD5'] = crypto_1.default.createHash('md5').update(bodyStr, 'utf8').digest('base64');
    }
    const sig = await generateSignature(method, urlPath, headers);
    headers['X-Ca-Signature'] = sig;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await (0, node_fetch_1.default)(`${HIK_API_URL}${urlPath}`, {
            method,
            headers,
            body: bodyStr || undefined,
            agent: httpsAgent,
            signal: controller.signal,
        });
        const text = await res.text();
        let json;
        try {
            json = JSON.parse(text);
        }
        catch {
            json = { raw: text };
        }
        return json;
    }
    catch (err) {
        if (err.name === 'AbortError')
            throw new Error(`Timeout ${TIMEOUT_MS}ms → ${urlPath}`);
        throw err;
    }
    finally {
        clearTimeout(timer);
    }
}
// ---- Helpers ----------------------------------------------------------------
const log = (m) => console.log(m);
const ok = (m) => console.log(`  ✓ ${m}`);
const skip = (m) => console.log(`  → ${m}`);
const fail = (m) => console.log(`  ✗ ${m}`);
async function fetchAllPages(urlPath, extraBody = {}, silent = false) {
    const items = [];
    let page = 1;
    const pageSize = 500;
    while (true) {
        try {
            const res = await hikReq(urlPath, { pageNo: page, pageSize, ...extraBody });
            const list = res?.data?.list || [];
            const total = Number(res?.data?.total || 0);
            items.push(...list);
            if (!silent)
                log(`   … página ${page}: ${list.length} itens (total=${total})`);
            if (items.length >= total || list.length === 0 || list.length < pageSize)
                break;
            page++;
        }
        catch (e) {
            if (!silent)
                log(`   ⚠ Erro na paginação: ${e.message}`);
            break;
        }
    }
    return items;
}
// ============================================================================
// CONSTANTS – Based on real HikCentral audit
// ============================================================================
/**
 * Root org index code in HikCentral = '1' (CALABASAS)
 * All new orgs must use this as parentOrgIndexCode
 */
const ROOT_ORG_INDEX_CODE = '1';
/**
 * Mapping: platform alias → real HikCentral orgName
 * Confirmed from Step 1 audit output:
 *   CALABASAS [1], PRESTADORES [3], PORTARIA [5],
 *   CONDOMINIO [6], ADMINISTRADORES [4], MORADORES [7]
 */
const KNOWN_ORG_MAPPINGS = [
    { alias: 'MORADORES', hikName: 'MORADORES', indexCode: '7' },
    { alias: 'STAFF', hikName: 'ADMINISTRADORES', indexCode: '4' },
    { alias: 'PORTARIA', hikName: 'PORTARIA', indexCode: '5' },
    { alias: 'CONDOMINIO', hikName: 'CONDOMINIO', indexCode: '6' },
    { alias: 'PRESTADORES', hikName: 'PRESTADORES', indexCode: '3' },
    { alias: 'ROOT', hikName: 'CALABASAS', indexCode: '1' },
];
/**
 * New sub-departments to create under root (if they don't already exist)
 * Based on document section 1.B: terceiros
 */
const NEW_ORGS_TO_CREATE = [
    { name: 'VISITANTES', parentOrgIndexCode: ROOT_ORG_INDEX_CODE },
    { name: 'COLABORADORES HABITUAIS', parentOrgIndexCode: ROOT_ORG_INDEX_CODE },
];
/**
 * PRIVILEGE GROUPS existing (confirmed from audit):
 *   TORRE-01, MORADORES, ZELADORIA, TORRE-PARAISO, TORRE-NOBILE,
 *   TORRE-DESEO, TORRE-PERFECTO, PORTARIA - CONTROLE DE ACESSO, PRETADORES-HIK
 */
const KNOWN_PRIVILEGE_GROUPS = [
    { name: 'TORRE-01', alias: 'TOWER_T1_BASE' },
    { name: 'MORADORES', alias: 'NVL_MORADORES_GERAL' },
    { name: 'ZELADORIA', alias: 'GRP_ZELADORIA' },
    { name: 'TORRE-PARAISO', alias: 'TOWER_T2_PARAISO' },
    { name: 'TORRE-NOBILE', alias: 'TOWER_T3_NOBILE' },
    { name: 'TORRE-DESEO', alias: 'TOWER_T4_DESEO' },
    { name: 'TORRE-PERFECTO', alias: 'TOWER_T1_PERFECTO' },
    { name: 'PORTARIA - CONTROLE DE ACESSO', alias: 'GRP_PORTARIA' },
    { name: 'PRETADORES-HIK', alias: 'GRP_PRESTADORES' },
];
/**
 * NEW privilege groups to create (staff operational groups per document §4.B)
 */
const NEW_PRIVILEGE_GROUPS = [
    { name: 'GRP_ESTAC_T234', description: 'Estacionamento Torres 2, 3 e 4 (PARAISO/NOBILE/DESEO)' },
    { name: 'GRP_TERREO_T234', description: 'Térreo Torres 2, 3 e 4 + Elevadores pav.0' },
    { name: 'GRP_ACADEMIA_T3', description: 'Academia Torre 3 (NOBILE)' },
    { name: 'GRP_ESTAC_T1', description: 'Estacionamento Torre 1 (PERFECTO)' },
    { name: 'GRP_TERREO_T1', description: 'Térreo e Garagem Torre 1 (PERFECTO)' },
    { name: 'GRP_MANUTENCAO_T1', description: 'Manutenção / Ronda – Pavimentos 1-9 Torre 1' },
    { name: 'GRP_MANUTENCAO_T2', description: 'Manutenção / Ronda – Pavimentos 1-9 Torre 2 (PARAISO)' },
    { name: 'GRP_MANUTENCAO_T3', description: 'Manutenção / Ronda – Pavimentos 1-9 Torre 3 (NOBILE)' },
    { name: 'GRP_MANUTENCAO_T4', description: 'Manutenção / Ronda – Pavimentos 1-9 Torre 4 (DESEO)' },
    { name: 'GRP_MORADOR_T1_BASE', description: 'Morador Torre 1 – Áreas comuns completas + elevador T1' },
    { name: 'GRP_MORADOR_T234_BASE', description: 'Morador Torres 2/3/4 – Áreas comuns (sem acesso T1)' },
    { name: 'GRP_VISITANTE_EVENTO', description: 'Convidado de Evento – Salões de Festa' },
    { name: 'GRP_COLABORADOR', description: 'Colaborador Habitual – Babás, Diaristas, Cuidadores' },
    { name: 'GRP_PRESTADOR_OBRA', description: 'Prestador de Serviço – Obras e Reparos' },
];
// ============================================================================
// STEP 1 – Full org audit
// ============================================================================
async function step1_auditOrgs() {
    log('\n📁 STEP 1 — Auditando Organizações Existentes...');
    const orgs = await fetchAllPages('/artemis/api/resource/v1/org/orgList', {}, true);
    log(`   Encontradas ${orgs.length} organizações:`);
    const map = new Map();
    for (const o of orgs) {
        const name = (o.orgName || '').trim();
        const code = String(o.orgIndexCode || '');
        const parent = String(o.parentOrgIndexCode || '');
        map.set(name, { code, name, parent });
        log(`   • ${name} [${code}] parent=${parent}`);
    }
    return map;
}
// ============================================================================
// STEP 2 – Create missing sub-departments
// ============================================================================
async function step2_createMissingOrgs(existing) {
    log('\n🏢 STEP 2 — Criando Departamentos Ausentes...');
    const result = new Map();
    // First, populate known ones
    for (const known of KNOWN_ORG_MAPPINGS) {
        result.set(known.alias, known.indexCode);
        skip(`Mapeado "${known.alias}" → "${known.hikName}" [${known.indexCode}]`);
    }
    // Map existing by name
    for (const [name, data] of existing) {
        result.set(name.toUpperCase(), data.code);
    }
    // Create new ones if missing
    for (const newOrg of NEW_ORGS_TO_CREATE) {
        const existingEntry = existing.get(newOrg.name);
        if (existingEntry) {
            skip(`"${newOrg.name}" já existe [${existingEntry.code}]`);
            result.set(newOrg.name, existingEntry.code);
            continue;
        }
        log(`   + Criando: "${newOrg.name}" (parent=${newOrg.parentOrgIndexCode})...`);
        try {
            const r = await hikReq('/artemis/api/resource/v1/org/single/add', {
                orgName: newOrg.name,
                parentOrgIndexCode: newOrg.parentOrgIndexCode,
            });
            if (r?.code === '0') {
                const code = r?.data?.orgIndexCode || r?.data?.indexCode || '';
                ok(`Criado: "${newOrg.name}" [${code}]`);
                result.set(newOrg.name, code);
            }
            else {
                fail(`Falha "${newOrg.name}": code=${r?.code} msg="${r?.msg}"`);
            }
        }
        catch (e) {
            fail(`Erro "${newOrg.name}": ${e.message}`);
        }
    }
    return result;
}
// ============================================================================
// STEP 3 – Audit existing privilege groups
// ============================================================================
async function step3_auditPrivilegeGroups() {
    log('\n🔑 STEP 3 — Auditando Grupos de Privilégio Existentes (type=1)...');
    const map = new Map();
    try {
        // Use a longer timeout for this request
        const groups = await fetchAllPages('/artemis/api/acs/v1/privilege/group', { type: 1 }, true);
        log(`   Encontrados ${groups.length} grupos:`);
        for (const g of groups) {
            const name = (g.privilegeGroupName || g.groupName || '').trim();
            const code = String(g.privilegeGroupIndexCode || g.groupIndexCode || g.indexCode || '');
            map.set(name, code);
            log(`   • ${name} [${code}]`);
            // Also map by alias from known groups
            const known = KNOWN_PRIVILEGE_GROUPS.find(k => k.name === name);
            if (known) {
                map.set(known.alias, code);
            }
        }
    }
    catch (e) {
        log(`   ⚠ Erro ao listar grupos: ${e.message}`);
        // Pre-populate with what we know from the audit
        log('   ℹ Usando dados pré-auditados...');
        for (const known of KNOWN_PRIVILEGE_GROUPS) {
            log(`   • ${known.name} [INDEXCODE_DESCONHECIDO] → alias: ${known.alias}`);
        }
    }
    return map;
}
// ============================================================================
// STEP 4 – Create missing privilege groups
// ============================================================================
async function step4_createPrivilegeGroups(existing) {
    log('\n🔐 STEP 4 — Criando Grupos de Privilégio Ausentes...');
    const result = new Map(existing);
    for (const grp of NEW_PRIVILEGE_GROUPS) {
        // Check if already exists (by name or alias)
        if (result.has(grp.name)) {
            skip(`"${grp.name}" já existe [${result.get(grp.name)}]`);
            continue;
        }
        log(`   + Criando: "${grp.name}"...`);
        try {
            const r = await hikReq('/artemis/api/acs/v1/privilege/group/add', {
                privilegeGroupName: grp.name,
                type: 1, // 1 = regular person access level
                remark: grp.description,
            });
            if (r?.code === '0') {
                const code = String(r?.data?.privilegeGroupIndexCode ||
                    r?.data?.indexCode ||
                    r?.data?.id ||
                    Object.values(r?.data || {})[0] || '');
                ok(`Criado: "${grp.name}" [${code}]`);
                result.set(grp.name, code);
            }
            else {
                fail(`Falha "${grp.name}": code=${r?.code} msg="${r?.msg}"`);
                log(`   Raw response: ${JSON.stringify(r)}`);
            }
        }
        catch (e) {
            fail(`Erro "${grp.name}": ${e.message}`);
        }
    }
    return result;
}
// ============================================================================
// STEP 5 – Audit ACS Devices
// ============================================================================
async function step5_auditDevices() {
    log('\n📡 STEP 5 — Auditando Dispositivos ACS...');
    const devices = await fetchAllPages('/artemis/api/resource/v1/acsDevice/acsDeviceList', {}, true);
    log(`   Encontrados ${devices.length} dispositivos:`);
    for (const d of devices) {
        log(`   • [${d.acsDevIndexCode}] ${d.acsDevName} | IP: ${d.acsDevIp} | Status: ${d.status} | Port: ${d.acsDevPort}`);
    }
    return devices;
}
// ============================================================================
// STEP 6 – Audit Privilege Group list via accessLevel resource API
// ============================================================================
async function step6_auditAccessLevelResource() {
    log('\n📋 STEP 6 — Verificando Access Levels via recurso resource/v1...');
    try {
        const res = await hikReq('/artemis/api/resource/v1/accessLevel/accessLevelList', {
            pageNo: 1, pageSize: 500,
        });
        const list = res?.data?.list || [];
        log(`   Encontrados ${list.length} Access Levels:`);
        for (const al of list) {
            log(`   • [${al.accessLevelIndexCode || al.indexCode}] ${al.accessLevelName || al.name}`);
        }
        return list;
    }
    catch (e) {
        log(`   ⚠ Endpoint não disponível: ${e.message}`);
        return [];
    }
}
// ============================================================================
// STEP 7 – Save mappings to local EntityMapping DB
// ============================================================================
async function step7_saveMappings(orgMap, privMap) {
    log('\n💾 STEP 7 — Salvando mapeamentos no banco local...');
    // All orgs to persist
    const orgMappings = KNOWN_ORG_MAPPINGS.map(o => ({
        pageRoute: `/hikcentral/org/${o.alias.toLowerCase()}`,
        entityType: 'ORGANIZATION',
        hikEntityId: o.indexCode,
        hikEntityName: o.hikName,
        createdBy: 'hikcentral-setup-script',
        filterConfig: JSON.stringify({ alias: o.alias }),
    }));
    // Visitor / new org mappings
    for (const no of NEW_ORGS_TO_CREATE) {
        const code = orgMap.get(no.name) || '';
        if (code) {
            orgMappings.push({
                pageRoute: `/hikcentral/org/${no.name.toLowerCase().replace(/ /g, '_')}`,
                entityType: 'ORGANIZATION',
                hikEntityId: code,
                hikEntityName: no.name,
                createdBy: 'hikcentral-setup-script',
                filterConfig: JSON.stringify({ alias: no.name }),
            });
        }
    }
    // Known privilege groups
    const privMappings = KNOWN_PRIVILEGE_GROUPS.map(g => ({
        pageRoute: `/hikcentral/privilege/${g.alias.toLowerCase()}`,
        entityType: 'ACCESS_LEVEL',
        hikEntityId: privMap.get(g.name) || privMap.get(g.alias) || '',
        hikEntityName: g.name,
        createdBy: 'hikcentral-setup-script',
        filterConfig: JSON.stringify({ alias: g.alias }),
    })).filter(m => m.hikEntityId);
    // New privilege groups
    for (const ng of NEW_PRIVILEGE_GROUPS) {
        const code = privMap.get(ng.name) || '';
        if (code) {
            privMappings.push({
                pageRoute: `/hikcentral/privilege/${ng.name.toLowerCase()}`,
                entityType: 'ACCESS_LEVEL',
                hikEntityId: code,
                hikEntityName: ng.name,
                createdBy: 'hikcentral-setup-script',
                filterConfig: JSON.stringify({ description: ng.description }),
            });
        }
    }
    const all = [...orgMappings, ...privMappings];
    let saved = 0;
    for (const m of all) {
        try {
            const existing = await db_1.prisma.entityMapping.findFirst({
                where: { pageRoute: m.pageRoute, entityType: m.entityType },
            });
            if (existing) {
                await db_1.prisma.entityMapping.update({
                    where: { id: existing.id },
                    data: {
                        hikEntityId: m.hikEntityId,
                        hikEntityName: m.hikEntityName,
                        updatedAt: new Date(),
                    },
                });
                skip(`Atualizado: ${m.hikEntityName} → ${m.hikEntityId}`);
            }
            else {
                await db_1.prisma.entityMapping.create({ data: m });
                ok(`Criado: ${m.hikEntityName} → ${m.hikEntityId}`);
            }
            saved++;
        }
        catch (dbErr) {
            fail(`DB error [${m.hikEntityName}]: ${dbErr.message}`);
        }
    }
    ok(`${saved}/${all.length} mapeamentos salvos.`);
}
// ============================================================================
// STEP 8 – Generate JSON report
// ============================================================================
async function step8_generateReport(orgMap, privMap, devices) {
    log('\n📄 STEP 8 — Gerando relatório JSON...');
    const report = {
        generated_at: new Date().toISOString(),
        hikcentral_url: HIK_API_URL,
        organizations: {
            existing: Object.fromEntries(KNOWN_ORG_MAPPINGS.map(o => [o.alias, { indexCode: o.indexCode, name: o.hikName }])),
            platform_mapping: {
                MORADORES: '7',
                ADMINISTRADORES: '4',
                PORTARIA: '5',
                CONDOMINIO: '6',
                PRESTADORES: '3',
                VISITANTES: orgMap.get('VISITANTES') || 'CRIAR_MANUALMENTE',
                COLABORADORES: orgMap.get('COLABORADORES HABITUAIS') || 'CRIAR_MANUALMENTE',
            },
        },
        privilege_groups: {
            existing: Object.fromEntries(KNOWN_PRIVILEGE_GROUPS.map(g => [g.alias, {
                    hikName: g.name,
                    indexCode: privMap.get(g.name) || privMap.get(g.alias) || 'INDEX_CODE_PENDING',
                }])),
            created: Object.fromEntries(NEW_PRIVILEGE_GROUPS
                .filter(g => privMap.get(g.name))
                .map(g => [g.name, privMap.get(g.name)])),
        },
        devices: devices.map(d => ({
            indexCode: d.acsDevIndexCode,
            name: d.acsDevName,
            ip: d.acsDevIp,
            port: d.acsDevPort,
            status: d.status,
            treatyType: d.treatyType,
        })),
        middleware_config: {
            comment: 'Variáveis de ambiente para o middleware Node.js',
            HIK_ORG_MORADORES: '7',
            HIK_ORG_STAFF: '4',
            HIK_ORG_PORTARIA: '5',
            HIK_ORG_PRESTADORES: '3',
            HIK_PRIV_PORTARIA: privMap.get('PORTARIA - CONTROLE DE ACESSO') || privMap.get('GRP_PORTARIA') || 'PENDING',
            HIK_PRIV_PRESTADORES: privMap.get('PRETADORES-HIK') || privMap.get('GRP_PRESTADORES') || 'PENDING',
            HIK_PRIV_ZELADORIA: privMap.get('ZELADORIA') || 'PENDING',
            HIK_PRIV_GRP_ESTAC_T234: privMap.get('GRP_ESTAC_T234') || 'PENDING',
            HIK_PRIV_GRP_TERREO_T234: privMap.get('GRP_TERREO_T234') || 'PENDING',
            HIK_PRIV_GRP_ACADEMIA_T3: privMap.get('GRP_ACADEMIA_T3') || 'PENDING',
            HIK_PRIV_GRP_ESTAC_T1: privMap.get('GRP_ESTAC_T1') || 'PENDING',
            HIK_PRIV_GRP_TERREO_T1: privMap.get('GRP_TERREO_T1') || 'PENDING',
            HIK_PRIV_NVL_MORADOR_T1: privMap.get('GRP_MORADOR_T1_BASE') || privMap.get('TORRE-01') || 'PENDING',
            HIK_PRIV_NVL_MORADOR_T234: privMap.get('GRP_MORADOR_T234_BASE') || privMap.get('MORADORES') || 'PENDING',
        },
        notes: [
            '⚠ Os indexCodes dos privilege groups aparecem como "" porque a API retornou grupos mas sem o campo privilegeGroupIndexCode.',
            'Acesse a UI do HikCentral e copie os indexCodes de cada grupo para completar o middleware_config.',
            'PORTARIA - CONTROLE DE ACESSO → mapeia para GRP_PORTARIA no middleware.',
            'PRETADORES-HIK → mapeia para GRP_PRESTADORES no middleware.',
            'TORRE-PARAISO = Torre 2, TORRE-NOBILE = Torre 3, TORRE-DESEO = Torre 4, TORRE-PERFECTO = Torre 1.',
        ],
    };
    const reportPath = '/opt/access-control-system/hikcentral-setup-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    ok(`Relatório salvo: ${reportPath}`);
    return report;
}
// ============================================================================
// MAIN
// ============================================================================
async function main() {
    console.log('='.repeat(72));
    console.log('  HikCentral Full Setup v2 – Condomínio Calabasas');
    console.log(`  Target: ${HIK_API_URL}  AppKey: ${HIK_APP_KEY}`);
    console.log(`  SSL_VERIFY: ${SSL_VERIFY}`);
    console.log('='.repeat(72));
    try {
        const existingOrgs = await step1_auditOrgs();
        const orgMap = await step2_createMissingOrgs(existingOrgs);
        const existingPriv = await step3_auditPrivilegeGroups();
        const privMap = await step4_createPrivilegeGroups(existingPriv);
        const devices = await step5_auditDevices();
        await step6_auditAccessLevelResource();
        await step7_saveMappings(orgMap, privMap);
        const report = await step8_generateReport(orgMap, privMap, devices);
        // ── Final Summary ──────────────────────────────────────────────────
        console.log('\n' + '='.repeat(72));
        console.log('✅  SETUP CONCLUÍDO');
        console.log('\n📁 Organizações Confirmadas:');
        for (const o of KNOWN_ORG_MAPPINGS) {
            console.log(`  ${o.alias.padEnd(18)} → ${o.hikName} [${o.indexCode}]`);
        }
        for (const no of NEW_ORGS_TO_CREATE) {
            const code = orgMap.get(no.name) || '❌ não criado';
            console.log(`  ${no.name.padEnd(18)} → [${code}]`);
        }
        console.log('\n🔑 Grupos de Acesso Existentes:');
        for (const g of KNOWN_PRIVILEGE_GROUPS) {
            const code = privMap.get(g.name) || privMap.get(g.alias) || '—';
            console.log(`  ${g.name.padEnd(38)} [${code}]`);
        }
        console.log('\n🔐 Novos Grupos de Acesso:');
        for (const ng of NEW_PRIVILEGE_GROUPS) {
            const code = privMap.get(ng.name) || '❌ não criado';
            console.log(`  ${ng.name.padEnd(28)} → [${code}]`);
        }
        console.log('\n📡 Dispositivos ACS:');
        for (const d of devices) {
            console.log(`  [${d.acsDevIndexCode}] ${d.acsDevName} | ${d.acsDevIp}`);
        }
        console.log('\n📄 Relatório JSON: /opt/access-control-system/hikcentral-setup-report.json');
        console.log('='.repeat(72));
    }
    catch (error) {
        console.error('\n❌ ERRO CRÍTICO:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
    finally {
        await db_1.prisma.$disconnect();
    }
}
main();
