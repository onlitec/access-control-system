/**
 * Montagem do payload de agendamento de visitante (V2) do HikCentral Professional.
 *
 * Referência: HikCentral Professional OpenAPI V3.1.1 Developer Guide,
 * seção 5.7.5 — POST /artemis/api/visitor/v2/appointment.
 *
 * Funções puras (sem I/O) para poderem ser testadas sem servidor HikCentral.
 */

export const VISIT_REASON = {
    BUSINESS: 0,
    TRAINING: 1,
    VISIT: 2,
    MEETING: 3,
    OTHERS: 4,
} as const;

export interface VisitorAppointmentInput {
    /** Nome completo; usado quando givenName/familyName não forem informados */
    visitorName?: string;
    givenName?: string;
    familyName?: string;
    visitStartTime: Date | string;
    visitEndTime: Date | string;
    /** hikPersonId do morador visitado */
    receptionistId?: string;
    /** IDs de níveis de acesso de visitante (privilege group type = 2) */
    accessLevelIds?: string[];
    /** Foto facial em Base64 (com ou sem prefixo data:) */
    faceBase64?: string;
    /** Foto do documento em Base64 (com ou sem prefixo data:) */
    documentPhotoBase64?: string;
    certificateNo?: string;
    phoneNo?: string;
    email?: string;
    plateNo?: string;
    companyName?: string;
    visitorGroupName?: string;
    /** 'VISITOR' | 'SERVICE_PROVIDER' | ... (tipo local do app) */
    visitorType?: string;
    remark?: string;
}

