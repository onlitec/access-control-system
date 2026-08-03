"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HikCentralService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const HIKCENTRAL_IP_BASE = process.env.HIKCENTRAL_IP_BASE || '';
/**
 * HikCentral Professional OpenAPI Integration Service
 */
class HikCentralService {
    /**
     * Valida se o buffer contém o Magic Byte do JPEG (/9j/4 em base64 -> FF D8 FF in HEX)
     */
    static validateJpeg(buffer) {
        if (!buffer || buffer.length < 3)
            return false;
        // FF D8 FF
        return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    }
    /**
     * Sanitiza a URL garantindo o uso do HIKCENTRAL_IP_BASE
     */
    static sanitizeUrl(url) {
        if (!HIKCENTRAL_IP_BASE)
            return url;
        try {
            const parsedUrl = new URL(url);
            if (parsedUrl.hostname !== HIKCENTRAL_IP_BASE) {
                console.log(`[HikCentral] Sanitizing URL: Replacing ${parsedUrl.hostname} with ${HIKCENTRAL_IP_BASE}`);
                parsedUrl.hostname = HIKCENTRAL_IP_BASE;
            }
            return parsedUrl.toString();
        }
        catch (e) {
            // Se falhar o parse (ex: path relativo), retorna como está
            return url;
        }
    }
    static async generateSignature(method, path, headers, appSecret) {
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
        return crypto_1.default
            .createHmac('sha256', appSecret)
            .update(stringToSign, 'utf8')
            .digest('base64');
    }
    /** true somente quando há credenciais completas do HikCentral no painel Admin */
    static async isConfigured() {
        const now = Date.now();
        if (this._configuredCache && now - this._configuredCache.ts < 60000) {
            return this._configuredCache.value;
        }
        const config = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
        const value = !!(config && config.apiUrl && config.appKey && config.appSecret);
        this._configuredCache = { value, ts: now };
        return value;
    }
    static async hikRequest(path, options = {}) {
        const config = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
        if (!config || !config.apiUrl || !config.appKey || !config.appSecret) {
            throw new Error("HikCentral credentials not configured in Admin panel.");
        }
        const method = options.method || 'GET';
        const timestamp = Date.now().toString();
        const dateStr = new Date().toUTCString();
        const headers = {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'Date': dateStr,
            'X-Ca-Key': config.appKey,
            'X-Ca-Timestamp': timestamp,
            'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
            ...options.headers,
        };
        if (options.body) {
            headers['Content-MD5'] = crypto_1.default.createHash('md5').update(options.body, 'utf8').digest('base64');
        }
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const signature = await this.generateSignature(method, cleanPath, headers, config.appSecret);
        headers['X-Ca-Signature'] = signature;
        // Ensure base URL does not end with /
        const baseUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
        const url = this.sanitizeUrl(`${baseUrl}${cleanPath}`);
        // Desabilitar verificação SSL para IP local se necessário
        const response = await (0, node_fetch_1.default)(url, {
            ...options,
            headers,
            // @ts-ignore
            agent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.msg || errorData.message || response.statusText;
            const errorCode = errorData.code;
            // Tratamento especial para erro de versão não suportada (code 8)
            if (errorCode === '8' || errorCode === 8) {
                throw new Error(`HikCentral: Versão do produto não suporta este recurso (${path}).`);
            }
            throw new Error(errorMsg || `Erro na requisição Hikcentral: ${response.statusText}`);
        }
        const result = await response.json();
        // Algumas APIs retornam 200 OK mas com erro no corpo JSON
        if (result && (result.code === '8' || result.code === 8)) {
            throw new Error(`HikCentral: Versão do produto não suporta este recurso (${path}).`);
        }
        return result;
    }
    /**
     * Requisição ao HikCentral que retorna dados binários (imagens, etc.)
     */
    static async hikRequestRaw(path, options = {}) {
        const config = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
        if (!config || !config.apiUrl || !config.appKey || !config.appSecret) {
            throw new Error("HikCentral credentials not configured in Admin panel.");
        }
        const method = options.method || 'POST';
        const timestamp = Date.now().toString();
        const dateStr = new Date().toUTCString();
        const headers = {
            'Accept': '*/*',
            'Content-Type': 'application/json',
            'Date': dateStr,
            'X-Ca-Key': config.appKey,
            'X-Ca-Timestamp': timestamp,
            'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
            ...options.headers,
        };
        if (options.body) {
            headers['Content-MD5'] = crypto_1.default.createHash('md5').update(options.body, 'utf8').digest('base64');
        }
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const signature = await this.generateSignature(method, cleanPath, headers, config.appSecret);
        headers['X-Ca-Signature'] = signature;
        const rawBaseUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
        const url = this.sanitizeUrl(`${rawBaseUrl}${cleanPath}`);
        const response = await (0, node_fetch_1.default)(url, {
            ...options,
            headers,
            // @ts-ignore
            agent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        if (!response.ok) {
            throw new Error(`Erro ao buscar imagem do HikCentral: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // Validação estrita do JPEG (Rule 4.d)
        if (!this.validateJpeg(buffer)) {
            console.error(`[HikCentral] Falha na validação de Magic Byte JPEG para ${path}`);
            throw new Error('Formato de imagem inválido (Magic Byte mismatch)');
        }
        return buffer;
    }
    /**
     * Buscar foto (face) de uma pessoa pelo personId
     * Tenta buscar via picUri do personPhoto ou via API dedicada
     */
    static async getPersonPhoto(personId) {
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
            let buffer;
            let contentType = 'image/jpeg';
            // Se for um link absoluto externo (raro no Artemis)
            if (picUri.startsWith('http')) {
                const imgRes = await (0, node_fetch_1.default)(picUri, {
                    // @ts-ignore
                    agent: new (require('https').Agent)({ rejectUnauthorized: false })
                });
                if (!imgRes.ok)
                    throw new Error(`Fetch externo falhou: ${imgRes.statusText}`);
                buffer = Buffer.from(await imgRes.arrayBuffer());
                contentType = imgRes.headers.get('content-type') || 'image/jpeg';
            }
            else {
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
                }
                catch (e) {
                    console.warn(`[HikCentral] Falha no path direto ${apiPath}, tentando via person/picture API:`, e.message);
                    // Fallback para API oficial de picture se disponível
                    try {
                        buffer = await this.hikRequestRaw('/artemis/api/resource/v1/person/picture', {
                            method: 'POST',
                            body: JSON.stringify({ personId, picUri })
                        });
                        contentType = 'image/jpeg';
                    }
                    catch (e2) {
                        console.error(`[HikCentral] Todas as tentativas de buscar foto para ${personId} falharam:`, e2.message);
                        return null;
                    }
                }
            }
            return { buffer, contentType };
        }
        catch (error) {
            console.error(`[HikCentral] Erro crítico ao buscar foto de ${personId}:`, error.message);
            return null;
        }
    }
    /**
     * Sincronização de moradores (addPerson)
     */
    static async addPerson(person) {
        const payload = { ...person };
        if (person.personProperties) {
            payload.personCustomList = person.personProperties.map((p) => ({
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
    static async addPersonFace(personId, faceData) {
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
    static async updatePerson(person) {
        const payload = { ...person };
        // Mapear personId para indexCode (campo esperado pela API HikCentral)
        payload.indexCode = person.personId;
        if (person.personProperties) {
            payload.personCustomList = person.personProperties.map((p) => ({
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
     * Remover pessoa do HikCentral (deletePerson)
     * Usado pela fila de sincronização assíncrona (HikCentralSyncQueueService)
     * quando um registro local (ex.: prestador) é apagado.
     */
    static async deletePerson(personId) {
        return this.hikRequest('/artemis/api/resource/v1/person/single/delete', {
            method: 'POST',
            body: JSON.stringify({ personId }),
        });
    }
    /**
     * Implementação da API v1 de visitantes (reserveVisitor)
     */
    static async reserveVisitor(visitor) {
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
    static async getVisitorList(pageNo = 1, pageSize = 200, searchName) {
        const body = { pageNo, pageSize };
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
    static async getAccessLogs(params) {
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
    static async getOrgList(pageNo = 1, pageSize = 100) {
        return this.hikRequest('/artemis/api/resource/v1/org/orgList', {
            method: 'POST',
            body: JSON.stringify({ pageNo, pageSize }),
        });
    }
    /**
     * Listar pessoas por orgIndexCode (departamento)
     */
    static async getPersonList(params) {
        const body = {
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
    static async getPersonListByOrgName(orgName, pageNo = 1, pageSize = 200) {
        // Buscar lista de organizações
        const orgResult = await this.getOrgList(1, 500);
        const orgs = orgResult?.data?.list || [];
        // Encontrar o departamento "MORADORES"
        const targetOrg = orgs.find((org) => org.orgName?.toUpperCase() === orgName.toUpperCase() ||
            org.orgName?.toUpperCase().includes(orgName.toUpperCase()));
        if (!targetOrg) {
            console.log(`Departamento "${orgName}" não encontrado. Departamentos disponíveis:`, orgs.map((o) => `${o.orgName} (${o.orgIndexCode})`));
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
    static async getAcsDeviceList(pageNo = 1, pageSize = 100) {
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
    static async getAccessLevelList(pageNo = 1, pageSize = 100) {
        return this.hikRequest('/artemis/api/resource/v1/accessLevel/accessLevelList', {
            method: 'POST',
            body: JSON.stringify({ pageNo, pageSize }),
        });
    }
    /**
     * Listar definições de campos customizados/adicionais
     */
    static async getCustomFields() {
        return this.hikRequest('/artemis/api/resource/v1/person/fieldList', {
            method: 'POST',
            body: JSON.stringify({}),
        });
    }
    /**
     * Aplicar/Autorizar níveis de acesso a uma pessoa
     */
    static async authorizePerson(personId, accessLevelIndexCodes, personType = '1') {
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
    static async getPersonAccessLevels(personId) {
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
    static async fetchVisitorsWithStatus(groupName) {
        const visitors = [];
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
                }
                else {
                    pageNo++;
                }
            }
            catch (err) {
                console.error(`[HikCentral] fetchVisitorsWithStatus erro:`, err.message);
                hasMore = false;
            }
        }
        return visitors;
    }
    /**
     * Busca pessoas (ACS) cadastradas em um departamento específico.
     */
    static async getPersonsByDepartment(orgIndexCode) {
        const persons = [];
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
                }
                else {
                    pageNo++;
                }
            }
            catch (err) {
                console.error(`[HikCentral] getPersonsByDepartment erro:`, err.message);
                hasMore = false;
            }
        }
        return persons;
    }
    /**
     * Obtém dados do cache ou busca do HikCentral
     */
    static async getWithCache(cacheKey, entityType, fetcher) {
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
    static clearCache(entityType) {
        if (entityType) {
            // Limpa apenas entradas desse tipo
            for (const key of this.entityCache.keys()) {
                if (key.startsWith(entityType + ':')) {
                    this.entityCache.delete(key);
                }
            }
            console.log(`[HikCentral Cache] Cleared: ${entityType}`);
        }
        else {
            this.entityCache.clear();
            console.log('[HikCentral Cache] Cleared all');
        }
    }
    /**
     * Áreas Físicas (Regions) - Tree view de áreas do condomínio
     * Endpoint: POST /artemis/api/resource/v1/regions
     */
    static async getRegionsList(pageNo = 1, pageSize = 100) {
        return this.getWithCache(`AREA:regions:${pageNo}`, 'AREA', () => this.hikRequest('/artemis/api/resource/v1/regions', {
            method: 'POST',
            body: JSON.stringify({ pageNo, pageSize }),
        }));
    }
    /**
     * Níveis de Acesso / Privilege Groups
     * Endpoint: POST /artemis/api/acs/v1/privilege/group
     * type: 1 = acesso geral, 2 = visitantes
     */
    static async getPrivilegeGroups(type = 1, pageNo = 1, pageSize = 500) {
        return this.getWithCache(`ACCESS_LEVEL:privilege:${type}:${pageNo}`, 'ACCESS_LEVEL', () => this.hikRequest('/artemis/api/acs/v1/privilege/group', {
            method: 'POST',
            body: JSON.stringify({ pageNo, pageSize, type }),
        }));
    }
    /**
     * Pisos/Andares (Floors)
     * Endpoint: POST /artemis/api/vehicle/v1/floor/list
     */
    static async getFloorsList(pageNo = 1, pageSize = 100) {
        return this.getWithCache(`FLOOR:list:${pageNo}`, 'FLOOR', () => this.hikRequest('/artemis/api/vehicle/v1/floor/list', {
            method: 'POST',
            body: JSON.stringify({ pageNo, pageSize }),
        }));
    }
    /**
     * Grupos de Visitantes
     * Endpoint: POST /artemis/api/visitor/v1/visitorgroups
     */
    static async getVisitorGroups(pageNo = 1, pageSize = 100) {
        return this.getWithCache(`VISITOR_GROUP:list:${pageNo}`, 'VISITOR_GROUP', () => this.hikRequest('/artemis/api/visitor/v1/visitorgroups', {
            method: 'POST',
            body: JSON.stringify({ pageNo, pageSize }),
        }));
    }
    /**
     * Organizações com cache (wrapper do getOrgList)
     */
    static async getOrgListCached(pageNo = 1, pageSize = 200) {
        return this.getWithCache(`ORGANIZATION:list:${pageNo}`, 'ORGANIZATION', () => this.getOrgList(pageNo, pageSize));
    }
    /**
     * Campos Customizados com cache (wrapper do getCustomFields)
     */
    static async getCustomFieldsCached() {
        return this.getWithCache('CUSTOM_FIELD:list', 'CUSTOM_FIELD', () => this.getCustomFields());
    }
    /**
     * Tenta resolver o indexCode de uma câmera baseada no deviceId (id do terminal de face)
     * No HikCentral, um terminal (ACS) pode ter uma câmera vinculada ou ser tratado como uma
     */
    static async resolveCameraIndexCodeByDeviceId(deviceId) {
        console.log(`[HikCentral] Resolvendo câmera para dispositivo: ${deviceId}`);
        try {
            // 1. Tenta buscar câmeras vinculadas ao dispositivo
            const cameraResult = await this.hikRequest('/artemis/api/resource/v1/cameras', {
                method: 'POST',
                body: JSON.stringify({ pageNo: 1, pageSize: 1000 })
            });
            const cameras = cameraResult?.data?.list || [];
            // Busca uma câmera que tenha o deviceId no parentIndexCode ou nome similar
            const targetCamera = cameras.find((c) => c.parentIndexCode === deviceId ||
                c.cameraName?.includes(deviceId) ||
                c.indexCode === deviceId);
            if (targetCamera) {
                console.log(`[HikCentral] Câmera encontrada: ${targetCamera.indexCode}`);
                return targetCamera.indexCode;
            }
            console.log(`[HikCentral] Nenhuma câmera específica encontrada para ${deviceId}, retornando o próprio ID.`);
            return deviceId;
        }
        catch (e) {
            console.error(`[HikCentral] Erro ao resolver câmera (fallback para deviceId):`, e.message);
            return deviceId;
        }
    }
    /**
     * Captura uma foto em tempo real de uma câmera ou terminal
     * Suporta fallback entre Video Capture e ACS Capture
     */
    static async captureCameraPicture(indexCode) {
        console.log(`[HikCentral] Iniciando captura para: ${indexCode}`);
        // Tentativa 1: Manual Capture (Video Module)
        try {
            console.log(`[HikCentral] Tentando captura via Vídeo (/artemis/api/video/v1/manualCapture)...`);
            const response = await this.hikRequest('/artemis/api/video/v1/manualCapture', {
                method: 'POST',
                body: JSON.stringify({ cameraIndexCode: indexCode })
            });
            if (response?.data?.picUrl || response?.data?.picUri) {
                const picUrl = response.data.picUrl || response.data.picUri;
                console.log(`[HikCentral] Sucesso via Vídeo. URL: ${picUrl}`);
                return await this.hikRequestRaw(picUrl, { method: 'GET' });
            }
            console.warn("[HikCentral] API de Vídeo retornou sucesso mas sem picUrl. Resposta:", JSON.stringify(response));
        }
        catch (e) {
            const status = e.response?.status;
            const data = e.response?.data;
            console.warn(`[HikCentral] Captura via Vídeo falhou (Status: ${status}): ${e.message}. Detalhes: ${JSON.stringify(data || {})}. Tentando via ACS...`);
        }
        // Tentativa 2: ACS Capture (Access Control Module)
        try {
            console.log(`[HikCentral] Tentando captura via ACS (/artemis/api/acs/v1/device/capture)...`);
            // Algumas versões usam /api/acs/v1/device/capture
            const response = await this.hikRequest('/artemis/api/acs/v1/device/capture', {
                method: 'POST',
                body: JSON.stringify({ deviceIndexCode: indexCode })
            });
            if (response?.data?.picUrl || response?.data?.picUri) {
                const picUrl = response.data.picUrl || response.data.picUri;
                console.log(`[HikCentral] Sucesso via ACS. URL: ${picUrl}`);
                return await this.hikRequestRaw(picUrl, { method: 'GET' });
            }
            console.warn("[HikCentral] API de ACS retornou sucesso mas sem picUrl. Resposta:", JSON.stringify(response));
        }
        catch (e2) {
            const status = e2.response?.status;
            const data = e2.response?.data;
            console.error(`[HikCentral] Captura via ACS também falhou (Status: ${status}): ${e2.message}. Detalhes: ${JSON.stringify(data || {})}`);
        }
        // Tentativa 3: Face Capture (Face Module) - Fallback extra
        try {
            console.log(`[HikCentral] Tentando captura via Face (/artemis/api/resource/v1/face/capture)...`);
            const response = await this.hikRequest('/artemis/api/resource/v1/face/capture', {
                method: 'POST',
                body: JSON.stringify({ cameraIndexCode: indexCode })
            });
            if (response?.data?.picUrl || response?.data?.picUri) {
                const picUrl = response.data.picUrl || response.data.picUri;
                console.log(`[HikCentral] Sucesso via Face. URL: ${picUrl}`);
                return await this.hikRequestRaw(picUrl, { method: 'GET' });
            }
        }
        catch (e3) {
            const status = e3.response?.status;
            const data = e3.response?.data;
            console.error(`[HikCentral] Captura via Face também falhou (Status: ${status}): ${e3.message}. Detalhes: ${JSON.stringify(data || {})}`);
        }
        throw new Error(`Falha total na captura para o dispositivo ${indexCode}. Nenhuma das APIs (Video, ACS, Face) retornou uma URL válida.`);
    }
}
exports.HikCentralService = HikCentralService;
// Cache do estado de configuração (TTL 60 s) para permitir que todos os
// pontos de integração pulem chamadas ao HikCentral no modo standalone
// sem custo de uma query por verificação.
HikCentralService._configuredCache = null;
// ============ CMS Data-Driven: Entity Fetchers with Cache ============
// Cache em memória com TTL por tipo de entidade
HikCentralService.entityCache = new Map();
HikCentralService.CACHE_TTL = {
    ORGANIZATION: 5 * 60 * 1000, // 5 min
    AREA: 10 * 60 * 1000, // 10 min
    ACCESS_LEVEL: 15 * 60 * 1000, // 15 min
    CUSTOM_FIELD: 30 * 60 * 1000, // 30 min
    FLOOR: 60 * 60 * 1000, // 1 hora
    VISITOR_GROUP: 5 * 60 * 1000, // 5 min
};
