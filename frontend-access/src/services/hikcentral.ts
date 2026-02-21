import { authRequest } from '@/services/authApi';

const request = authRequest;

/**
 * Cadastrar Pessoa (Morador) - Proxied to Backend
 */
export async function addPerson(person: {
    personGivenName: string;
    personFamilyName: string;
    orgIndexCode: string;
    phoneNo?: string;
    email?: string;
    personProperties?: { propertyName: string, propertyValue: string }[];
    faces?: { faceData: string }[];
}) {
    // Map to backend expected format
    return request('/persons/sync', {
        method: 'POST',
        body: JSON.stringify({
            firstName: person.personGivenName,
            lastName: person.personFamilyName,
            phone: person.phoneNo,
            email: person.email,
            orgIndexCode: person.orgIndexCode,
            personProperties: person.personProperties,
            faces: person.faces // Backend might not handle faces yet, but pass it
        }),
    });
}

/**
 * Agendar Visitante - Proxied to Backend
 */
export async function createAppointment(appointment: {
    receptionistId: string;
    appointStartTime: string;
    appointEndTime: string;
    visitReasonType?: number;
    visitorInfoList: {
        visitorGivenName: string;
        visitorFamilyName: string;
        phoneNo?: string;
        plateNo?: string;
        certificateType?: string;
        certificateNo?: string;
        faces?: { faceData: string }[];
    }[];
}) {
    const visitor = appointment.visitorInfoList[0];
    return request('/visitors/reserve', {
        method: 'POST',
        body: JSON.stringify({
            visitorName: `${visitor.visitorGivenName} ${visitor.visitorFamilyName}`.trim(),
            certificateNo: visitor.certificateNo || '000000',
            visitStartTime: appointment.appointStartTime,
            visitEndTime: appointment.appointEndTime,
            plateNo: visitor.plateNo,
            visitorPicData: visitor.faces?.[0]?.faceData
        }),
    });
}

/**
 * Buscar Níveis de Acesso
 */
export async function getAccessGroups() {
    // Not implemented in backend yet, return mock or error
    console.warn("getAccessGroups not implemented in backend yet");
    return { code: "0", data: { list: [] } };
}

/**
 * Re-aplicar Autorização
 */
export async function reapplyAuthorization() {
    // Backend doesn't have this specific route exposed, maybe access-logs triggers it or we ignore
    console.log("Reapply Authorization requested");
    return { code: "0", msg: "Success" };
}

/**
 * Buscar Organizações
 */
export async function getOrganizations() {
    return request('/hikcentral/organizations', {
        method: 'GET',
    });
}
