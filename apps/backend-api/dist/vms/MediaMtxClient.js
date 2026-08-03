"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaMtxClient = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const config_1 = require("./config");
/**
 * Cliente da API de controle do MediaMTX (porta 9997, só loopback).
 * Os paths de câmera NÃO ficam no mediamtx.yml — são criados/ajustados em
 * runtime por aqui, a partir das tabelas video_devices/video_channels.
 */
class MediaMtxClient {
    constructor(baseUrl = config_1.MEDIAMTX_API_URL) {
        this.baseUrl = baseUrl;
    }
    async request(method, apiPath, body) {
        return (0, node_fetch_1.default)(`${this.baseUrl}${apiPath}`, {
            method,
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(8000),
        });
    }
    async isUp() {
        try {
            const res = await this.request('GET', '/v3/config/global/get');
            return res.ok;
        }
        catch {
            return false;
        }
    }
    /** Lista todos os paths configurados (paginado). */
    async listConfigPaths() {
        const items = [];
        let page = 0;
        for (;;) {
            const res = await this.request('GET', `/v3/config/paths/list?itemsPerPage=100&page=${page}`);
            if (!res.ok)
                throw new Error(`MediaMTX list paths: HTTP ${res.status}`);
            const data = await res.json();
            items.push(...(data.items || []));
            page += 1;
            if (page >= (data.pageCount || 1))
                break;
        }
        return items;
    }
    async addPath(name, conf) {
        const res = await this.request('POST', `/v3/config/paths/add/${encodeURIComponent(name)}`, conf);
        if (!res.ok)
            throw new Error(`MediaMTX add path ${name}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
    }
    async patchPath(name, conf) {
        const res = await this.request('PATCH', `/v3/config/paths/patch/${encodeURIComponent(name)}`, conf);
        if (!res.ok)
            throw new Error(`MediaMTX patch path ${name}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
    }
    async deletePath(name) {
        const res = await this.request('DELETE', `/v3/config/paths/delete/${encodeURIComponent(name)}`);
        if (!res.ok && res.status !== 404) {
            throw new Error(`MediaMTX delete path ${name}: HTTP ${res.status}`);
        }
    }
}
exports.MediaMtxClient = MediaMtxClient;
