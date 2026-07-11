import fetch from 'node-fetch';
import { MEDIAMTX_API_URL } from './config';

/** Subconjunto da configuração de path do MediaMTX que o VMS gerencia. */
export interface MtxPathConf {
  source?: string;
  sourceOnDemand?: boolean;
  rtspTransport?: string;
  record?: boolean;
  /** duração de cada arquivo gravado, no formato do Go: "10m", "60s"... */
  recordSegmentDuration?: string;
  runOnRecordSegmentComplete?: string;
}

export interface MtxConfigPath extends MtxPathConf {
  name: string;
}

/**
 * Cliente da API de controle do MediaMTX (porta 9997, só loopback).
 * Os paths de câmera NÃO ficam no mediamtx.yml — são criados/ajustados em
 * runtime por aqui, a partir das tabelas video_devices/video_channels.
 */
export class MediaMtxClient {
  constructor(private baseUrl: string = MEDIAMTX_API_URL) {}

  private async request(method: string, apiPath: string, body?: unknown): Promise<import('node-fetch').Response> {
    return fetch(`${this.baseUrl}${apiPath}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  }

  async isUp(): Promise<boolean> {
    try {
      const res = await this.request('GET', '/v3/config/global/get');
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Lista todos os paths configurados (paginado). */
  async listConfigPaths(): Promise<MtxConfigPath[]> {
    const items: MtxConfigPath[] = [];
    let page = 0;
    for (;;) {
      const res = await this.request('GET', `/v3/config/paths/list?itemsPerPage=100&page=${page}`);
      if (!res.ok) throw new Error(`MediaMTX list paths: HTTP ${res.status}`);
      const data = await res.json() as { pageCount: number; items: MtxConfigPath[] };
      items.push(...(data.items || []));
      page += 1;
      if (page >= (data.pageCount || 1)) break;
    }
    return items;
  }

  async addPath(name: string, conf: MtxPathConf): Promise<void> {
    const res = await this.request('POST', `/v3/config/paths/add/${encodeURIComponent(name)}`, conf);
    if (!res.ok) throw new Error(`MediaMTX add path ${name}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }

  async patchPath(name: string, conf: MtxPathConf): Promise<void> {
    const res = await this.request('PATCH', `/v3/config/paths/patch/${encodeURIComponent(name)}`, conf);
    if (!res.ok) throw new Error(`MediaMTX patch path ${name}: HTTP ${res.status} ${await res.text().catch(() => '')}`);
  }

  async deletePath(name: string): Promise<void> {
    const res = await this.request('DELETE', `/v3/config/paths/delete/${encodeURIComponent(name)}`);
    if (!res.ok && res.status !== 404) {
      throw new Error(`MediaMTX delete path ${name}: HTTP ${res.status}`);
    }
  }
}
