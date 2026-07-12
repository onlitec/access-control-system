/**
 * discovery.routes.ts
 * Rotas HTTP para o módulo de Network Discovery:
 *  - POST /api/discovery/scan       — inicia varredura
 *  - GET  /api/discovery/stream     — SSE: stream de dispositivos encontrados
 *  - GET  /api/discovery/devices    — lista de dispositivos da última varredura (polling)
 *  - POST /api/discovery/register   — cadastra dispositivo descoberto no PostgreSQL
 *  - POST /api/discovery/test-connection — testa conexão pontual com um dispositivo
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import {
  startScan,
  registerScanClient,
  unregisterScanClient,
  getLastScanDevices,
  getDeviceByTempId,
} from '../modules/discovery/discovery.orchestrator';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const router = Router();
router.use(authMiddleware);

// ── GET /api/discovery/categories ────────────────────────────────────────────
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.deviceCategory.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: categories });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Helpers de criptografia de credenciais (mesma lógica de FacialAccessService) ──
const CIPHER_ALGO = 'aes-256-gcm';
function encryptPassword(plain: string): string {
  const secret = process.env.DEVICE_CREDENTIAL_KEY || process.env.JWT_SECRET || 'default-secret-key';
  const key = scryptSync(secret, 'salt', 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER_ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

// ── POST /api/discovery/scan ──────────────────────────────────────────────────
/**
 * Inicia uma varredura de rede. Retorna imediatamente; resultados chegam via SSE.
 * Body (opcional): { subnetPrefix: "192.168.1", arpEnabled: true }
 */
