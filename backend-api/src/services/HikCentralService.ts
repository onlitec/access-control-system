import crypto from 'crypto';
import fetch from 'node-fetch';
import { Agent } from 'https';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * HikCentral Professional OpenAPI Integration Service
 */

export class HikCentralService {
    // ============ Cache Singleton para VisitorGroupIDs ============
    private static cachedVisitorGroupIds: Map<string, { id: string; timestamp: number }> = new Map();
    private static readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

    /**
     * Limpa o cache de IDs de grupos (útil para testes ou refresh forçado).
     */
    public static clearVisitorGroupCache(): void {
        this.cachedVisitorGroupIds.clear();
    }

    /**
     * Obtém o ID de um grupo de visitantes com cache.
     * Se o ID já estiver em cache e não expirou, retorna do cache.
     * Caso contrário, busca na API e armazena em cache.
     */
    public static async getVisitorGroupIdCached(groupName: string): Promise<string> {
        const normalized = groupName.trim().toLowerCase();
        const cached = this.cachedVisitorGroupIds.get(normalized);
        
        if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
            console.log(`[HikCentral] Cache hit para grupo "${groupName}": ID=${cached.id}`);
            return cached.id;
        }

        console.log(`[HikCentral] Cache miss para grupo "${groupName}", buscando na API...`);
        const id = await this.getVisitorGroupIdByName(groupName);
        this.cachedVisitorGroupIds.set(normalized, { id, timestamp: Date.now() });
        console.log(`[HikCentral] Grupo "${groupName}" cacheado com ID=${id}`);
        return id;
    }

    private static async generateSignature(
        method: string,
        path: string,
        headers: Record<string, string>,
        appSecret: string
    ): Promise<string> {
        const lf = '\n';
        const parts: string[] = [method.toUpperCase(), lf];

        const accept = headers['accept'];
        if (accept) { parts.push(accept); parts.push(lf); }

        const contentMD5 = headers['content-md5'];
        if (contentMD5) { parts.push(contentMD5); parts.push(lf); }

        const contentType = headers['content-type'] || '';
        if (contentType) { parts.push(contentType); parts.push(lf); }

        const date = headers['date'];
        if (date) { parts.push(date); parts.push(lf); }

        // CanonicalizedHeaders (x-ca- headers)
        const xCaHeadersKeys = Object.keys(headers)
            .filter(key => key.startsWith('x-ca-') &&
                key !== 'x-ca-signature' &&
                key !== 'x-ca-signature-headers')
            .sort();

        const signedHeadersStr = xCaHeadersKeys.map(key => `${key}:${headers[key]}`).join('\n');
        if (signedHeadersStr) { parts.push(signedHeadersStr); parts.push(lf); }

        parts.push(path);

        const stringToSign = parts.join('');
        return crypto
            .createHmac('sha256', Buffer.from(appSecret, 'utf8'))
            .update(stringToSign, 'utf8')
            .digest('base64');
    }

    public static async hikRequest(path: string, options: any = {}) {
        const config = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
        if (!config || !config.apiUrl || !config.appKey || !config.appSecret) {
            console.error('[HikCentral] Credenciais não configuradas. Verifique HikcentralConfig no banco de dados.');
            throw new Error("HikCentral credentials not configured in Admin panel.");
        }

        const method = options.method || 'POST';
        const timestamp = Date.now().toString();

        const headers: Record<string, string> = {
            'accept': '*/*',
            'content-type': 'application/json',
            'x-ca-key': config.appKey,
            'x-ca-timestamp': timestamp,
            ...options.headers,
        };

        // Determine sign header keys (all x-ca-* except signature itself)
        const signHeaderKeys = Object.keys(headers)
            .filter(k => k.startsWith('x-ca-') && k !== 'x-ca-signature' && k !== 'x-ca-signature-headers')
            .sort();
        headers['x-ca-signature-headers'] = signHeaderKeys.join(',');

        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const signature = await this.generateSignature(method, cleanPath, headers, config.appSecret);
        headers['x-ca-signature'] = signature;

        // Ensure base URL does not end with /
        const baseUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
        const url = `${baseUrl}${cleanPath}`;

        // Log de debug para requisições
        console.log(`[HikCentral] === REQUISIÇÃO ===`);
        console.log(`  URL: ${url}`);
        console.log(`  Method: ${method}`);
        console.log(`  Path: ${cleanPath}`);
        console.log(`  X-Ca-Key: ${config.appKey.substring(0, 8)}...`);
        console.log(`  X-Ca-Timestamp: ${timestamp}`);
        console.log(`  X-Ca-Signature-Headers: ${headers['x-ca-signature-headers']}`);
        console.log(`  X-Ca-Signature: ${signature.substring(0, 20)}...`);
        console.log(`===========================`);

        // Desabilitar verificação SSL para IP local se necessário
        const response = await fetch(url, {
            ...options,
            headers,
            // @ts-ignore
            agent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`[HikCentral] ERRO ${response.status}: ${response.statusText}`);
            console.error(`[HikCentral] Resposta:`, JSON.stringify(errorData));
            throw new Error(errorData.msg || `Erro na requisição Hikcentral (${response.status}): ${response.statusText}`);
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
            'accept': '*/*',
            'content-type': 'application/json',
            'x-ca-key': config.appKey,
            'x-ca-timestamp': timestamp,
            ...options.headers,
        };

        // Determine sign header keys (all x-ca-* except signature itself)
        const signHeaderKeys = Object.keys(headers)
            .filter(k => k.startsWith('x-ca-') && k !== 'x-ca-signature' && k !== 'x-ca-signature-headers')
            .sort();
        headers['x-ca-signature-headers'] = signHeaderKeys.join(',');

        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const signature = await this.generateSignature(method, cleanPath, headers, config.appSecret);
        headers['x-ca-signature'] = signature;

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
     * Lista grupos de visitantes.
     * Endpoint: POST /artemis/api/visitor/v1/visitorgroups
     */
    public static async getVisitorGroups(params: {
        pageNo?: number;
        pageSize?: number;
        visitorGroupName?: string;
    } = {}) {
        const body: any = {
            pageNo: params.pageNo || 1,
            pageSize: params.pageSize || 100,
        };

        if (params.visitorGroupName?.trim()) {
            body.searchCriteria = {
                visitorGroupName: params.visitorGroupName.trim(),
            };
        }

        return this.hikRequest('/artemis/api/visitor/v1/visitorgroups', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Busca o indexCode (ID) de um grupo de visitantes pelo nome.
     * Regras:
     * - Busca TODOS os grupos primeiro (sem filtro de nome)
     * - Faz match case-insensitive com normalização de acentos
     * - Logs detalhados para debug
     */
    public static async getVisitorGroupIdByName(groupName: string): Promise<string> {
        const normalize = (value: string): string =>
            value
                .trim()
                .normalize('NFD')
                .replace(/\p{Diacritic}/gu, '')
                .toLowerCase();

        const normalizedTarget = normalize(groupName);
        if (!normalizedTarget) {
            throw new Error('groupName é obrigatório para buscar grupo de visitantes.');
        }

        console.log(`[HikCentral] Buscando grupo de visitantes: "${groupName}" (normalizado: "${normalizedTarget}")`);

        // SEMPRE busca todos os grupos para garantir que encontramos
        const result = await this.getVisitorGroups({ pageNo: 1, pageSize: 500 });
        // Estrutura real da API: data.VisitorGroupList.VisitorGroup com baseInfo.Name
        let list = result?.data?.VisitorGroupList?.VisitorGroup || result?.data?.list || result?.data?.VisitorGroupInfo || result?.data?.rows || [];

        if (!Array.isArray(list) || list.length === 0) {
            console.error('[HikCentral] Nenhum grupo de visitantes retornado pela API. Resposta:', JSON.stringify(result?.data || result));
            throw new Error(`Nenhum grupo de visitantes encontrado no HikCentral. Verifique a conexão e credenciais AK/SK.`);
        }

        // LOG CRÍTICO: Mostra TODOS os grupos encontrados para debug
        console.log(`[HikCentral] === GRUPOS ENCONTRADOS NO HIKCENTRAL (${list.length} grupos) ===`);
        const getName = (group: any): string =>
            String(group?.baseInfo?.Name || group?.visitorGroupName || group?.groupName || group?.name || '').trim();
        const getId = (group: any): string =>
            String(group?.indexCode || group?.visitorGroupID || group?.visitorGroupId || group?.id || '').trim();

        list.forEach((group: any, idx: number) => {
            const name = getName(group);
            const id = getId(group);
            const normalized = normalize(name);
            console.log(`  [${idx + 1}] Nome: "${name}" | ID: "${id}" | Normalizado: "${normalized}"`);
        });
        console.log('[HikCentral] ============================================================');

        // Match case-insensitive com normalização
        const exactMatch = list.find((group: any) => normalize(getName(group)) === normalizedTarget);
        const partialMatch = list.find((group: any) => {
            const candidate = normalize(getName(group));
            return candidate.includes(normalizedTarget) || normalizedTarget.includes(candidate);
        });
        const match = exactMatch || partialMatch;

        if (!match) {
            console.error(`[HikCentral] Grupo "${groupName}" NÃO ENCONTRADO. Grupos disponíveis:`, list.map((g: any) => getName(g)));
            throw new Error(`Grupo de visitantes "${groupName}" não encontrado no HikCentral. Verifique o nome exato no painel do HikCentral.`);
        }

        const groupId = getId(match);
        if (!groupId) {
            throw new Error(`Grupo de visitantes "${groupName}" encontrado sem indexCode válido.`);
        }

        console.log(`[HikCentral] Grupo "${groupName}" encontrado com sucesso! ID: ${groupId}`);
        return groupId;
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
        if (params.orgIndexCode && params.orgIndexCode !== 'ALL') {
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
     * Buscar visitantes cadastrados no módulo de Visitantes do HikCentral
     * Endpoint: POST /artemis/api/visitor/v1/visitor/visitorInfo
     */
    public static async getVisitorsByGroupId(
        visitorGroupId: number | string,
        params: {
            pageNo?: number;
            pageSize?: number;
            personName?: string;
            phoneNum?: string;
            identifiyCode?: string;
        } = {}
    ) {
        const body: any = {
            pageNo: params.pageNo || 1,
            pageSize: params.pageSize || 500,
            searchCriteria: {
                visitorGroupID: visitorGroupId,
            },
        };

        if (params.personName) body.searchCriteria.personName = params.personName;
        if (params.phoneNum) body.searchCriteria.phoneNum = params.phoneNum;
        if (params.identifiyCode) body.searchCriteria.identifiyCode = params.identifiyCode;

        return this.hikRequest('/artemis/api/visitor/v1/visitor/visitorInfo', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Busca visitantes filtrando dinamicamente por nome do grupo.
     * Utiliza cache para evitar lookup repetido do groupId.
     */
    public static async getVisitorsByGroupName(
        groupName: string,
        params: {
            pageNo?: number;
            pageSize?: number;
            personName?: string;
            phoneNum?: string;
            identifiyCode?: string;
        } = {}
    ) {
        const groupId = await this.getVisitorGroupIdCached(groupName);
        const result = await this.getVisitorsByGroupId(groupId, params);
        return { groupId, result };
    }

    /**
     * Compatibilidade retroativa.
     * Mantém assinatura anterior e redireciona para filtro correto via searchCriteria.visitorGroupID.
     */
    public static async getVisitorList(params: {
        pageNo?: number;
        pageSize?: number;
        personName?: string;
        phoneNum?: string;
        identifiyCode?: string;
        visitorGroupId?: number | string;
    } = {}) {
        if (params.visitorGroupId !== undefined) {
            return this.getVisitorsByGroupId(params.visitorGroupId, params);
        }

        const body: any = {
            pageNo: params.pageNo || 1,
            pageSize: params.pageSize || 500,
        };
        if (params.personName || params.phoneNum || params.identifiyCode) {
            body.searchCriteria = {};
            if (params.personName) body.searchCriteria.personName = params.personName;
            if (params.phoneNum) body.searchCriteria.phoneNum = params.phoneNum;
            if (params.identifiyCode) body.searchCriteria.identifiyCode = params.identifiyCode;
        }
        return this.hikRequest('/artemis/api/visitor/v1/visitor/visitorInfo', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Buscar lista de agendamentos/reservas de visitantes
     * Endpoint: POST /artemis/api/visitor/v1/appointment/appointmentlist
     */
    public static async getAppointmentList(params: {
        pageNo?: number;
        pageSize?: number;
        appointStartTime: string;
        appointEndTime: string;
        visitorName?: string;
        appointState?: string;
    }) {
        return this.hikRequest('/artemis/api/visitor/v1/appointment/appointmentlist', {
            method: 'POST',
            body: JSON.stringify({
                pageNo: params.pageNo || 1,
                pageSize: params.pageSize || 100,
                appointStartTime: params.appointStartTime,
                appointEndTime: params.appointEndTime,
                visitorName: params.visitorName || '',
                appointState: params.appointState || '',
            }),
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