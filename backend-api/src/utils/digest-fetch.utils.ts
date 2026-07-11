import fetch from 'node-fetch';
import { Agent as HttpsAgent } from 'https';
import { createHash, randomBytes } from 'crypto';

const httpsAgent = new HttpsAgent({ rejectUnauthorized: false });

export function basicAuth(username: string, password: string): string {
  return 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
}

/**
 * Two-step Digest Auth (RFC 2617 / MD5) — autenticação ISAPI usada por todos os
 * equipamentos Hikvision do projeto (videoporteiros, terminais faciais,
 * câmeras/NVRs do VMS): probe sem credencial → 401 com WWW-Authenticate →
 * replay com Authorization: Digest. Fallback para Basic quando o equipamento
 * não anuncia Digest.
 */
export async function digestFetch(
  url: string,
  username: string,
  password: string,
  method = 'GET',
  body?: Buffer | string,
  extraHeaders?: Record<string, string>,
  opts?: { timeoutMs?: number }, // 0 = sem timeout (long-poll, ex.: ISAPI alertStream)
): Promise<import('node-fetch').Response> {
  const isHttps = url.startsWith('https://');
  const agentOpt = isHttps ? { agent: httpsAgent } : {};
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const signalOpt = timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {};

  const probe = await fetch(url, {
    method,
    // @ts-ignore
    ...agentOpt,
    signal: AbortSignal.timeout(5000),
  });

  if (probe.status !== 401) {
    return probe;
  }

  const wwwAuth = probe.headers.get('www-authenticate') || '';
  const isDigest = wwwAuth.toLowerCase().startsWith('digest');

  if (!isDigest) {
    return fetch(url, {
      method,
      headers: { Authorization: basicAuth(username, password), ...extraHeaders },
      body,
      // @ts-ignore
      ...agentOpt,
      ...signalOpt,
    });
  }

  const field = (name: string) => {
    const m = wwwAuth.match(new RegExp(`${name}="([^"]+)"`, 'i'))
      || wwwAuth.match(new RegExp(`${name}=([^\\s,]+)`, 'i'));
    return m ? m[1] : '';
  };
  const realm   = field('realm');
  const nonce   = field('nonce');
  const qop     = field('qop');
  const opaque  = field('opaque');
  const algo    = field('algorithm') || 'MD5';

  const urlObj = new URL(url);
  const uri = urlObj.pathname + urlObj.search;

  const md5 = (...parts: string[]) => createHash('md5').update(parts.join(':')).digest('hex');

  const ha1 = md5(username, realm, password);
  const ha2 = md5(method, uri);

  let authValue: string;
  if (qop === 'auth' || qop === 'auth-int') {
    const nc     = '00000001';
    const cnonce = randomBytes(8).toString('hex');
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
  } else {
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

  return fetch(url, {
    method,
    headers: { Authorization: authValue, ...extraHeaders },
    body,
    // @ts-ignore
    ...agentOpt,
    ...signalOpt,
  });
}
