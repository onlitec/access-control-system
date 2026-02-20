"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HikCentralService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const node_fetch_1 = __importDefault(require("node-fetch"));
/**
 * HikCentral Professional OpenAPI Integration Service
 */
const APP_KEY = '26269542';
const APP_SECRET = 'AYmE6LIQrwJC81Rv1c6J';
const HIK_IP = '100.77.145.39';
const BASE_URL = `https://${HIK_IP}`;
class HikCentralService {
    static async generateSignature(method, path, headers, appSecret) {
        const lf = '\n';
        let stringToSign = method.toUpperCase() + lf;
        stringToSign += (headers['Accept'] || '') + lf;
        stringToSign += (headers['Content-MD5'] || '') + lf;
        stringToSign += (headers['Content-Type'] || '') + lf;
        stringToSign += (headers['Date'] || '') + lf;
        // CanonicalizedHeaders (x-ca- headers)
        const xCaHeaders = Object.keys(headers)
            .filter(key => key.toLowerCase().startsWith('x-ca-') && key.toLowerCase() !== 'x-ca-signature')
            .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
            .map(key => `${key.toLowerCase()}:${headers[key]}`)
            .join(lf);
        if (xCaHeaders) {
            stringToSign += xCaHeaders + lf;
        }
        stringToSign += path;
        console.log('StringToSign:', stringToSign.replace(/\n/g, '\\n'));
        return crypto_1.default
            .createHmac('sha256', appSecret)
            .update(stringToSign, 'utf8')
            .digest('base64');
    }
    static async hikRequest(path, options = {}) {
        const method = options.method || 'GET';
        const timestamp = Date.now().toString();
        const headers = {
            'Accept': '*/*',
            'Content-Type': 'application/json;charset=UTF-8',
            'X-Ca-Key': APP_KEY,
            'X-Ca-Timestamp': timestamp,
            'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
            ...options.headers,
        };
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        const signature = await this.generateSignature(method, cleanPath, headers, APP_SECRET);
        headers['X-Ca-Signature'] = signature;
        const url = `${BASE_URL}${cleanPath}`;
        // Desabilitar verificação SSL para IP local se necessário
        const response = await (0, node_fetch_1.default)(url, {
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
    static async addPerson(person) {
        return this.hikRequest('/artemis/api/resource/v1/person/single/add', {
            method: 'POST',
            body: JSON.stringify(person),
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
}
exports.HikCentralService = HikCentralService;
