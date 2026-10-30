import { hikPost } from './client';
import { onlyDigits, isValidCpf, toE164Br } from '../utils/cpf';

export interface Resident {
    hikPersonId: string;
    name: string;
    cpf: string | null;
    email: string | null;
    phoneE164: string | null;
    orgIndexCode: string;
    /** Torres marcadas no cadastro (campos personalizados TORRE-1..4) */
    towers: string[];
}

interface CustomField {
    customFieldName?: string;
    customFiledName?: string; // o HikCentral 3.1.1 devolve o nome com este erro de grafia
    customFieldValue?: string;
}

const fieldName = (f: CustomField) => (f.customFieldName || f.customFiledName || '').trim();

export function normalizePerson(p: any): Resident {
    const fields: CustomField[] = Array.isArray(p.customFieldList) ? p.customFieldList : [];
    const cpfRaw = fields.find((f) => fieldName(f).toUpperCase() === 'CPF')?.customFieldValue;
    const cpf = onlyDigits(cpfRaw);
    const towers = fields
        .filter((f) => /^TORRE-\d+$/i.test(fieldName(f)))
        .filter((f) => {
            const v = (f.customFieldValue || '').trim().toLowerCase();
            return v !== '' && v !== '0' && v !== 'false' && v !== 'no';
        })
        .map((f) => fieldName(f).toUpperCase());
    return {
        hikPersonId: String(p.personId),
        name: String(p.personName || `${p.personGivenName ?? ''} ${p.personFamilyName ?? ''}`).trim(),
        cpf: isValidCpf(cpf) ? cpf : null,
        email: p.email ? String(p.email).trim() : null,
        phoneE164: toE164Br(p.phoneNo),
        orgIndexCode: String(p.orgIndexCode ?? ''),
        towers,
    };
}

const PAGE_SIZE = 500;
const TTL_MS = 10 * 60 * 1000;

let cache: { at: number; byCpf: Map<string, Resident>; total: number } | null = null;
let loading: Promise<void> | null = null;

async function loadAll(): Promise<void> {
    const byCpf = new Map<string, Resident>();
    let total = 0;
    for (let pageNo = 1; ; pageNo++) {
        const res = await hikPost('/artemis/api/resource/v1/person/personList', { pageNo, pageSize: PAGE_SIZE });
        const list: any[] = res.data?.list ?? [];
        total = res.data?.total ?? total;
        for (const raw of list) {
            const resident = normalizePerson(raw);
            if (resident.cpf) byCpf.set(resident.cpf, resident);
        }
        if (pageNo * PAGE_SIZE >= total || list.length === 0) break;
    }
    cache = { at: Date.now(), byCpf, total };
}

/** A OpenAPI não filtra por campo personalizado; por isso o CPF é indexado em memória. */
async function ensureLoaded(force = false): Promise<void> {
    if (!force && cache && Date.now() - cache.at < TTL_MS) return;
    if (!loading) loading = loadAll().finally(() => { loading = null; });
    await loading;
}

export async function findResidentByCpf(cpf: string): Promise<Resident | null> {
    await ensureLoaded();
    return cache!.byCpf.get(onlyDigits(cpf)) ?? null;
}

export async function residentStats(): Promise<{ total: number; withCpf: number; withPhone: number; withEmail: number }> {
    await ensureLoaded(true);
    const all = [...cache!.byCpf.values()];
    return {
        total: cache!.total,
        withCpf: all.length,
        withPhone: all.filter((r) => r.phoneE164).length,
        withEmail: all.filter((r) => r.email).length,
    };
}
