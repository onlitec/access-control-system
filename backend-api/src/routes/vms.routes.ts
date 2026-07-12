import { Router, Request, Response, NextFunction } from 'express';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import net from 'net';
import { spawn, execFile, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { config } from '../config/unifiedConfig';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { digestFetch } from '../utils/digest-fetch.utils';
import { emitEvent } from '../services/EventBusService';
import { buildStreamUrls, subPathName } from '../vms/rtsp';

const execFileAsync = promisify(execFile);

const router = Router();

const VMS_PORT = Number(process.env.VMS_PORT || 3011);
const VMS_INTERNAL_TOKEN = process.env.VMS_INTERNAL_TOKEN || '';
const VMS_RECORDINGS_DIR = process.env.VMS_RECORDINGS_DIR || path.join(process.cwd(), 'recordings');
const RCLONE_PATH = process.env.RCLONE_PATH || 'rclone';
const RCLONE_CONFIG = process.env.RCLONE_CONFIG || '';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Campos de dispositivo expostos nos GETs — NUNCA inclui password. */
const deviceSelect = {
  id: true, name: true, kind: true, protocol: true, ip: true,
  httpPort: true, rtspPort: true, username: true, location: true,
  enabled: true, sdkConfig: true, createdAt: true, updatedAt: true,
} as const;

const channelInclude = { recording: true } as const;

function slugify(name: string): string {
  const slug = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'cam';
}

async function uniqueStreamPath(base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; ; i++) {
    const existing = await prisma.videoChannel.findUnique({ where: { streamPath: candidate } });
    if (!existing) return candidate;
    candidate = `${base}-${i}`;
  }
}

/** Avisa o onliacesso-vms para re-sincronizar os paths do MediaMTX (best-effort). */
function notifyVmsReload(): void {
  fetch(`http://127.0.0.1:${VMS_PORT}/internal/reload`, {
    method: 'POST',
    headers: { 'x-vms-token': VMS_INTERNAL_TOKEN },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => { /* serviço VMS pode não estar instalado/rodando */ });
}

function serializeSegment<T extends { sizeBytes: bigint }>(segment: T): Omit<T, 'sizeBytes'> & { sizeBytes: number } {
  return { ...segment, sizeBytes: Number(segment.sizeBytes) };
}

/**
 * O JWT_SECRET também assina tokens de MORADOR (portal do morador) e de
 * ONBOARDING (link de cadastro, válido 48h) — um `jwt.verify` puro aceitaria
 * os três. Câmeras só podem ser vistas por usuários do sistema (operadores e
 * admins), então aqui exigimos um token com `role` e sem `type` de morador.
 */
function isSystemUserToken(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.type === 'resident' || payload.type === 'onboarding') return false;
  return Boolean(payload.role && payload.id);
}

/** Barra tokens de morador/onboarding nas rotas de câmera (usar após authMiddleware). */
function requireSystemUser(req: Request, res: Response, next: NextFunction): void {
  if (!isSystemUserToken((req as any).user)) {
    res.status(403).json({ error: 'Acesso restrito a usuários do sistema' });
    return;
  }
  next();
}

function tcpProbe(ip: string, port: number, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, ip);
  });
}

/** Protocolos aceitos no cadastro — ver buildStreamUrls() em vms/rtsp.ts. */
const VALID_PROTOCOLS = ['hikvision_isapi', 'xiongmai', 'dahua', 'onvif', 'rtsp'];

async function testDevice(protocol: string, ip: string, httpPort: number, rtspPort: number, username: string, password: string): Promise<boolean> {
  if (protocol === 'hikvision_isapi') {
    try {
      const res = await digestFetch(`http://${ip}:${httpPort}/ISAPI/System/deviceInfo`, username, password);
      return res.ok || res.status === 401;
    } catch {
      return false;
    }
  }
  // xiongmai/dahua/onvif/rtsp: alcance TCP na porta RTSP já indica que o
  // equipamento está lá (a URL real é validada pelo MediaMTX ao publicar)
  return tcpProbe(ip, rtspPort);
}

// ═════════════════════════════════════════════════════════════════════════════
// Endpoints SEM authMiddleware (chamados pelo MediaMTX / vms-service / <video>)
// ═════════════════════════════════════════════════════════════════════════════

