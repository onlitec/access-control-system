import crypto from 'crypto';
import fetch from 'node-fetch';
import { Agent } from 'https';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * HikCentral Professional OpenAPI Integration Service
 */

export class HikCentralService {
    private static async generateSignature(
        method: string,
        path: string,
        headers: Record<string, string>,
        appSecret: string
    ): Promise<string> {
        const lf = '\n';
        let stringToSign = method.toUpperCase() + lf;

        const accept = headers['Accept'] || headers['accept'];
        if (accept) stringToSign += accept + lf;

        const contentMD5 = headers['Content-MD5'] || headers['content-md5'];
        if (contentMD5) stringToSign += contentMD5 + lf;

        const contentType = headers['Content-Type'] || headers['content-type'];
        if (contentType) stringToSign += contentType + lf;

        const date = headers['Date'] || headers['date'];
        if (date) stringToSign += date + lf;

        // CanonicalizedHeaders (x-ca- headers)
        const xCaHeadersKeys = Object.keys(headers)
            .filter(key => key.toLowerCase().startsWith('x-ca-') &&
                key.toLowerCase() !== 'x-ca-signature' &&
                key.toLowerCase() !== 'x-ca-signature-headers')
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        const xCaHeadersStr = xCaHeadersKeys.map(key => `${key.toLowerCase()}:${headers[key]}`).join(lf);

        if (xCaHeadersStr) {
            stringToSign += xCaHeadersStr + lf;
        }

        stringToSign += path;

        console.log('StringToSign:', stringToSign.replace(/\n/g, '\\n'));

        return crypto
            .createHmac('sha256', appSecret)
            .update(stringToSign, 'utf8')
            .digest('base64');
    }

