import { Visitor } from '@prisma/client';
import { HikCentralService } from './HikCentralService';

/** Status do ciclo de vida do convite de visitante */
export const VISITOR_STATUS = {
    PRE_REGISTERED: 'PRE_REGISTERED',       // link enviado, visitante ainda não preencheu
    PENDING_APPROVAL: 'PENDING_APPROVAL',   // visitante preencheu, aguarda o morador
    ACTIVE: 'ACTIVE',                       // aprovado e liberado
    REJECTED: 'REJECTED',                   // recusado pelo morador
} as const;

export function stripImagePrefix(b64?: string | null): string | undefined {
    if (!b64) return undefined;
    const clean = String(b64).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
    return clean || undefined;
}

/**
 * Envia o visitante ao HikCentral pelo agendamento V2 (face, documento, placa e
 * nível de acesso da torre). Retorna o visitorId do HikCentral, ou undefined no
 * modo standalone (sem HikCentral configurado). Lança erro se o HikCentral recusar.
 */
export async function syncVisitorToHikCentral(visitor: Visitor): Promise<string | undefined> {
    if (!(await HikCentralService.isConfigured())) return undefined;

    // visitor.accessLevelId guarda o hikPersonId do morador (ver resident-auth pre-register)
    const hostHikPersonId = visitor.accessLevelId || undefined;
    let accessLevelIds: string[] = [];
    try {
        const levelId = await HikCentralService.getVisitorAccessLevelForTower(visitor.tower);
        if (levelId) accessLevelIds = [levelId];
        else console.warn(`[Visitors] Nenhum nível de acesso de visitante encontrado para a torre "${visitor.tower ?? ''}"`);
    } catch (levelErr: any) {
        console.error('[Visitors] Erro ao buscar níveis de acesso de visitante:', levelErr.message);
    }

    const certificateNo = visitor.certificateNo && !/^(pre|res)-/.test(visitor.certificateNo)
        ? visitor.certificateNo
        : undefined;

    const hikResult: any = await HikCentralService.createVisitorAppointment({
        givenName: visitor.name,
        familyName: visitor.surname || undefined,
        visitorName: `${visitor.name} ${visitor.surname || ''}`.trim(),
        visitStartTime: visitor.visitStartTime,
        visitEndTime: visitor.visitEndTime,
        receptionistId: hostHikPersonId,
        accessLevelIds,
        faceBase64: stripImagePrefix(visitor.photo_url),
        documentPhotoBase64: stripImagePrefix(visitor.document_photo_url),
        certificateNo,
        phoneNo: visitor.phone || undefined,
        email: visitor.email || undefined,
        plateNo: visitor.plateNo || undefined,
        visitorType: visitor.type || undefined,
    });
    return hikResult?.data?.visitorId;
}