router.post('/scan', adminMiddleware, async (req: Request, res: Response) => {
  try {
    // Carrega IPs e MACs já cadastrados para marcar isAdded corretamente
    const existing = await prisma.networkDevice.findMany({
      where: { isAdded: true },
      select: { ipAddress: true, macAddress: true },
    });
    const addedIps  = new Set<string>(existing.map((d) => d.ipAddress));
    const addedMacs = new Set<string>(existing.flatMap((d) => d.macAddress ? [d.macAddress.toLowerCase()] : []));

    const { subnetPrefix, arpEnabled } = req.body ?? {};

    // Fire-and-forget: responde rapidamente e o scan corre em background
    startScan({ subnetPrefix, arpEnabled: arpEnabled !== false, addedIps, addedMacs });

    res.json({ success: true, message: 'Varredura iniciada. Conecte-se ao endpoint /stream para receber os resultados.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/discovery/stream ─────────────────────────────────────────────────
/**
 * Server-Sent Events: o cliente recebe os dispositivos encontrados em tempo real.
 * Eventos: device-found | fast-scan-complete | scan-complete | scan-error | ping
 */
router.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx: não bufferizar SSE
  res.flushHeaders();

  res.write('event: connected\ndata: {}\n\n');

  const clientId = registerScanClient(res);

  // Ping a cada 25s para manter a conexão viva
  const pingInterval = setInterval(() => {
    try { res.write('event: ping\ndata: {}\n\n'); } catch { clearInterval(pingInterval); }
  }, 25_000);

  req.on('close', () => {
    clearInterval(pingInterval);
    unregisterScanClient(clientId);
  });
});

// ── GET /api/discovery/devices ────────────────────────────────────────────────
/**
 * Retorna os dispositivos encontrados na última varredura (polling alternativo ao SSE).
 * Query: ?protocol=onvif|sadp|mdns|arp&hide_added=true
 */
router.get('/devices', (req: Request, res: Response) => {
  let devices = getLastScanDevices();

  const { protocol, hide_added } = req.query;
  if (protocol) devices = devices.filter((d) => d.protocolType === protocol);
  if (hide_added === 'true') devices = devices.filter((d) => !d.isAdded);

  res.json({ success: true, data: devices, total: devices.length });
});

// ── POST /api/discovery/register ──────────────────────────────────────────────
/**
 * Cadastra um dispositivo descoberto (promove de "discovered" para "added").
 * Body: { tempId, friendlyName, categoryId?, areaId?, username, password }
 * Se tempId não existir em memória, aceita ip/mac diretos (cadastro manual simples).
 */
router.post('/register', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      tempId,
      friendlyName,
      categoryId,
      areaId,
      username,
      password,
      // Para cadastro manual direto (sem tempId)
      ipAddress: bodyIp,
      macAddress: bodyMac,
      protocolType: bodyProtocol,
    } = req.body;

    if (!friendlyName?.trim()) {
      return res.status(400).json({ error: 'Nome do dispositivo é obrigatório.' });
    }
    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Credenciais (usuário e senha) são obrigatórias.' });
    }

    let discovered = tempId ? getDeviceByTempId(tempId) : null;

    if (!discovered && !bodyIp) {
      return res.status(404).json({ error: 'Dispositivo não encontrado na varredura. Forneça ipAddress para cadastro manual.' });
    }

    const ip          = discovered?.ipAddress ?? bodyIp;
    const mac         = discovered?.macAddress ?? bodyMac ?? null;
    const protocol    = discovered?.protocolType ?? bodyProtocol ?? 'manual';
    const encPassword = encryptPassword(password);

    // Upsert: se já existe um registro com esse IP/MAC, atualiza; senão cria
    const upsertData = {
      ipAddress:                   ip,
      macAddress:                  mac,
      protocolType:                protocol,
      manufacturer:                discovered?.manufacturer ?? null,
      model:                       discovered?.model ?? null,
      serialNumber:                discovered?.serialNumber ?? null,
      firmwareVersion:             discovered?.firmwareVersion ?? null,
      deviceType:                  discovered?.deviceType ?? 'unknown',
      isAdded:                     true,
      friendlyName:                friendlyName.trim(),
      categoryId:                  categoryId ?? null,
      areaId:                      areaId ?? null,
      credentialUsername:          username.trim(),
      credentialPasswordEncrypted: encPassword,
      httpPort:                    discovered?.httpPort ?? 80,
      sdkPort:                     discovered?.sdkPort ?? 8000,
      subnetMask:                  discovered?.subnetMask ?? null,
      gateway:                     discovered?.gateway ?? null,
      dhcpEnabled:                 discovered?.dhcpEnabled ?? false,
      status:                      'unknown',
    };

    let device;
    if (mac) {
      device = await prisma.networkDevice.upsert({
        where: { macAddress: mac },
        create: upsertData,
        update: { ...upsertData, lastDiscoveredAt: new Date() },
      });
    } else {
      const existing = await prisma.networkDevice.findFirst({ where: { ipAddress: ip } });
      if (existing) {
        device = await prisma.networkDevice.update({ where: { id: existing.id }, data: upsertData });
      } else {
        device = await prisma.networkDevice.create({ data: upsertData });
      }
    }

    const { credentialPasswordEncrypted: _, ...safeDevice } = device as any;
    res.status(201).json({ success: true, data: safeDevice });
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'Dispositivo já cadastrado (conflito de MAC ou número de série).' });
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/discovery/test-connection ──────────────────────────────────────
/**
 * Testa a conexão com um dispositivo sem persistir.
 * Body: { ipAddress, port, protocol, username?, password? }
 * Retorna: { success: bool, latencyMs?: number, error?: string }
 */
router.post('/test-connection', adminMiddleware, async (req: Request, res: Response) => {
  const { ipAddress, port = 80, protocol = 'http', username, password } = req.body;

  if (!ipAddress) return res.status(400).json({ error: 'ipAddress é obrigatório.' });

  const start = Date.now();
  try {
    const url = `http://${ipAddress}:${port}${protocol === 'onvif' ? '/onvif/device_service' : '/'}`;
    const headers: Record<string, string> = { 'User-Agent': 'OnliAcesso-Discovery/1.0' };
    if (username && password) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5_000),
    } as any);

    const latencyMs = Date.now() - start;
    // Qualquer resposta (mesmo 401/403) indica que o dispositivo está acessível
    const reachable = resp.status < 500;
    if (reachable) {
      return res.json({ success: true, latencyMs, httpStatus: resp.status });
    }
    return res.json({ success: false, error: `HTTP ${resp.status}`, latencyMs });
  } catch (e: any) {
    const latencyMs = Date.now() - start;
    const msg = e?.message ?? String(e);
    const isTimeout = msg.includes('timeout') || msg.includes('abort');
    return res.json({
      success: false,
      latencyMs,
      error: isTimeout ? 'Tempo limite atingido — dispositivo não acessível ou porta fechada.' : msg,
    });
  }
});

export default router;
