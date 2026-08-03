"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.basicAuth = basicAuth;
exports.computeDigestAuthHeader = computeDigestAuthHeader;
exports.digestFetch = digestFetch;
const node_fetch_1 = __importDefault(require("node-fetch"));
const https_1 = require("https");
const crypto_1 = require("crypto");
const httpsAgent = new https_1.Agent({ rejectUnauthorized: false });
function basicAuth(username, password) {
    return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}
/**
 * Monta o header `Authorization: Digest ...` (RFC 2617/MD5) a partir do desafio
 * `WWW-Authenticate` devolvido num 401. Extraída de `digestFetch` para poder ser
 * reaproveitada em conexões de longa duração (ex.: PUT streaming do TwoWayAudio),
 * onde o handshake (probe → 401 → replay) só pode acontecer UMA vez no início —
 * não a cada chunk de dados enviado.
 */
function computeDigestAuthHeader(wwwAuth, method, uri, username, password) {
    if (!wwwAuth.toLowerCase().startsWith('digest'))
        return null;
    const field = (name) => {
        const m = wwwAuth.match(new RegExp(`${name}="([^"]+)"`, 'i'))
            || wwwAuth.match(new RegExp(`${name}=([^\\s,]+)`, 'i'));
        return m ? m[1] : '';
    };
    const realm = field('realm');
    const nonce = field('nonce');
    const qop = field('qop');
    const opaque = field('opaque');
    const algo = field('algorithm') || 'MD5';
    const md5 = (...parts) => (0, crypto_1.createHash)('md5').update(parts.join(':')).digest('hex');
    const ha1 = md5(username, realm, password);
    const ha2 = md5(method, uri);
    if (qop === 'auth' || qop === 'auth-int') {
        const nc = '00000001';
        const cnonce = (0, crypto_1.randomBytes)(8).toString('hex');
        const response = md5(ha1, nonce, nc, cnonce, qop, ha2);
        return [
            `Digest username="${username}"`,
            `realm="${realm}"`,
            `nonce="${nonce}"`,
            `uri="${uri}"`,
            `qop=${qop}`,
            `nc=${nc}`,
            `cnonce="${cnonce}"`,
            `response="${response}"`,
            `algorithm=${algo}`,
            ...(opaque ? [`opaque="${opaque}"`] : []),
        ].join(', ');
    }
    const response = md5(ha1, nonce, ha2);
    return [
        `Digest username="${username}"`,
        `realm="${realm}"`,
        `nonce="${nonce}"`,
        `uri="${uri}"`,
        `response="${response}"`,
        `algorithm=${algo}`,
        ...(opaque ? [`opaque="${opaque}"`] : []),
    ].join(', ');
}
/**
 * Two-step Digest Auth (RFC 2617 / MD5) — autenticação ISAPI usada por todos os
 * equipamentos Hikvision do projeto (videoporteiros, terminais faciais,
 * câmeras/NVRs do VMS): probe sem credencial → 401 com WWW-Authenticate →
 * replay com Authorization: Digest. Fallback para Basic quando o equipamento
 * não anuncia Digest.
 */
async function digestFetch(url, username, password, method = 'GET', body, extraHeaders, opts) {
    const isHttps = url.startsWith('https://');
    const agentOpt = isHttps ? { agent: httpsAgent } : {};
    const timeoutMs = opts?.timeoutMs ?? 8000;
    const signalOpt = timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {};
    const probe = await (0, node_fetch_1.default)(url, {
        method,
        // @ts-ignore
        ...agentOpt,
        signal: AbortSignal.timeout(5000),
    });
    if (probe.status !== 401) {
        return probe;
    }
    const wwwAuth = probe.headers.get('www-authenticate') || '';
    const urlObj = new URL(url);
    const uri = urlObj.pathname + urlObj.search;
    const authValue = computeDigestAuthHeader(wwwAuth, method, uri, username, password);
    if (!authValue) {
        return (0, node_fetch_1.default)(url, {
            method,
            headers: { Authorization: basicAuth(username, password), ...extraHeaders },
            body,
            // @ts-ignore
            ...agentOpt,
            ...signalOpt,
        });
    }
    return (0, node_fetch_1.default)(url, {
        method,
        headers: { Authorization: authValue, ...extraHeaders },
        body,
        // @ts-ignore
        ...agentOpt,
        ...signalOpt,
    });
}