// Caracteres que a API recusa em nomes, placas e empresas: ' / \ : * ? " < > |
const FORBIDDEN_CHARS = /['/\\:*?"<>|]/g;

export function sanitizeHikText(value: string | undefined, maxLength: number): string | undefined {
    if (!value) return undefined;
    const clean = value.replace(FORBIDDEN_CHARS, '').trim().slice(0, maxLength);
    return clean || undefined;
}

export function stripDataUriPrefix(b64: string | undefined): string | undefined {
    if (!b64) return undefined;
    const clean = b64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
    return clean || undefined;
}

/**
 * Formata data no padrão exigido pela OpenAPI: "yyyy-MM-ddTHH:mm:ss+HH:mm".
 * O HikCentral não aceita milissegundos nem o sufixo "Z" de toISOString().
 * O fuso vem de HIKCENTRAL_TZ_OFFSET (padrão -03:00, horário de Brasília).
 */
export function formatHikDateTime(value: Date | string, offset = process.env.HIKCENTRAL_TZ_OFFSET || '-03:00'): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Data inválida para o HikCentral: ${String(value)}`);
    }
    const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
    if (!match) {
        throw new Error(`HIKCENTRAL_TZ_OFFSET inválido: ${offset} (use o formato -03:00)`);
    }
    const sign = match[1] === '-' ? -1 : 1;
    const offsetMinutes = sign * (parseInt(match[2], 10) * 60 + parseInt(match[3], 10));
    const local = new Date(date.getTime() + offsetMinutes * 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
        `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${offset}`;
}

/** Divide "Maria da Silva" em givenName "Maria da" e familyName "Silva". */
export function splitVisitorName(fullName: string): { givenName: string; familyName: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { givenName: '', familyName: '' };
    if (parts.length === 1) return { givenName: parts[0], familyName: parts[0] };
    const familyName = parts.pop() as string;
    return { givenName: parts.join(' '), familyName };
}

export function buildVisitorAppointmentPayload(input: VisitorAppointmentInput) {
    let givenName = input.givenName?.trim();
    let familyName = input.familyName?.trim();
    if (!givenName || !familyName) {
        const split = splitVisitorName(input.visitorName || [givenName, familyName].filter(Boolean).join(' '));
        givenName = givenName || split.givenName;
        familyName = familyName || split.familyName;
    }
    givenName = sanitizeHikText(givenName, 256);
    familyName = sanitizeHikText(familyName, 256);
    if (!givenName || !familyName) {
        throw new Error('Nome do visitante é obrigatório para o agendamento no HikCentral');
    }

    const isProvider = input.visitorType === 'SERVICE_PROVIDER' || input.visitorType === 'PROVIDER';

    const visitorInfo: Record<string, unknown> = {
        visitorGivenName: givenName,
        visitorFamilyName: familyName,
        gender: 0,
        // Obrigatório pela documentação; vazio = sem lista de monitoramento.
        watchListInfo: [],
        accessInfo: {
            electrostaticDetectionType: 0,
            qrCodeValidNum: 0,
        },
    };

    const groupName = sanitizeHikText(input.visitorGroupName, 64);
    if (groupName) visitorInfo.visitorGroupName = groupName;
    if (input.email) visitorInfo.email = input.email.trim();
    const phone = input.phoneNo?.replace(/[^\d+]/g, '').slice(0, 20);
    if (phone) visitorInfo.phoneNo = phone;
    const plate = sanitizeHikText(input.plateNo?.toUpperCase().replace(/[\s-]/g, ''), 16);
    if (plate) visitorInfo.plateNo = plate;
    const company = sanitizeHikText(input.companyName, 128);
    if (company) visitorInfo.companyName = company;
    const certificateNo = sanitizeHikText(input.certificateNo, 20);
    if (certificateNo) {
        visitorInfo.certificateType = 111; // documento de identidade
        visitorInfo.certificateNo = certificateNo;
    }
    const remark = sanitizeHikText(input.remark, 128);
    if (remark) visitorInfo.remark = remark;

    const face = stripDataUriPrefix(input.faceBase64);
    if (face) visitorInfo.faces = [{ faceData: face }];
    const docPhoto = stripDataUriPrefix(input.documentPhotoBase64);
    if (docPhoto) visitorInfo.identiPhoto = [{ identiPhoto: docPhoto }];

    const payload: Record<string, unknown> = {
        appointStartTime: formatHikDateTime(input.visitStartTime),
        appointEndTime: formatHikDateTime(input.visitEndTime),
        visitReasonType: isProvider ? VISIT_REASON.OTHERS : VISIT_REASON.VISIT,
        visitorInfoList: [{ VisitorInfo: visitorInfo }],
    };
    if (isProvider) payload.visitReasonDetail = 'Prestador de serviço';
    if (input.receptionistId) payload.receptionistId = String(input.receptionistId);

    const levelIds = (input.accessLevelIds || [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
    if (levelIds.length > 0) {
        payload.accessInfo = {
            accessLevelList: levelIds.map((id) => ({ accessLevel: { id, baseInfo: {} } })),
        };
    }

    return payload;
}

/**
 * Escolhe o nível de acesso de visitante (privilege group type = 2) da torre do morador.
 * Ordem: nome igual ao da torre; nome contendo o nome da torre; nível marcado como padrão.
 */
export function pickVisitorAccessLevelForTower(
    groups: Array<{ privilegeGroupId?: string | number; privilegeGroupName?: string; isDefault?: number | string }>,
    towerName?: string | null,
): string | undefined {
    const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_-]+/g, '').toLowerCase();
    const valid = groups.filter((g) => g.privilegeGroupId !== undefined && g.privilegeGroupId !== null && g.privilegeGroupId !== '');
    if (towerName) {
        const tower = normalize(towerName);
        const exact = valid.find((g) => g.privilegeGroupName && normalize(g.privilegeGroupName) === tower);
        if (exact) return String(exact.privilegeGroupId);
        // "torre1" não pode casar com "visitantestorre10"
        const containsTower = (name: string) => {
            let idx = name.indexOf(tower);
            while (idx >= 0) {
                const next = name.charAt(idx + tower.length);
                if (!/\d/.test(next)) return true;
                idx = name.indexOf(tower, idx + 1);
            }
            return false;
        };
        const partial = valid.find((g) => g.privilegeGroupName && containsTower(normalize(g.privilegeGroupName)));
        if (partial) return String(partial.privilegeGroupId);
    }
    const fallback = valid.find((g) => Number(g.isDefault) === 1);
    return fallback ? String(fallback.privilegeGroupId) : undefined;
}
