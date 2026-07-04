"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.generateSignature = generateSignature;
exports.getHikCentralConfig = getHikCentralConfig;
exports.hikRequest = hikRequest;
exports.hikRequestRaw = hikRequestRaw;
const crypto_1 = __importDefault(require("crypto"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const https_1 = require("https");
const db_1 = require("../db");
Object.defineProperty(exports, "prisma", { enumerable: true, get: function () { return db_1.prisma; } });
/**
 * HikCentral API Client
 *
 * Shared utility for making authenticated requests to HikCentral API.
 * Uses AK/SK signature authentication with configurable SSL verification.
 *
 * BUSINESS RULE: This platform uses EXCLUSIVELY facial credentials.
 * Cards, Fingerprints, and PINs are NOT supported.
 */
/**
 * Configuration for SSL verification
 */
const SSL_VERIFY_ENABLED = process.env.HIK_SSL_VERIFY !== 'false';
/**
 * Request timeout in milliseconds (default: 30 seconds)
 */
const REQUEST_TIMEOUT_MS = parseInt(process.env.HIK_REQUEST_TIMEOUT || '30000', 10);
/**
 * HTTPS Agent with configurable SSL verification
 */
const httpsAgent = new https_1.Agent({
    rejectUnauthorized: SSL_VERIFY_ENABLED
});
/**
 * Generate AK/SK signature for HikCentral API
 *
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - API endpoint path
 * @param headers - Request headers
 * @param appSecret - Application secret key
 * @returns Base64 encoded signature
 */
async function generateSignature(method, path, headers, appSecret) {
    const parts = [method.toUpperCase()];
    // Add core headers only if they exist
    const coreHeaders = ['Accept', 'Content-MD5', 'Content-Type', 'Date'];
    for (const headerName of coreHeaders) {
        const value = headers[headerName] || headers[headerName.toLowerCase()];
        if (value) {
            parts.push(value);
        }
    }
    // CanonicalizedHeaders (x-ca- headers)
    const xCaHeadersKeys = Object.keys(headers)
        .filter(key => key.toLowerCase().startsWith('x-ca-') &&
        key.toLowerCase() !== 'x-ca-signature' &&
        key.toLowerCase() !== 'x-ca-signature-headers')
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    for (const key of xCaHeadersKeys) {
        parts.push(`${key.toLowerCase()}:${headers[key]}`);
    }
    // CanonicalizedResource
    parts.push(path);
    const stringToSign = parts.join('\n');
    return crypto_1.default
        .createHmac('sha256', appSecret)
        .update(stringToSign, 'utf8')
        .digest('base64');
}
/**
 * Get HikCentral configuration from database
 *
 * @returns HikCentral API configuration or null if not configured
 */
async function getHikCentralConfig() {
    const config = await db_1.prisma.hikcentralConfig.findFirst({
        orderBy: { createdAt: 'desc' }
    });
    if (!config || !config.apiUrl || !config.appKey || !config.appSecret) {
        return null;
    }
    return {
        apiUrl: config.apiUrl,
        appKey: config.appKey,
        appSecret: config.appSecret,
    };
}
/**
 * Make authenticated request to HikCentral API
 *
 * @param path - API endpoint path (e.g., /artemis/api/acs/v1/faceCheck)
 * @param options - Request options
 * @returns JSON response from HikCentral
 * @throws Error if request fails
 */
async function hikRequest(path, options = {}) {
    const config = await getHikCentralConfig();
    if (!config) {
        throw new Error("HikCentral credentials not configured. Please visit settings.");
    }
    // Determine method and body
    let method = options.method || 'POST';
    let body = options.body;
    // If options looks like a data object (not containing HikRequestOptions properties), use it as body
    if (!options.body && !options.method && !options.headers) {
        if (Object.keys(options).length > 0) {
            body = JSON.stringify(options);
            method = 'POST';
        }
    }
    const timestamp = Date.now().toString();
    const headers = {
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'X-Ca-Key': config.appKey,
        'X-Ca-Timestamp': timestamp,
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
        ...(options.headers || {}),
    };
    let url = '';
    let signPath = '';
    const ipBase = process.env.HIKCENTRAL_IP_BASE;
    if (path && (path.startsWith('http://') || path.startsWith('https://'))) {
        try {
            const urlObj = new URL(path);
            signPath = urlObj.pathname + urlObj.search;
            // Rewrite URL to use configured IP Base if available
            if (ipBase) {
                url = `${urlObj.protocol}//${ipBase}${urlObj.port ? `:${urlObj.port}` : ''}${urlObj.pathname}${urlObj.search}`;
                console.log(`[HikClient] Rewriting absolute URL to IP Base: ${url}`);
            }
            else {
                url = path;
            }
        }
        catch (e) {
            signPath = path;
            url = path;
        }
    }
    else {
        const cleanPath = (path || '').startsWith('/') ? path : `/${path || ''}`;
        signPath = cleanPath;
        const baseUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
        // If we have an IP Base, we might want to override the baseUrl's hostname too
        if (ipBase) {
            try {
                const baseObj = new URL(baseUrl);
                const safeBase = `${baseObj.protocol}//${ipBase}${baseObj.port ? `:${baseObj.port}` : ''}`;
                url = `${safeBase}${cleanPath}`;
            }
            catch (e) {
                url = `${baseUrl}${cleanPath}`;
            }
        }
        else {
            url = `${baseUrl}${cleanPath}`;
        }
    }
    const signature = await generateSignature(method, signPath, headers, config.appSecret);
    headers['X-Ca-Signature'] = signature;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await (0, node_fetch_1.default)(url, {
            method,
            body,
            headers,
            agent: url.startsWith('https') ? httpsAgent : undefined,
            signal: controller.signal,
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.msg || `HikCentral API error: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (result.code !== '0') {
            console.warn(`[HikClient] API Logical Error: ${result.code} - ${result.msg} for ${path}`);
        }
        return result;
    }
    catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`HikCentral API request timeout after ${REQUEST_TIMEOUT_MS}ms`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
/**
 * Make authenticated request to HikCentral API and return raw binary data
 * Used for fetching images and other binary content
 *
 * @param path - API endpoint path
 * @param options - Request options
 * @returns Buffer containing binary data
 * @throws Error if request fails
 */
async function hikRequestRaw(path, options = {}) {
    const config = await getHikCentralConfig();
    if (!config) {
        throw new Error("HikCentral credentials not configured. Please visit settings.");
    }
    // Determine method and body
    let method = options.method || 'POST';
    let body = options.body;
    // If options looks like a data object (not containing HikRequestOptions properties), use it as body
    if (!options.body && !options.method && !options.headers) {
        if (Object.keys(options).length > 0) {
            body = JSON.stringify(options);
            method = 'POST';
        }
    }
    const timestamp = Date.now().toString();
    const headers = {
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'X-Ca-Key': config.appKey,
        'X-Ca-Timestamp': timestamp,
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
        ...(options.headers || {}),
    };
    let url = '';
    let signPath = '';
    const ipBase = process.env.HIKCENTRAL_IP_BASE;
    if (path && (path.startsWith('http://') || path.startsWith('https://'))) {
        try {
            const urlObj = new URL(path);
            signPath = urlObj.pathname + urlObj.search;
            // Rewrite URL to use configured IP Base if available
            if (ipBase) {
                url = `${urlObj.protocol}//${ipBase}${urlObj.port ? `:${urlObj.port}` : ''}${urlObj.pathname}${urlObj.search}`;
                console.log(`[HikClientRaw] Rewriting absolute URL to IP Base: ${url}`);
            }
            else {
                url = path;
            }
        }
        catch (e) {
            signPath = path;
            url = path;
        }
    }
    else {
        const cleanPath = (path || '').startsWith('/') ? path : `/${path || ''}`;
        signPath = cleanPath;
        const baseUrl = config.apiUrl.endsWith('/') ? config.apiUrl.slice(0, -1) : config.apiUrl;
        if (ipBase) {
            try {
                const baseObj = new URL(baseUrl);
                const safeBase = `${baseObj.protocol}//${ipBase}${baseObj.port ? `:${baseObj.port}` : ''}`;
                url = `${safeBase}${cleanPath}`;
            }
            catch (e) {
                url = `${baseUrl}${cleanPath}`;
            }
        }
        else {
            url = `${baseUrl}${cleanPath}`;
        }
    }
    const signature = await generateSignature(method, signPath, headers, config.appSecret);
    headers['X-Ca-Signature'] = signature;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await (0, node_fetch_1.default)(url, {
            method,
            body,
            headers,
            agent: url.startsWith('https') ? httpsAgent : undefined,
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`HikCentral API error: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // --- MANDATORY SANITY CHECK (Magic Bytes) ---
        // Rule 4d: Validate if downloaded Buffer has JPEG Magic Byte (/9j/4 is 'FF D8 FF')
        if (buffer.length > 0) {
            const base64Start = buffer.toString('base64', 0, 32);
            // Check for JPEG magic bytes: FF D8 FF
            // In Base64, JPEG starts with '/9j/'
            const isJpeg = base64Start.startsWith('/9j/');
            const isHTML = base64Start.startsWith('PGh0bWw') || buffer.toString('utf8', 0, 10).toLowerCase().includes('<html');
            const isJSON = base64Start.startsWith('ey') || buffer.toString('utf8', 0, 1).includes('{');
            if (!isJpeg) {
                console.error(`[HikClientRaw] [DEBUG FATAL] Download from ${url} did NOT return a valid JPEG. Starts with: ${base64Start.substring(0, 10)}`);
                if (isHTML || isJSON) {
                    const errorText = buffer.toString('utf-8');
                    console.error(`[HikClientRaw] Content appears to be error text:`, errorText.substring(0, 200));
                }
                throw new Error("HikCentral returned invalid image format (Not a JPEG).");
            }
        }
        return buffer;
    }
    catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`HikCentral API request timeout after ${REQUEST_TIMEOUT_MS}ms`);
        }
        throw error;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
