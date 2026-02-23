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
        let stringToSign = method.toUpperCase() + '\n';
        stringToSign += (headers['Accept'] || headers['accept'] || '') + '\n';
        stringToSign += (headers['Content-MD5'] || headers['content-md5'] || '') + '\n';
        stringToSign += (headers['Content-Type'] || headers['content-type'] || '') + '\n';
        stringToSign += (headers['Date'] || headers['date'] || '') + '\n';

        // CanonicalizedHeaders (x-ca- headers)
        const xCaHeadersKeys = Object.keys(headers)
            .filter(key => key.toLowerCase().startsWith('x-ca-') &&
                key.toLowerCase() !== 'x-ca-signature' &&
                key.toLowerCase() !== 'x-ca-signature-headers')
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        stringToSign += xCaHeadersKeys.map(key => `${key.toLowerCase()}:${headers[key]}`).join('\n');

        if (xCaHeadersKeys.length > 0) {
            stringToSign += '\n';
        }

        stringToSign += path;

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
     * Requisição ao HikCentral que retorna dados binários (imagens, etc.)
     */
    public static async hikRequestRaw(path: string, options: any = {}): Promise<Buffer> {
        const config = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
        if (!config || !config.apiUrl || !config.appKey || !config.appSecret) {
            throw new Error("HikCentral credentials not configured in Admin panel.");
        }

        const method = options.method || 'POST';
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

        const baseUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
        const url = `${baseUrl}${cleanPath}`;

        const response = await fetch(url, {
            ...options,
            headers,
            // @ts-ignore
            agent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        if (!response.ok) {
            throw new Error(`Erro ao buscar imagem do HikCentral: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Buscar foto (face) de uma pessoa pelo personId
     * Tenta buscar via picUri do personPhoto ou via API dedicada
     */
    public static async getPersonPhoto(personId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
        console.log(`[HikCentral] getPersonPhoto(personId: ${personId}) iniciado`);
        try {
            // 1. Buscar dados detalhados da pessoa para obter picUri atualizada
            console.log(`[HikCentral] Buscando dados da pessoa ${personId} para obter picUri...`);
            const personResult = await this.hikRequest('/artemis/api/resource/v1/person/personList', {
                method: 'POST',
                body: JSON.stringify({ personIds: personId, pageNo: 1, pageSize: 1 }),
            });
            console.log(`[HikCentral] Resultado da busca (list): ${personResult?.data?.list?.length || 0} registros`);

            const person = personResult?.data?.list?.[0];
            console.log(`[HikCentral] Dados da pessoa ${personId}:`, JSON.stringify(person));
            if (!person?.personPhoto) {
                console.log(`[HikCentral] Pessoa ${personId} não possui personPhoto na API.`);
                return null;
            }

            const picUri = person.personPhoto.picUri || person.personPhoto.uri || '';
            if (!picUri) {
                console.log(`[HikCentral] Pessoa ${personId} possui objeto de foto mas picUri está vazio.`);
                return null;
            }

            console.log(`[HikCentral] Buscando foto para ${personId} com picUri: ${picUri}`);

            let buffer: Buffer;
            let contentType = 'image/jpeg';

            // Se for um link absoluto externo (raro no Artemis)
            if (picUri.startsWith('http')) {
                const imgRes = await fetch(picUri, {
                    // @ts-ignore
                    agent: new (require('https').Agent)({ rejectUnauthorized: false })
                });
                if (!imgRes.ok) throw new Error(`Fetch externo falhou: ${imgRes.statusText}`);
                buffer = Buffer.from(await imgRes.arrayBuffer());
                contentType = imgRes.headers.get('content-type') || 'image/jpeg';
            } else {
                // Se for um caminho relativo ou hash, usamos hikRequestRaw para garantir assinatura
                let apiPath = picUri;

                // Formatos comuns de picUri no Artemis:
                // 1. "/artemis/static/..."
                // 2. "abc123hash" 
                // Se não começa com "/", geralmente é um identificador que precisa do endpoint de mídia
                if (!picUri.startsWith('/')) {
                    apiPath = `/artemis/media/pic/${picUri}`;
                }

                try {
                    // Tentamos a requisição assinada (Artemis Gateway resolve esses paths)
                    buffer = await this.hikRequestRaw(apiPath, { method: 'GET' });
                    contentType = 'image/jpeg';
                } catch (e: any) {
                    console.warn(`[HikCentral] Falha no path direto ${apiPath}, tentando via person/picture API:`, e.message);

                    // Fallback para API oficial de picture se disponível
                    try {
                        buffer = await this.hikRequestRaw('/artemis/api/resource/v1/person/picture', {
                            method: 'POST',
                            body: JSON.stringify({ personId, picUri })
                        });
                        contentType = 'image/jpeg';
                    } catch (e2: any) {
                        console.error(`[HikCentral] Todas as tentativas de buscar foto para ${personId} falharam:`, e2.message);
                        return null;
                    }
                }
            }

            return { buffer, contentType };
        } catch (error: any) {
            console.error(`[HikCentral] Erro crítico ao buscar foto de ${personId}:`, error.message);
            return null;
        }
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
        certificateNo?: string;
        certificateType?: number;
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
     * Sincronização de foto do morador (addPersonFace)
     */
    public static async addPersonFace(personId: string, faceData: string) {
        return this.hikRequest('/artemis/api/resource/v1/face/single/add', {
            method: 'POST',
            body: JSON.stringify({
                personId,
                faceData
            }),
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
        certificateNo?: string;
        certificateType?: number;
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

    /**
     * Listar níveis de acesso (Access Levels)
     */
    public static async getAccessLevelList(pageNo = 1, pageSize = 100) {
        return this.hikRequest('/artemis/api/resource/v1/accessLevel/accessLevelList', {
            method: 'POST',
            body: JSON.stringify({ pageNo, pageSize }),
        });
    }

    /**
     * Listar definições de campos customizados/adicionais
     */
    public static async getCustomFields() {
        return this.hikRequest('/artemis/api/resource/v1/person/fieldList', {
            method: 'POST',
            body: JSON.stringify({}),
        });
    }

    /**
     * Aplicar/Autorizar níveis de acesso a uma pessoa
     */
    public static async authorizePerson(personId: string, accessLevelIndexCodes: string[], personType: string = '1') {
        return this.hikRequest('/artemis/api/acs/v1/accessLevel/authorize', {
            method: 'POST',
            body: JSON.stringify({
                personDatas: [{
                    personId: personId,
                    personType: personType,
                    operatorType: 1, // Add/Modify
                }],
                accessLevelIndexCodes: accessLevelIndexCodes
            }),
        });
    }

    /**
     * Consulta níveis de acesso já atribuídos a um Morador/Visitante
     */
    public static async getPersonAccessLevels(personId: string) {
        return this.hikRequest('/artemis/api/acps/v1/accessLevel/person/accessLevelList', {
            method: 'POST',
            body: JSON.stringify({
                personIds: [personId],
                pageNo: 1,
                pageSize: 200
            })
        });
    }
}
