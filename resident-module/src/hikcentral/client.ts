import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { config } from '../config';

export interface HikResponse<T = any> {
    code: string;
    msg: string;
    data?: T;
}

/**
 * String assinada conforme o guia OpenAPI 3.1.1 (seção 3.2): Accept, Content-MD5,
 * Content-Type e Date só entram quando o cabeçalho existe (sem linha vazia).
 */
export function buildStringToSign(method: string, headers: Record<string, string>, path: string): string {
    let toSign = `${method.toUpperCase()}\n`;
    for (const name of ['Accept', 'Content-MD5', 'Content-Type', 'Date']) {
        if (headers[name]) toSign += `${headers[name]}\n`;
    }
    const signed = (headers['X-Ca-Signature-Headers'] || '').split(',').map((h) => h.trim()).filter(Boolean).sort();
    for (const name of signed) {
        const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
        toSign += `${name}:${key ? headers[key] : ''}\n`;
    }
    return toSign + path;
}

export function sign(stringToSign: string, appSecret: string): string {
    return crypto.createHmac('sha256', appSecret).update(stringToSign, 'utf8').digest('base64');
}

function rawPost(url: URL, headers: Record<string, string>, body: string, timeoutMs: number): Promise<{ status: number; text: string }> {
    const lib = url.protocol === 'http:' ? http : https;
    return new Promise((resolve, reject) => {
        const req = lib.request(
            url,
            {
                method: 'POST',
                headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
                timeout: timeoutMs,
                ...(url.protocol === 'https:' && config.hik.insecureTls ? { rejectUnauthorized: false } : {}),
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
            },
        );
        req.on('timeout', () => req.destroy(new Error('Tempo esgotado ao chamar o HikCentral')));
        req.on('error', reject);
        req.end(body);
    });
}

export async function hikPost<T = any>(path: string, body: unknown, timeoutMs = 20_000): Promise<HikResponse<T>> {
    const json = JSON.stringify(body ?? {});
    const headers: Record<string, string> = {
        Accept: '*/*',
        'Content-Type': 'application/json',
        'Content-MD5': crypto.createHash('md5').update(json, 'utf8').digest('base64'),
        'X-Ca-Key': config.hik.appKey,
        'X-Ca-Timestamp': Date.now().toString(),
        'X-Ca-Signature-Headers': 'x-ca-key,x-ca-timestamp',
        userId: config.hik.userId,
    };
    headers['X-Ca-Signature'] = sign(buildStringToSign('POST', headers, path), config.hik.appSecret);

    const { status, text } = await rawPost(new URL(`${config.hik.host}${path}`), headers, json, timeoutMs);
    let parsed: HikResponse<T>;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error(`HikCentral respondeu HTTP ${status} sem JSON em ${path}`);
    }
    if (String(parsed.code) !== '0') {
        throw new Error(`HikCentral ${path}: code ${parsed.code} ${parsed.msg ?? ''}`.trim());
    }
    return parsed;
}
