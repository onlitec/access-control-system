import crypto from 'crypto';
import fetch from 'node-fetch';
import { Agent } from 'https';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * interface para visitantes com status
 */
export interface VisitorWithStatus {
    visitorId: string;
    visitorName: string;
    indexCode: string;
    visitorGroupName: string;
    certificateNo: string;
    phoneNum: string;
    plateNo: string;
    visitStartTime: string;
    visitEndTime: string;
    appointmentId?: string;
    appointStatus?: number;
    appointStatusText?: string;
    appointStartTime?: string;
    appointEndTime?: string;
    status: number; // 0=scheduled, 1=finished, 2=active, 3=expired
}

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

        if (xCaHeadersKeys.length > 0) {
            stringToSign += xCaHeadersKeys.map(key => `${key.toLowerCase()}:${headers[key]}`).join('\n');
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
        const dateStr = new Date().toUTCString();

        const headers: Record<string, string> = {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'Date': dateStr,
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
        const dateStr = new Date().toUTCString();

        const headers: Record<string, string> = {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'Date': dateStr,
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
                body: JSON.stringify({ personIds: [personId], pageNo: 1, pageSize: 1 }),
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

    /**
     * Busca todos os visitantes de um grupo com status
     */
    public static async fetchVisitorsWithStatus(groupName: string): Promise<VisitorWithStatus[]> {
        const visitors: VisitorWithStatus[] = [];
        let pageNo = 1;
        const pageSize = 500;
        let hasMore = true;

        while (hasMore) {
            try {
                const response = await this.hikRequest('/artemis/api/resource/v1/person/visitor/advance/list', {
                    method: 'POST',
                    body: JSON.stringify({
                        pageNo,
                        pageSize,
                        searchCriteria: {
                            visitorGroupName: groupName,
                        },
                    }),
                });

                const list = response?.data?.list || [];
                const total = Number(response?.data?.total) || 0;

                for (const v of list) {
                    visitors.push({
                        visitorId: v.visitorId,
                        visitorName: v.visitorName,
                        indexCode: v.indexCode,
                        visitorGroupName: v.visitorGroupName || groupName,
                        certificateNo: v.certificateNo,
                        phoneNum: v.phoneNum,
                        plateNo: v.plateNo,
                        visitStartTime: v.visitStartTime,
                        visitEndTime: v.visitEndTime,
                        appointmentId: v.appointmentId,
                        appointStatus: v.appointStatus ?? v.status,
                        appointStatusText: v.appointStatusText,
                        appointStartTime: v.appointStartTime,
                        appointEndTime: v.appointEndTime,
                        status: v.status ?? v.appointStatus
                    });
                }

                if (list.length < pageSize || visitors.length >= total) {
                    hasMore = false;
                } else {
                    pageNo++;
                }
            } catch (err: any) {
                console.error(`[HikCentral] fetchVisitorsWithStatus erro:`, err.message);
                hasMore = false;
            }
        }
        return visitors;
    }

    /**
     * Busca pessoas (ACS) cadastradas em um departamento específico.
     */
    public static async getPersonsByDepartment(orgIndexCode: string): Promise<any[]> {
        const persons: any[] = [];
        let pageNo = 1;
        const pageSize = 500;
        let hasMore = true;

        while (hasMore) {
            try {
                const response = await this.hikRequest('/artemis/api/resource/v1/person/advance/personList', {
                    method: 'POST',
                    body: JSON.stringify({
                        pageNo,
                        pageSize,
                        searchCriteria: {
                            orgIndexCode,
                        },
                    }),
                });

                const list = response?.data?.list || [];
                const total = Number(response?.data?.total) || 0;

                for (const person of list) {
                    persons.push({
                        id: person.personId || person.indexCode,
                        person_id: person.personId || person.indexCode,
                        person_name: person.personName || `${person.firstName || ''} ${person.lastName || ''}`.trim(),
                        gender: person.gender,
                        phone_num: person.phoneNum || person.phone || '',
                        certificate_no: person.certificateNo || '',
                        certificate_type: person.certificateType,
                        org_index_code: person.orgIndexCode || orgIndexCode,
                        org_name: person.orgName || '',
                        job_title: person.jobTitle || '',
                        email: person.email || '',
                    });
                }

                if (list.length < pageSize || persons.length >= total) {
                    hasMore = false;
                } else {
                    pageNo++;
                }
            } catch (err: any) {
                console.error(`[HikCentral] getPersonsByDepartment erro:`, err.message);
                hasMore = false;
            }
        }
        return persons;
    }

    // ============ CMS Data-Driven: Entity Fetchers with Cache ============
    
    // Cache em memória com TTL por tipo de entidade
    private static entityCache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
    private static readonly CACHE_TTL = {
        ORGANIZATION: 5 * 60 * 1000,    // 5 min
        AREA: 10 * 60 * 1000,          // 10 min
        ACCESS_LEVEL: 15 * 60 * 1000,  // 15 min
        CUSTOM_FIELD: 30 * 60 * 1000,  // 30 min
        FLOOR: 60 * 60 * 1000,         // 1 hora
        VISITOR_GROUP: 5 * 60 * 1000,  // 5 min
    };

    /**
     * Obtém dados do cache ou busca do HikCentral
     */
    private static async getWithCache<T>(
        cacheKey: string,
        entityType: keyof typeof HikCentralService.CACHE_TTL,
        fetcher: () => Promise<T>
    ): Promise<T> {
        const cached = this.entityCache.get(cacheKey);
        const now = Date.now();
        
        if (cached && (now - cached.timestamp) < cached.ttl) {
            console.log(`[HikCentral Cache] HIT: ${cacheKey}`);
            return cached.data;
        }
        
        console.log(`[HikCentral Cache] MISS: ${cacheKey}`);
        const data = await fetcher();
        
        this.entityCache.set(cacheKey, {
            data,
            timestamp: now,
            ttl: this.CACHE_TTL[entityType]
        });
        
        return data;
    }

    /**
     * Limpa cache por tipo ou completamente
     */
    public static clearCache(entityType?: keyof typeof HikCentralService.CACHE_TTL) {
        if (entityType) {
            // Limpa apenas entradas desse tipo
            for (const key of this.entityCache.keys()) {
                if (key.startsWith(entityType + ':')) {
                    this.entityCache.delete(key);
                }
            }
            console.log(`[HikCentral Cache] Cleared: ${entityType}`);
        } else {
            this.entityCache.clear();
            console.log('[HikCentral Cache] Cleared all');
        }
    }

    /**
     * Áreas Físicas (Regions) - Tree view de áreas do condomínio
     * Endpoint: POST /artemis/api/resource/v1/regions
     */
    public static async getRegionsList(pageNo = 1, pageSize = 100) {
        return this.getWithCache(
            `AREA:regions:${pageNo}`,
            'AREA',
            () => this.hikRequest('/artemis/api/resource/v1/regions', {
                method: 'POST',
                body: JSON.stringify({ pageNo, pageSize }),
            })
        );
    }

    /**
     * Níveis de Acesso / Privilege Groups
     * Endpoint: POST /artemis/api/acs/v1/privilege/group
     * type: 1 = acesso geral, 2 = visitantes
     */
    public static async getPrivilegeGroups(type = 1, pageNo = 1, pageSize = 500) {
        return this.getWithCache(
            `ACCESS_LEVEL:privilege:${type}:${pageNo}`,
            'ACCESS_LEVEL',
            () => this.hikRequest('/artemis/api/acs/v1/privilege/group', {
                method: 'POST',
                body: JSON.stringify({ pageNo, pageSize, type }),
            })
        );
    }

    /**
     * Pisos/Andares (Floors)
     * Endpoint: POST /artemis/api/vehicle/v1/floor/list
     */
    public static async getFloorsList(pageNo = 1, pageSize = 100) {
        return this.getWithCache(
            `FLOOR:list:${pageNo}`,
            'FLOOR',
            () => this.hikRequest('/artemis/api/vehicle/v1/floor/list', {
                method: 'POST',
                body: JSON.stringify({ pageNo, pageSize }),
            })
        );
    }

    /**
     * Grupos de Visitantes
     * Endpoint: POST /artemis/api/visitor/v1/visitorgroups
     */
    public static async getVisitorGroups(pageNo = 1, pageSize = 100) {
        return this.getWithCache(
            `VISITOR_GROUP:list:${pageNo}`,
            'VISITOR_GROUP',
            () => this.hikRequest('/artemis/api/visitor/v1/visitorgroups', {
                method: 'POST',
                body: JSON.stringify({ pageNo, pageSize }),
            })
        );
    }

    /**
     * Organizações com cache (wrapper do getOrgList)
     */
    public static async getOrgListCached(pageNo = 1, pageSize = 200) {
        return this.getWithCache(
            `ORGANIZATION:list:${pageNo}`,
            'ORGANIZATION',
            () => this.getOrgList(pageNo, pageSize)
        );
    }

    /**
     * Campos Customizados com cache (wrapper do getCustomFields)
     */
    public static async getCustomFieldsCached() {
        return this.getWithCache(
            'CUSTOM_FIELD:list',
            'CUSTOM_FIELD',
            () => this.getCustomFields()
        );
    }
}