    public static async hikRequest(path: string, options: any = {}) {
        const config = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
        if (!config || !config.apiUrl || !config.appKey || !config.appSecret) {
            throw new Error("HikCentral credentials not configured in Admin panel.");
        }

        const method = options.method || 'GET';
        const timestamp = Date.now().toString();

        const headers: Record<string, string> = {
            'Accept': '*/*',
            'Content-Type': 'application/json;charset=UTF-8',
            'X-Ca-Key': config.appKey,
            'X-Ca-Timestamp': timestamp,
            'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
            ...options.headers,
        };

        if (options.body) {
            headers['Content-MD5'] = crypto.createHash('md5').update(options.body, 'utf8').digest('base64');
        }

        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const signature = await this.generateSignature(method, cleanPath, headers, config.appSecret);
        headers['X-Ca-Signature'] = signature;

        // Ensure base URL does not end with /
        const baseUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
        const url = `${baseUrl}${cleanPath}`;

        // Desabilitar verificação SSL para IP local se necessário
        const response = await fetch(url, {
            ...options,
            headers,
            // @ts-ignore
            agent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.msg || `Erro na requisição Hikcentral: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Sincronização de moradores (addPerson)
     */
    public static async addPerson(person: {
        personGivenName: string;
        personFamilyName: string;
        orgIndexCode: string;
        phoneNo?: string;
        email?: string;
        faces?: { faceData: string }[];
        personProperties?: { propertyName: string, propertyValue: string }[];
    }) {
        const payload: any = { ...person };
        if (person.personProperties) {
            payload.personCustomList = person.personProperties.map((p: any) => ({
                customFieldName: p.propertyName,
                customFieldValue: p.propertyValue
            }));
            delete payload.personProperties;
        }

        return this.hikRequest('/artemis/api/resource/v1/person/single/add', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    }

    /**
     * Atualizar pessoa existente no HikCentral (updatePerson)
     */
    public static async updatePerson(person: {
        personId: string;
        personGivenName?: string;
        personFamilyName?: string;
        orgIndexCode?: string;
        phoneNo?: string;
        email?: string;
        faces?: { faceData: string }[];
        personProperties?: { propertyName: string, propertyValue: string }[];
    }) {
        const payload: any = { ...person };
        // Mapear personId para indexCode (campo esperado pela API HikCentral)
        payload.indexCode = person.personId;

        if (person.personProperties) {
            payload.personCustomList = person.personProperties.map((p: any) => ({
                customFieldName: p.propertyName,
                customFieldValue: p.propertyValue
            }));
            delete payload.personProperties;
        }

        return this.hikRequest('/artemis/api/resource/v1/person/single/update', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    }

    /**
     * Implementação da API v1 de visitantes (reserveVisitor)
     */
    public static async reserveVisitor(visitor: {
        visitorName: string;
        certificateNo: string;
        visitStartTime: string;
        visitEndTime: string;
        plateNo?: string;
        visitorPicData?: string;
    }) {
        const payload = {
            visitorName: visitor.visitorName,
            gender: 1,
            certificateType: 111,
            certificateNo: visitor.certificateNo,
            visitStartTime: visitor.visitStartTime,
            visitEndTime: visitor.visitEndTime,
            visitorPicData: visitor.visitorPicData,
            plateNo: visitor.plateNo
        };

        return this.hikRequest('/artemis/api/visitor/v1/visitor/reserve', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    }

    /**
     * Consulta de Visitantes (visitorInfo)
     */
    public static async getVisitorList(pageNo = 1, pageSize = 200, searchName?: string) {
        const body: any = { pageNo, pageSize };
        if (searchName) {
            body.searchCriteria = { personName: searchName };
        }
        return this.hikRequest('/artemis/api/visitor/v1/visitor/visitorInfo', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Lista Extensões e Perfis GERAIS (Orgs, Faciais, Grupos de Visitantes etc)
     */
    public static async getVisitorGroups(pageNo = 1, pageSize = 100) {
        return this.hikRequest('/artemis/api/visitor/v1/visitorgroups', {
            method: 'POST',
            body: JSON.stringify({ pageNo, pageSize }),
        });
    }

    /**
     * Consulta de eventos (getAccessLogs)
     */
    public static async getAccessLogs(params: {
        startTime: string;
        endTime: string;
        pageNo?: number;
        pageSize?: number;
    }) {
        return this.hikRequest('/artemis/api/acs/v1/door/events', {
            method: 'POST',
            body: JSON.stringify({
                startTime: params.startTime,
                endTime: params.endTime,
                pageNo: params.pageNo || 1,
                pageSize: params.pageSize || 100,
            }),
        });
    }

    /**
     * Listar departamentos/organizações
     */
    public static async getOrgList(pageNo = 1, pageSize = 100) {
        return this.hikRequest('/artemis/api/resource/v1/org/orgList', {
            method: 'POST',
            body: JSON.stringify({ pageNo, pageSize }),
        });
    }

    /**
     * Listar pessoas por orgIndexCode (departamento)
     */
    public static async getPersonList(params: {
        orgIndexCode?: string;
        pageNo?: number;
        pageSize?: number;
    }) {
        const body: any = {
            pageNo: params.pageNo || 1,
            pageSize: params.pageSize || 200,
        };
        if (params.orgIndexCode) {
            body.orgIndexCodes = [params.orgIndexCode];
        }
        return this.hikRequest('/artemis/api/resource/v1/person/personList', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Buscar pessoas de um departamento pelo nome
     * Primeiro encontra o orgIndexCode do departamento, depois lista as pessoas
     */
    public static async getPersonListByOrgName(orgName: string, pageNo = 1, pageSize = 200) {
        // Buscar lista de organizações
        const orgResult = await this.getOrgList(1, 500);
        const orgs = orgResult?.data?.list || [];

        // Encontrar o departamento "MORADORES"
        const targetOrg = orgs.find((org: any) =>
            org.orgName?.toUpperCase() === orgName.toUpperCase() ||
            org.orgName?.toUpperCase().includes(orgName.toUpperCase())
        );

        if (!targetOrg) {
            console.log(`Departamento "${orgName}" não encontrado. Departamentos disponíveis:`,
                orgs.map((o: any) => `${o.orgName} (${o.orgIndexCode})`));
            return { data: { list: [], total: 0 }, orgIndexCode: null };
        }

        console.log(`Departamento "${orgName}" encontrado: orgIndexCode=${targetOrg.orgIndexCode}`);

        // Buscar pessoas desse departamento
        const persons = await this.getPersonList({
            orgIndexCode: targetOrg.orgIndexCode,
            pageNo,
            pageSize,
        });

        return { ...persons, orgIndexCode: targetOrg.orgIndexCode };
    }

    /**
     * Listar dispositivos de controle de acesso (ACS)
     */
    public static async getAcsDeviceList(pageNo = 1, pageSize = 100) {
        const result = await this.hikRequest('/artemis/api/resource/v1/acsDevice/acsDeviceList', {
            method: 'POST',
            body: JSON.stringify({ pageNo, pageSize }),
        });
        console.log("Device List Response:", JSON.stringify(result, null, 2));
        return result;
    }
}