// ── POST /api/vms/stream-auth — callback de autenticação do MediaMTX ─────────
// O MediaMTX envia {user, password, ip, action, path, protocol, query} e espera
// 2xx (permitido) ou 401. O player passa o JWT como query (?jwt=...), pois
// <video>/hls.js não enviam header Authorization.
router.post('/stream-auth', (req: Request, res: Response): void => {
  const { query, password } = (req.body ?? {}) as { query?: string; password?: string };
  const params = new URLSearchParams(String(query || ''));
  const token = params.get('jwt') || params.get('token') || '';

  if (VMS_INTERNAL_TOKEN && (token === VMS_INTERNAL_TOKEN || password === VMS_INTERNAL_TOKEN)) {
    res.status(200).json({ ok: true });
    return;
  }
  try {
    const payload = jwt.verify(token, config.JWT.SECRET);
    // morador/onboarding não podem ver câmeras, mesmo com JWT válido
    if (!isSystemUserToken(payload)) {
      res.status(401).json({ error: 'não autorizado' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(401).json({ error: 'não autorizado' });
  }
});

// ── POST /api/vms/internal/event — vms-service repassa eventos (motion) ──────
router.post('/internal/event', async (req: Request, res: Response): Promise<void> => {
  if (!VMS_INTERNAL_TOKEN || req.headers['x-vms-token'] !== VMS_INTERNAL_TOKEN) {
    res.status(401).json({ error: 'token interno inválido' });
    return;
  }
  try {
    const { type, label, channelId, channelName, deviceName } = req.body ?? {};
    await emitEvent({
      personName: `${label || 'Evento de câmera'} — ${channelName || 'câmera'}`,
      personType: 'system',
      category: 'alarm',
      deviceName: deviceName ?? null,
      eventType: String(type || 'vms'),
      source: 'vms',
      status: 'authorized',
      metadata: { channelId: channelId ?? null },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/vms/recordings/:id/file — mp4 com Range (auth via ?token=) ──────
router.get('/recordings/:id/file', async (req: Request, res: Response): Promise<void> => {
  const token = (req.query.token as string) || '';
  if (!token) { res.status(401).end(); return; }
  try {
    const payload = jwt.verify(token, config.JWT.SECRET);
    if (!isSystemUserToken(payload)) { res.status(403).end(); return; }
  } catch { res.status(401).end(); return; }

  const segment = await prisma.recordingSegment.findUnique({ where: { id: req.params.id } }).catch(() => null);
  if (!segment || segment.status === 'deleted_local') { res.status(404).json({ error: 'Gravação não encontrada' }); return; }

  const absFile = path.join(VMS_RECORDINGS_DIR, segment.filePath);
  let stat;
  try {
    stat = await fs.stat(absFile);
  } catch {
    res.status(404).json({ error: 'Arquivo da gravação não está mais no disco' });
    return;
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Accept-Ranges', 'bytes');
  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(segment.filePath)}"`);
  }

  const range = req.headers.range;
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const start = m[1] ? parseInt(m[1], 10) : Math.max(0, stat.size - parseInt(m[2], 10));
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    createReadStream(absFile, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    createReadStream(absFile).pipe(res);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Endpoints autenticados (usuário do sistema; mutações exigem admin)
// requireSystemUser barra tokens de morador/onboarding, que são assinados com
// o MESMO segredo e passariam pelo authMiddleware.
// ═════════════════════════════════════════════════════════════════════════════
router.use(authMiddleware);
router.use(requireSystemUser);

// ── GET /api/vms/devices ─────────────────────────────────────────────────────
router.get('/devices', async (_req: Request, res: Response): Promise<void> => {
  try {
    const devices = await prisma.videoDevice.findMany({
      select: { ...deviceSelect, channels: { include: channelInclude, orderBy: { channelNo: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json({ devices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vms/devices (admin only) ───────────────────────────────────────
router.post('/devices', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, kind, protocol, ip, httpPort, rtspPort, username, password, location, sdkConfig, rtspUrlMain, rtspUrlSub } = req.body;
    if (!name || !ip || !username || !password) {
      res.status(400).json({ error: 'nome, ip, username e password são obrigatórios' });
      return;
    }
    if (kind && !['nvr', 'dvr', 'ip_camera'].includes(kind)) {
      res.status(400).json({ error: 'kind deve ser "nvr", "dvr" ou "ip_camera"' });
      return;
    }
    if (protocol && !VALID_PROTOCOLS.includes(protocol)) {
      res.status(400).json({ error: `protocol deve ser um de: ${VALID_PROTOCOLS.join(', ')}` });
      return;
    }
    const device = await prisma.videoDevice.create({
      data: {
        name, ip, username, password,
        kind: kind ?? 'ip_camera',
        protocol: protocol ?? 'hikvision_isapi',
        httpPort: httpPort ?? 80,
        rtspPort: rtspPort ?? 554,
        location: location ?? null,
        sdkConfig: sdkConfig ?? null,
      },
    });
    // Câmera IP = sempre 1 canal implícito, criado no cadastro
    if (device.kind === 'ip_camera') {
      await prisma.videoChannel.create({
        data: {
          deviceId: device.id,
          channelNo: 1,
          name,
          streamPath: await uniqueStreamPath(slugify(name)),
          rtspUrlMain: rtspUrlMain ?? null,
          rtspUrlSub: rtspUrlSub ?? null,
        },
      });
    }
    const full = await prisma.videoDevice.findUnique({
      where: { id: device.id },
      select: { ...deviceSelect, channels: { include: channelInclude, orderBy: { channelNo: 'asc' } } },
    });
    notifyVmsReload();
    res.status(201).json({ success: true, device: full });
  } catch (err: any) {
    res.status(err.code === 'P2002' ? 409 : 500).json({ error: err.message });
  }
});

// ── PUT /api/vms/devices/:id (admin only) ────────────────────────────────────
router.put('/devices/:id', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, kind, protocol, ip, httpPort, rtspPort, username, password, location, enabled, sdkConfig } = req.body;
    const device = await prisma.videoDevice.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(kind !== undefined && { kind }),
        ...(protocol !== undefined && { protocol }),
        ...(ip !== undefined && { ip }),
        ...(httpPort !== undefined && { httpPort }),
        ...(rtspPort !== undefined && { rtspPort }),
        ...(username !== undefined && { username }),
        ...(password !== undefined && password !== '' && { password }),
        ...(location !== undefined && { location }),
        ...(enabled !== undefined && { enabled }),
        ...(sdkConfig !== undefined && { sdkConfig }),
      },
      select: { ...deviceSelect, channels: { include: channelInclude, orderBy: { channelNo: 'asc' } } },
    });
    notifyVmsReload();
    res.json({ success: true, device });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── DELETE /api/vms/devices/:id (admin only) ─────────────────────────────────
router.delete('/devices/:id', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.videoDevice.delete({ where: { id: req.params.id } });
    notifyVmsReload();
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── GET /api/vms/devices/:id/ping ────────────────────────────────────────────
router.get('/devices/:id/ping', async (req: Request, res: Response): Promise<void> => {
  try {
    const device = await prisma.videoDevice.findUnique({ where: { id: req.params.id } });
    if (!device) { res.status(404).json({ error: 'Dispositivo não encontrado' }); return; }
    const online = await testDevice(device.protocol, device.ip, device.httpPort, device.rtspPort, device.username, device.password);
    res.json({ online });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vms/test — testa conectividade antes de cadastrar ─────────────
router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { protocol, ip, httpPort, rtspPort, username, password } = req.body;
    if (!ip) { res.status(400).json({ error: 'ip é obrigatório' }); return; }
    const reachable = await testDevice(
      protocol ?? 'hikvision_isapi', ip, httpPort ?? 80, rtspPort ?? 554, username ?? '', password ?? '',
    );
    res.json({ reachable });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vms/devices/:id/discover (admin) — popula canais do NVR/DVR ────
router.post('/devices/:id/discover', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const device = await prisma.videoDevice.findUnique({
      where: { id: req.params.id },
      include: { channels: true },
    });
    if (!device) { res.status(404).json({ error: 'Dispositivo não encontrado' }); return; }
    if (device.protocol !== 'hikvision_isapi') {
      res.status(400).json({ error: 'Descoberta automática disponível apenas para dispositivos Hikvision (ISAPI); cadastre os canais manualmente com a URL RTSP' });
      return;
    }

    // NVR/DVR: canais analógicos/IP proxy; câmera IP: entradas de vídeo diretas
    const base = `http://${device.ip}:${device.httpPort}`;
    const endpoints = ['/ISAPI/ContentMgmt/InputProxy/channels', '/ISAPI/System/Video/inputs/channels'];
    const found: Array<{ channelNo: number; name: string }> = [];
    for (const endpoint of endpoints) {
      try {
        const response = await digestFetch(`${base}${endpoint}`, device.username, device.password);
        if (!response.ok) continue;
        const xml = await response.text();
        const blocks = xml.match(/<(?:InputProxyChannel|VideoInputChannel)>[\s\S]*?<\/(?:InputProxyChannel|VideoInputChannel)>/g) || [];
        for (const block of blocks) {
          const id = Number(block.match(/<id>(\d+)<\/id>/)?.[1] ?? NaN);
          if (!Number.isFinite(id)) continue;
          const chName = block.match(/<name>([^<]*)<\/name>/)?.[1]?.trim() || `Canal ${id}`;
          found.push({ channelNo: id, name: chName });
        }
        if (found.length > 0) break;
      } catch { /* tenta o próximo endpoint */ }
    }
    if (found.length === 0) {
      res.status(502).json({ error: 'Nenhum canal retornado pelo dispositivo (verifique credenciais/firmware)' });
      return;
    }

    const existing = new Set(device.channels.map((c) => c.channelNo));
    let created = 0;
    for (const ch of found) {
      if (existing.has(ch.channelNo)) continue;
      await prisma.videoChannel.create({
        data: {
          deviceId: device.id,
          channelNo: ch.channelNo,
          name: ch.name,
          streamPath: await uniqueStreamPath(slugify(`${device.name}-${ch.name}`)),
        },
      });
      created += 1;
    }

    const full = await prisma.videoDevice.findUnique({
      where: { id: device.id },
      select: { ...deviceSelect, channels: { include: channelInclude, orderBy: { channelNo: 'asc' } } },
    });
    notifyVmsReload();
    res.json({ success: true, discovered: found.length, created, device: full });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vms/devices/:id/channels (admin only) ──────────────────────────
router.post('/devices/:id/channels', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelNo, name, rtspUrlMain, rtspUrlSub } = req.body;
    if (channelNo === undefined || !name) {
      res.status(400).json({ error: 'channelNo e name são obrigatórios' });
      return;
    }
    const channel = await prisma.videoChannel.create({
      data: {
        deviceId: req.params.id,
        channelNo: Number(channelNo),
        name,
        streamPath: await uniqueStreamPath(slugify(name)),
        rtspUrlMain: rtspUrlMain ?? null,
        rtspUrlSub: rtspUrlSub ?? null,
      },
      include: channelInclude,
    });
    notifyVmsReload();
    res.status(201).json({ success: true, channel });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Já existe um canal com esse número neste dispositivo. Câmeras IP têm o canal 1 criado automaticamente no cadastro.' });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/vms/channels/:id (admin only) ───────────────────────────────────
router.put('/channels/:id', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, channelNo, rtspUrlMain, rtspUrlSub, enabled } = req.body;
    const channel = await prisma.videoChannel.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(channelNo !== undefined && { channelNo: Number(channelNo) }),
        ...(rtspUrlMain !== undefined && { rtspUrlMain }),
        ...(rtspUrlSub !== undefined && { rtspUrlSub }),
        ...(enabled !== undefined && { enabled }),
      },
      include: channelInclude,
    });
    notifyVmsReload();
    res.json({ success: true, channel });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Já existe um canal com esse número neste dispositivo.' });
      return;
    }
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── DELETE /api/vms/channels/:id (admin only) ────────────────────────────────
router.delete('/channels/:id', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.videoChannel.delete({ where: { id: req.params.id } });
    notifyVmsReload();
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── PUT /api/vms/channels/:id/recording (admin) — config de gravação ─────────
// Tipos de evento aceitos em mode=motion (subset de VCA_EVENT_LABELS do watcher)
const VALID_EVENT_TYPES = new Set([
  'vmd', 'linedetection', 'fielddetection', 'regionentrance', 'regionexiting',
  'loitering', 'unattendedbaggage', 'attendedbaggage', 'facedetection',
  'audioexception', 'scenechangedetection',
]);

/**
 * Liga a detecção de movimento (VMD) na própria câmera via ISAPI — sem isso o
 * alertStream nunca emite o evento. Best-effort: retorna true/false/null
 * (null = não suportado/inacessível; eventos VCA exigem configurar
 * linhas/áreas na interface web da câmera, não dá para ativar daqui).
 */
async function enableMotionDetection(device: { ip: string; httpPort: number; username: string; password: string }, channelNo: number): Promise<boolean | null> {
  const url = `http://${device.ip}:${device.httpPort}/ISAPI/System/Video/inputs/channels/${channelNo}/motionDetection`;
  try {
    const current = await digestFetch(url, device.username, device.password);
    if (!current.ok) return null;
    const xml = await current.text();
    if (/<enabled>\s*true\s*<\/enabled>/i.test(xml)) return true;
    const updated = xml.replace(/<enabled>\s*false\s*<\/enabled>/i, '<enabled>true</enabled>');
    const put = await digestFetch(url, device.username, device.password, 'PUT', updated, { 'Content-Type': 'application/xml' });
    return put.ok;
  } catch {
    return null;
  }
}

router.put('/channels/:id/recording', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mode, schedule, postEventSec, retentionDays, useSubStream, eventTypes, segmentMinutes } = req.body;
    if (mode && !['off', 'continuous', 'scheduled', 'motion'].includes(mode)) {
      res.status(400).json({ error: 'mode deve ser "off", "continuous", "scheduled" ou "motion"' });
      return;
    }
    // ciclo de gravação: duração de cada arquivo (1 min a 2 h)
    if (segmentMinutes !== undefined && (Number(segmentMinutes) < 1 || Number(segmentMinutes) > 120)) {
      res.status(400).json({ error: 'segmentMinutes deve estar entre 1 e 120 minutos' });
      return;
    }
    let cleanEventTypes: string[] | null | undefined;
    if (eventTypes !== undefined) {
      if (eventTypes === null) {
        cleanEventTypes = null;
      } else if (Array.isArray(eventTypes)) {
        cleanEventTypes = eventTypes.map((t) => String(t).toLowerCase()).filter((t) => VALID_EVENT_TYPES.has(t));
        if (cleanEventTypes.length === 0) cleanEventTypes = ['vmd'];
      } else {
        res.status(400).json({ error: 'eventTypes deve ser uma lista de tipos de evento' });
        return;
      }
    }
    const channel = await prisma.videoChannel.findUnique({
      where: { id: req.params.id },
      include: { device: true },
    });
    if (!channel) { res.status(404).json({ error: 'Canal não encontrado' }); return; }

    const recording = await prisma.videoRecordingConfig.upsert({
      where: { channelId: channel.id },
      create: {
        channelId: channel.id,
        mode: mode ?? 'off',
        schedule: schedule ?? null,
        eventTypes: cleanEventTypes ?? Prisma.DbNull,
        postEventSec: postEventSec ?? 30,
        retentionDays: retentionDays ?? 7,
        useSubStream: useSubStream ?? false,
        segmentMinutes: segmentMinutes !== undefined ? Number(segmentMinutes) : 10,
      },
      update: {
        ...(mode !== undefined && { mode }),
        ...(schedule !== undefined && { schedule }),
        ...(cleanEventTypes !== undefined && { eventTypes: cleanEventTypes ?? Prisma.DbNull }),
        ...(postEventSec !== undefined && { postEventSec: Number(postEventSec) }),
        ...(retentionDays !== undefined && { retentionDays: Number(retentionDays) }),
        ...(useSubStream !== undefined && { useSubStream }),
        ...(segmentMinutes !== undefined && { segmentMinutes: Number(segmentMinutes) }),
      },
    });

    // Gravação por evento com movimento: garante o VMD ligado na câmera
    let motionDetection: boolean | null = null;
    const wantsVmd = recording.mode === 'motion'
      && (!Array.isArray(recording.eventTypes) || (recording.eventTypes as string[]).includes('vmd'));
    if (wantsVmd && channel.device.protocol === 'hikvision_isapi') {
      motionDetection = await enableMotionDetection(channel.device, channel.channelNo);
    }

    notifyVmsReload();
    res.json({ success: true, recording, motionDetection });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/vms/channels/:id/live — URLs de visualização ao vivo ────────────
router.get('/channels/:id/live', async (req: Request, res: Response): Promise<void> => {
  try {
    const channel = await prisma.videoChannel.findUnique({
      where: { id: req.params.id },
      include: { device: true },
    });
    if (!channel || !channel.enabled || !channel.device.enabled) {
      res.status(404).json({ error: 'Canal não encontrado ou desabilitado' });
      return;
    }
    const urls = buildStreamUrls(channel.device, channel);
    const hasSub = Boolean(urls.sub && urls.sub !== urls.main);
    // URLs relativas ao nginx (/streams/ → MediaMTX HLS); o front anexa ?jwt=<token>
    res.json({
      streamPath: channel.streamPath,
      hlsMain: `/streams/${channel.streamPath}/index.m3u8`,
      hlsSub: hasSub ? `/streams/${subPathName(channel.streamPath)}/index.m3u8` : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/vms/live-status — estado real de cada canal (gravando? online?) ─
// Consulta o MediaMTX: config (flag record por path) + runtime (ready = fonte
// RTSP conectada). "recording" = gravação ligada E fonte entregando vídeo.
const MEDIAMTX_API_URL = (process.env.MEDIAMTX_API_URL || 'http://127.0.0.1:9997').replace(/\/+$/, '');

router.get('/live-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const channels = await prisma.videoChannel.findMany({
      where: { enabled: true, device: { enabled: true } },
      include: { recording: true },
    });

    let recordByPath = new Map<string, boolean>();
    let readyByPath = new Map<string, boolean>();
    let manualSet = new Set<string>();

    // canais em gravação manual (botão REC) — vem do vms-service
    try {
      const mr = await fetch(`http://127.0.0.1:${VMS_PORT}/internal/manual-record`, {
        headers: { 'x-vms-token': VMS_INTERNAL_TOKEN },
        signal: AbortSignal.timeout(4000),
      });
      if (mr.ok) {
        const data = await mr.json() as { channels: string[] };
        manualSet = new Set(data.channels || []);
      }
    } catch { /* vms-service fora do ar — segue sem o estado manual */ }

    try {
      const [confRes, runtimeRes] = await Promise.all([
        fetch(`${MEDIAMTX_API_URL}/v3/config/paths/list?itemsPerPage=200`, { signal: AbortSignal.timeout(5000) }),
        fetch(`${MEDIAMTX_API_URL}/v3/paths/list?itemsPerPage=200`, { signal: AbortSignal.timeout(5000) }),
      ]);
      if (confRes.ok) {
        const conf = await confRes.json() as { items: Array<{ name: string; record?: boolean }> };
        recordByPath = new Map((conf.items || []).map((i) => [i.name, Boolean(i.record)]));
      }
      if (runtimeRes.ok) {
        const runtime = await runtimeRes.json() as { items: Array<{ name: string; ready?: boolean }> };
        readyByPath = new Map((runtime.items || []).map((i) => [i.name, Boolean(i.ready)]));
      }
    } catch { /* MediaMTX fora do ar — tudo reporta como não gravando/offline */ }

    res.json({
      channels: channels.map((ch) => {
        const recPath = ch.recording?.useSubStream ? subPathName(ch.streamPath) : ch.streamPath;
        const recordArmed = recordByPath.get(recPath) ?? false;
        const ready = (readyByPath.get(ch.streamPath) ?? false) || (readyByPath.get(subPathName(ch.streamPath)) ?? false);
        return {
          channelId: ch.id,
          streamPath: ch.streamPath,
          mode: ch.recording?.mode ?? 'off',
          ready,
          recordArmed, // gravação ligada no MediaMTX (pode estar aguardando a fonte)
          recording: recordArmed && (readyByPath.get(recPath) ?? false), // gravando de fato
          manual: manualSet.has(ch.id), // gravação iniciada pelo botão REC
        };
      }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vms/channels/:id/record — gravação manual (botão REC) ─────────
// Qualquer operador pode acionar (não exige admin): é ação de operação, como
// gravar uma ocorrência que está acontecendo agora.
router.post('/channels/:id/record', async (req: Request, res: Response): Promise<void> => {
  try {
    const active = req.body?.active !== false; // padrão: iniciar
    const channel = await prisma.videoChannel.findUnique({ where: { id: req.params.id } });
    if (!channel) { res.status(404).json({ error: 'Canal não encontrado' }); return; }

    const r = await fetch(`http://127.0.0.1:${VMS_PORT}/internal/manual-record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-vms-token': VMS_INTERNAL_TOKEN },
      body: JSON.stringify({ channelId: channel.id, active }),
      // ao parar, o serviço espera o arquivo fechar e indexa antes de responder
      signal: AbortSignal.timeout(active ? 10_000 : 25_000),
    });
    if (!r.ok) throw new Error(`serviço de vídeo respondeu ${r.status}`);

    const data = await r.json() as {
      recording: boolean;
      segments?: Array<{ id: string; filePath: string; sizeBytes: number; startedAt: string }>;
    };
    // segments = clipe(s) recém-gravados; o app baixa direto no aparelho
    res.json({ success: true, recording: data.recording, segments: data.segments ?? [] });
  } catch (err: any) {
    res.status(503).json({ error: `Não foi possível acionar a gravação: ${err.message}` });
  }
});

// ── GET /api/vms/storage-usage — uso de disco das gravações ─────────────────
router.get('/storage-usage', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [agg, disk] = await Promise.all([
      prisma.recordingSegment.aggregate({
        where: { status: 'closed' },
        _sum: { sizeBytes: true },
        _count: { _all: true },
      }),
      fs.statfs(VMS_RECORDINGS_DIR).catch(() => null),
    ]);

    const GB = 1024 * 1024 * 1024;
    const usedGb = Number(agg._sum.sizeBytes ?? BigInt(0)) / GB;
    const freeGb = disk ? (Number(disk.bavail) * Number(disk.bsize)) / GB : null;
    const totalGb = disk ? (Number(disk.blocks) * Number(disk.bsize)) / GB : null;
    const minFreeGb = Number(process.env.VMS_MIN_FREE_GB || 10);

    res.json({
      segments: agg._count._all,
      usedGb: Number(usedGb.toFixed(2)),
      freeGb: freeGb === null ? null : Number(freeGb.toFixed(2)),
      totalGb: totalGb === null ? null : Number(totalGb.toFixed(2)),
      minFreeGb,
      maxDiskGb: Number(process.env.VMS_MAX_DISK_GB || 0),
      // crítico = gravação pausada automaticamente
      critical: freeGb !== null && freeGb < minFreeGb / 2,
      low: freeGb !== null && freeGb < minFreeGb,
      recordingsDir: VMS_RECORDINGS_DIR,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/vms/recordings?channelId&from&to ────────────────────────────────
router.get('/recordings', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelId, from, to } = req.query as Record<string, string | undefined>;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const segments = await prisma.recordingSegment.findMany({
      where: {
        ...(channelId ? { channelId } : {}),
        ...(from || to ? {
          startedAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        } : {}),
        status: { not: 'failed' },
      },
      include: {
        channel: { select: { id: true, name: true, streamPath: true } },
        uploads: { select: { status: true, destination: { select: { name: true } } } },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    res.json({ recordings: segments.map(serializeSegment) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Grupos (pastas da árvore do videowall) e layouts de mosaico salvos
// Leitura liberada a qualquer operador; escrita também (é preferência de
// operação da portaria, não configuração de sistema).
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /api/vms/groups ──────────────────────────────────────────────────────
router.get('/groups', async (_req: Request, res: Response): Promise<void> => {
  try {
    const groups = await prisma.cameraGroup.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vms/groups ─────────────────────────────────────────────────────
router.post('/groups', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, sortOrder } = req.body;
    if (!name) { res.status(400).json({ error: 'name é obrigatório' }); return; }
    const group = await prisma.cameraGroup.create({
      data: { name: String(name).trim(), sortOrder: sortOrder ?? 0 },
    });
    res.status(201).json({ success: true, group });
  } catch (err: any) {
    res.status(err.code === 'P2002' ? 409 : 500)
      .json({ error: err.code === 'P2002' ? 'Já existe um grupo com esse nome' : err.message });
  }
});

// ── PUT /api/vms/groups/:id ──────────────────────────────────────────────────
router.put('/groups/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, sortOrder } = req.body;
    const group = await prisma.cameraGroup.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(sortOrder !== undefined && { sortOrder: Number(sortOrder) }),
      },
    });
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : err.code === 'P2002' ? 409 : 500).json({ error: err.message });
  }
});

// ── DELETE /api/vms/groups/:id — canais voltam para "sem grupo" ─────────────
router.delete('/groups/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.cameraGroup.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── PUT /api/vms/channels/:id/group — move o canal para um grupo (ou nenhum) ─
router.put('/channels/:id/group', async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId } = req.body;
    const channel = await prisma.videoChannel.update({
      where: { id: req.params.id },
      data: { groupId: groupId || null },
    });
    res.json({ success: true, channel });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── GET /api/vms/layouts ─────────────────────────────────────────────────────
router.get('/layouts', async (_req: Request, res: Response): Promise<void> => {
  try {
    const layouts = await prisma.videoLayout.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    res.json({ layouts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const VALID_LAYOUT_SIZES = [1, 4, 9, 16, 25];

/** slots = array de channelId|null, do tamanho do mosaico. */
function normalizeSlots(slots: unknown, size: number): (string | null)[] {
  const arr = Array.isArray(slots) ? slots : [];
  return Array.from({ length: size }, (_, i) => {
    const v = arr[i];
    return typeof v === 'string' && v ? v : null;
  });
}

// ── POST /api/vms/layouts — cria ou sobrescreve pelo nome ───────────────────
router.post('/layouts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, size, slots, isDefault } = req.body;
    if (!name) { res.status(400).json({ error: 'name é obrigatório' }); return; }
    if (!VALID_LAYOUT_SIZES.includes(Number(size))) {
      res.status(400).json({ error: `size deve ser um de: ${VALID_LAYOUT_SIZES.join(', ')}` });
      return;
    }
    const cleanSlots = normalizeSlots(slots, Number(size));

    if (isDefault) {
      await prisma.videoLayout.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    }
    const layout = await prisma.videoLayout.upsert({
      where: { name: String(name).trim() },
      create: {
        name: String(name).trim(),
        size: Number(size),
        slots: cleanSlots,
        isDefault: Boolean(isDefault),
      },
      update: {
        size: Number(size),
        slots: cleanSlots,
        ...(isDefault !== undefined && { isDefault: Boolean(isDefault) }),
      },
    });
    res.status(201).json({ success: true, layout });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/vms/layouts/:id/default — marca como mosaico padrão ────────────
router.put('/layouts/:id/default', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.videoLayout.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const layout = await prisma.videoLayout.update({
      where: { id: req.params.id },
      data: { isDefault: true },
    });
    res.json({ success: true, layout });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── DELETE /api/vms/layouts/:id ──────────────────────────────────────────────
router.delete('/layouts/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.videoLayout.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Destinos de storage (rclone) — admin only
// ═════════════════════════════════════════════════════════════════════════════

const RCLONE_TYPES: Record<string, { oauth: boolean; params: string[]; obscure: string[] }> = {
  drive:    { oauth: true,  params: [], obscure: [] },
  onedrive: { oauth: true,  params: [], obscure: [] },
  smb:      { oauth: false, params: ['host', 'user', 'port', 'domain', 'spn'], obscure: ['pass'] },
  ftp:      { oauth: false, params: ['host', 'user', 'port', 'tls', 'explicit_tls'], obscure: ['pass'] },
  sftp:     { oauth: false, params: ['host', 'user', 'port'], obscure: ['pass'] },
};

function rcloneArgs(extra: string[]): string[] {
  return RCLONE_CONFIG ? [...extra, '--config', RCLONE_CONFIG] : extra;
}

/**
 * Enfileira as gravações que JÁ existem no disco para um destino recém-criado.
 *
 * Sem isto, um destino só recebe o que for gravado dali para frente — tudo que
 * já estava no servidor ficaria fora da nuvem para sempre, sem nenhum aviso.
 */
async function enqueueExistingRecordings(destinationId: string): Promise<number> {
  const segments = await prisma.recordingSegment.findMany({
    where: { status: 'closed' }, // só o que ainda está no disco
    select: { id: true },
  });
  if (segments.length === 0) return 0;

  const { count } = await prisma.recordingUpload.createMany({
    data: segments.map((s) => ({ segmentId: s.id, destinationId })),
    skipDuplicates: true,
  });
  return count;
}

async function uniqueRcloneRemote(base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; ; i++) {
    const existing = await prisma.storageDestination.findUnique({ where: { rcloneRemote: candidate } });
    if (!existing) return candidate;
    candidate = `${base}-${i}`;
  }
}

// ── GET /api/vms/storage ─────────────────────────────────────────────────────
router.get('/storage', adminMiddleware, async (_req: Request, res: Response): Promise<void> => {
  try {
    const destinations = await prisma.storageDestination.findMany({ orderBy: { name: 'asc' } });
    const counts = await prisma.recordingUpload.groupBy({
      by: ['destinationId', 'status'],
      _count: { _all: true },
    });
    const queue: Record<string, Record<string, number>> = {};
    for (const c of counts) {
      queue[c.destinationId] = queue[c.destinationId] || {};
      queue[c.destinationId][c.status] = c._count._all;
    }
    res.json({ destinations: destinations.map((d) => ({ ...d, queue: queue[d.id] || {} })) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vms/storage (admin) — cria destino não-OAuth (smb/ftp/sftp) ────
router.post('/storage', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, rcloneType, remoteBasePath, uploadMode, params } = req.body;
    if (!name || !rcloneType) {
      res.status(400).json({ error: 'name e rcloneType são obrigatórios' });
      return;
    }
    const typeDef = RCLONE_TYPES[rcloneType];
    if (!typeDef) {
      res.status(400).json({ error: `rcloneType deve ser um de: ${Object.keys(RCLONE_TYPES).join(', ')}` });
      return;
    }
    if (typeDef.oauth) {
      res.status(400).json({ error: `${rcloneType} usa OAuth — use /api/vms/storage/oauth/start ou /oauth/token` });
      return;
    }

    const remote = await uniqueRcloneRemote(slugify(name));
    const args: string[] = ['config', 'create', remote, rcloneType, '--non-interactive'];
    const shown: Record<string, string> = {};
    for (const key of typeDef.params) {
      const value = params?.[key];
      if (value !== undefined && value !== null && value !== '') {
        args.push(`${key}=${value}`);
        shown[key] = String(value);
      }
    }
    for (const key of typeDef.obscure) {
      const value = params?.[key];
      if (value) args.push(`${key}=${value}`, '--obscure');
    }
    await execFileAsync(RCLONE_PATH, rcloneArgs(args), { timeout: 30_000, windowsHide: true });

    const destination = await prisma.storageDestination.create({
      data: {
        name,
        kind: 'rclone',
        rcloneType,
        rcloneRemote: remote,
        remoteBasePath: remoteBasePath ?? null,
        uploadMode: uploadMode === 'move' ? 'move' : 'copy',
        configJson: shown,
      },
    });
    // as gravações que já estão no disco também sobem para o novo destino
    const queued = await enqueueExistingRecordings(destination.id);
    res.status(201).json({ success: true, destination, queued });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── OAuth (Google Drive / OneDrive) ──────────────────────────────────────────
// start: spawna `rclone authorize <type>` no servidor e devolve a URL para o
// admin abrir; status: consulta se o token já chegou; token: modo "colar token"
// (o admin rodou `rclone authorize <type>` em outra máquina e cola o JSON).
interface OAuthSession {
  proc: ChildProcess;
  rcloneType: string;
  url: string | null;
  token: string | null;
  error: string | null;
  output: string;
}
const oauthSessions = new Map<string, OAuthSession>();

router.post('/storage/oauth/start', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { rcloneType } = req.body;
    if (!RCLONE_TYPES[rcloneType]?.oauth) {
      res.status(400).json({ error: 'rcloneType deve ser "drive" ou "onedrive"' });
      return;
    }
    const sessionId = randomBytes(8).toString('hex');
    const proc = spawn(RCLONE_PATH, rcloneArgs(['authorize', rcloneType, '--auth-no-open-browser']), { windowsHide: true });
    const session: OAuthSession = { proc, rcloneType, url: null, token: null, error: null, output: '' };
    oauthSessions.set(sessionId, session);

    const onData = (chunk: Buffer) => {
      session.output += chunk.toString('utf-8');
      if (!session.url) {
        session.url = session.output.match(/(http:\/\/127\.0\.0\.1:53682\/auth\S*)/)?.[1] ?? null;
      }
      // token JSON aparece entre "--->" e "<---End paste"
      const tokenMatch = session.output.match(/--->\s*(\{[\s\S]*?\})\s*<---/);
      if (tokenMatch) session.token = tokenMatch[1].trim();
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('error', (err) => { session.error = err.message; });
    proc.on('exit', (code) => {
      if (!session.token && code !== 0 && !session.error) {
        session.error = `rclone authorize terminou com código ${code}`;
      }
    });
    setTimeout(() => {
      if (!session.token) { try { proc.kill(); } catch { /* já morreu */ } }
      oauthSessions.delete(sessionId);
    }, 10 * 60 * 1000).unref();

    // espera a URL aparecer (alguns ms)
    for (let i = 0; i < 50 && !session.url && !session.error; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (session.error) { res.status(500).json({ error: session.error }); return; }
    res.json({ sessionId, authUrl: session.url, note: 'Abra a URL num navegador NA MÁQUINA DO SERVIDOR. Se o servidor não tem navegador, use o modo "colar token".' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/storage/oauth/status/:sessionId', adminMiddleware, (req: Request, res: Response): void => {
  const session = oauthSessions.get(req.params.sessionId);
  if (!session) { res.status(404).json({ error: 'Sessão OAuth não encontrada ou expirada' }); return; }
  res.json({ authUrl: session.url, hasToken: Boolean(session.token), error: session.error });
});

// finaliza (tanto com sessionId do /start quanto com token colado manualmente)
router.post('/storage/oauth/token', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, rcloneType, remoteBasePath, uploadMode, sessionId, token } = req.body;
    if (!name || !RCLONE_TYPES[rcloneType]?.oauth) {
      res.status(400).json({ error: 'name e rcloneType (drive/onedrive) são obrigatórios' });
      return;
    }
    let tokenJson: string | null = token ?? null;
    if (!tokenJson && sessionId) {
      tokenJson = oauthSessions.get(sessionId)?.token ?? null;
    }
    if (!tokenJson) {
      res.status(400).json({ error: 'Token OAuth ausente — conclua a autorização no navegador ou cole o token' });
      return;
    }
    try { JSON.parse(tokenJson); } catch {
      res.status(400).json({ error: 'Token inválido — cole exatamente o JSON exibido pelo rclone authorize' });
      return;
    }

    const remote = await uniqueRcloneRemote(slugify(name));
    await execFileAsync(
      RCLONE_PATH,
      rcloneArgs(['config', 'create', remote, rcloneType, `token=${tokenJson}`, '--non-interactive']),
      { timeout: 30_000, windowsHide: true },
    );

    const destination = await prisma.storageDestination.create({
      data: {
        name,
        kind: 'rclone',
        rcloneType,
        rcloneRemote: remote,
        remoteBasePath: remoteBasePath ?? null,
        uploadMode: uploadMode === 'move' ? 'move' : 'copy',
      },
    });
    if (sessionId) oauthSessions.delete(sessionId);
    // as gravações que já estão no disco também sobem para o novo destino
    const queued = await enqueueExistingRecordings(destination.id);
    res.status(201).json({ success: true, destination, queued });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/vms/storage/:id/backfill — enviar as gravações já existentes ───
router.post('/storage/:id/backfill', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const destination = await prisma.storageDestination.findUnique({ where: { id: req.params.id } });
    if (!destination) { res.status(404).json({ error: 'Destino não encontrado' }); return; }

    const queued = await enqueueExistingRecordings(destination.id);
    res.json({ success: true, queued });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/vms/storage/:id (admin) ─────────────────────────────────────────
router.put('/storage/:id', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, remoteBasePath, uploadMode, enabled } = req.body;
    const destination = await prisma.storageDestination.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(remoteBasePath !== undefined && { remoteBasePath }),
        ...(uploadMode !== undefined && { uploadMode: uploadMode === 'move' ? 'move' : 'copy' }),
        ...(enabled !== undefined && { enabled }),
      },
    });
    res.json({ success: true, destination });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── DELETE /api/vms/storage/:id (admin) ──────────────────────────────────────
router.delete('/storage/:id', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const destination = await prisma.storageDestination.delete({ where: { id: req.params.id } });
    if (destination.rcloneRemote) {
      execFileAsync(RCLONE_PATH, rcloneArgs(['config', 'delete', destination.rcloneRemote]), { timeout: 15_000, windowsHide: true })
        .catch(() => { /* remote pode nem existir no rclone.conf */ });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.code === 'P2025' ? 404 : 500).json({ error: err.message });
  }
});

// ── POST /api/vms/storage/:id/test (admin) ───────────────────────────────────
router.post('/storage/:id/test', adminMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const destination = await prisma.storageDestination.findUnique({ where: { id: req.params.id } });
    if (!destination?.rcloneRemote) { res.status(404).json({ error: 'Destino não encontrado' }); return; }
    try {
      await execFileAsync(
        RCLONE_PATH,
        rcloneArgs(['lsd', `${destination.rcloneRemote}:`, '--max-depth', '1']),
        { timeout: 30_000, windowsHide: true },
      );
      res.json({ reachable: true });
    } catch (err: any) {
      res.json({ reachable: false, error: String(err.stderr || err.message).slice(0, 500) });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
