"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoDoorbellService = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const https_1 = require("https");
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const httpsAgent = new https_1.Agent({ rejectUnauthorized: false });
function basicAuth(username, password) {
    return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}
/**
 * Two-step Digest Auth (RFC 2617 / MD5).
 * Step 1: unauthenticated request → grab WWW-Authenticate challenge
 * Step 2: compute MD5 and replay with Authorization: Digest ...
 * Falls back to Basic if device does not advertise Digest.
 */
async function digestFetch(url, username, password, method = 'GET', body, extraHeaders) {
    const isHttps = url.startsWith('https://');
    const agentOpt = isHttps ? { agent: httpsAgent } : {};
    // Step 1: probe without credentials
    const probe = await (0, node_fetch_1.default)(url, {
        method,
        // @ts-ignore
        ...agentOpt,
        signal: AbortSignal.timeout(5000),
    });
    if (probe.status !== 401) {
        // No auth challenge — return as-is (shouldn't happen on Hik devices)
        return probe;
    }
    const wwwAuth = probe.headers.get('www-authenticate') || '';
    const isDigest = wwwAuth.toLowerCase().startsWith('digest');
    if (!isDigest) {
        // Device only offers Basic
        return (0, node_fetch_1.default)(url, {
            method,
            headers: { Authorization: basicAuth(username, password), ...extraHeaders },
            body,
            // @ts-ignore
            ...agentOpt,
            signal: AbortSignal.timeout(8000),
        });
    }
    // Parse challenge fields
    const field = (name) => {
        const m = wwwAuth.match(new RegExp(`${name}="([^"]+)"`, 'i'))
            || wwwAuth.match(new RegExp(`${name}=([^\\s,]+)`, 'i'));
        return m ? m[1] : '';
    };
    const realm = field('realm');
    const nonce = field('nonce');
    const qop = field('qop'); // "auth" or ""
    const opaque = field('opaque');
    const algo = field('algorithm') || 'MD5';
    const urlObj = new URL(url);
    const uri = urlObj.pathname + urlObj.search;
    const md5 = (...parts) => (0, crypto_1.createHash)('md5').update(parts.join(':')).digest('hex');
    const ha1 = md5(username, realm, password);
    const ha2 = md5(method, uri);
    let authValue;
    if (qop === 'auth' || qop === 'auth-int') {
        const nc = '00000001';
        const cnonce = (0, crypto_1.randomBytes)(8).toString('hex');
        const response = md5(ha1, nonce, nc, cnonce, qop, ha2);
        authValue = [
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
    else {
        // No qop (legacy)
        const response = md5(ha1, nonce, ha2);
        authValue = [
            `Digest username="${username}"`,
            `realm="${realm}"`,
            `nonce="${nonce}"`,
            `uri="${uri}"`,
            `response="${response}"`,
            `algorithm=${algo}`,
            ...(opaque ? [`opaque="${opaque}"`] : []),
        ].join(', ');
    }
    return (0, node_fetch_1.default)(url, {
        method,
        headers: { Authorization: authValue, ...extraHeaders },
        body,
        // @ts-ignore
        ...agentOpt,
        signal: AbortSignal.timeout(8000),
    });
}
/**
 * Hikvision DS-KB / DS-KV series video doorbell integration via ISAPI (direct HTTP).
 * Does NOT require HikCentral — connects directly to the device on the local network.
 * Uses Digest Auth (MD5) as required by Hikvision firmware.
 */
class VideoDoorbellService {
    static async getDevice(deviceId) {
        const device = await prisma.doorbellDevice.findUnique({ where: { id: deviceId } });
        if (!device)
            throw new Error(`Videoporteiro ${deviceId} não encontrado`);
        if (!device.enabled)
            throw new Error(`Videoporteiro ${deviceId} está desabilitado`);
        return device;
    }
    static async getSnapshot(deviceId) {
        const device = await this.getDevice(deviceId);
        const paths = [
            '/ISAPI/Streaming/channels/1/picture',
            '/ISAPI/Streaming/channels/101/picture',
            '/ISAPI/Streaming/channels/102/picture',
            '/ISAPI/Streaming/channels/2/picture'
        ];
        let lastError;
        for (const path of paths) {
            try {
                const url = `http://${device.ip}:${device.port}${path}`;
                const response = await digestFetch(url, device.username, device.password);
                if (response.ok) {
                    const buffer = Buffer.from(await response.arrayBuffer());
                    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
                        return buffer;
                    }
                    else {
                        // Not a valid JPEG, maybe try next path or it's a transient issue
                        lastError = new Error(`Resposta em ${path} não é JPEG válido`);
                    }
                }
                else {
                    lastError = new Error(`ISAPI snapshot falhou em ${path}: ${response.status} ${response.statusText}`);
                }
            }
            catch (err) {
                lastError = err;
            }
        }
        throw lastError;
    }
    static async getDeviceInfo(deviceId) {
        const device = await this.getDevice(deviceId);
        const url = `http://${device.ip}:${device.port}/ISAPI/System/deviceInfo`;
        const response = await digestFetch(url, device.username, device.password);
        if (!response.ok) {
            throw new Error(`ISAPI deviceInfo falhou: ${response.status} ${response.statusText}`);
        }
        const text = await response.text();
        return {
            deviceName: text.match(/<deviceName>(.*?)<\/deviceName>/)?.[1],
            serialNumber: text.match(/<serialNumber>(.*?)<\/serialNumber>/)?.[1],
            firmwareVersion: text.match(/<firmwareVersion>(.*?)<\/firmwareVersion>/)?.[1],
            macAddress: text.match(/<macAddress>(.*?)<\/macAddress>/)?.[1],
            model: text.match(/<model>(.*?)<\/model>/)?.[1],
        };
    }
    static async testConnection(ip, port, username, password) {
        try {
            const url = `http://${ip}:${port}/ISAPI/System/deviceInfo`;
            const response = await digestFetch(url, username, password);
            // 200 = auth OK, 401 = reachable but wrong credentials, both mean the device is there
            return response.ok || response.status === 401;
        }
        catch {
            return false;
        }
    }
    static async listDevices() {
        return prisma.doorbellDevice.findMany({
            where: { enabled: true },
            select: { id: true, name: true, location: true, ip: true, port: true, enabled: true, createdAt: true },
            orderBy: { name: 'asc' },
        });
    }
}
exports.VideoDoorbellService = VideoDoorbellService;
