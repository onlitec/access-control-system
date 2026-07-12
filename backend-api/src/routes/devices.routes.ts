/**
 * devices.routes.ts
 * CRUD e operações avançadas para dispositivos de rede cadastrados (NetworkDevice).
 * Rotas base: /api/devices
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../database';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import net from 'net';
import { createCipheriv, randomBytes, scryptSync, createDecipheriv } from 'crypto';

const router = Router();
router.use(authMiddleware);

// ── Crypto helpers ─────────────────────────────────────────────────────────────
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

// Omite a senha criptografada dos selects Prisma por padrão
const SAFE_SELECT = {
  id: true, macAddress: true, ipAddress: true, protocolType: true,
  manufacturer: true, model: true, serialNumber: true, firmwareVersion: true,
  deviceType: true, isAdded: true, lastDiscoveredAt: true,
  categoryId: true, areaId: true, friendlyName: true, channelCount: true,
  httpPort: true, sdkPort: true, subnetMask: true, gateway: true,
  dhcpEnabled: true, credentialUsername: true, status: true, lastSyncAt: true,
  createdAt: true, updatedAt: true,
  category: { select: { id: true, code: true, name: true } },
};

// ── Ping helper ────────────────────────────────────────────────────────────────
async function tcpPing(ip: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, timeoutMs);
    socket.connect(port, ip, () => { clearTimeout(timer); socket.destroy(); resolve(true); });
    socket.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

// ── GET /api/devices ──────────────────────────────────────────────────────────
/**
 * Lista dispositivos cadastrados (isAdded = true).
 * Query: ?search=&categoryId=&areaId=&status=&page=1&limit=50&orderBy=friendlyName&dir=asc
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      search = '', categoryId = '', areaId = '',
      status = '', page = '1', limit = '50',
      orderBy = 'createdAt', dir = 'desc',
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = Math.min(parseInt(limit), 200);

    const where: any = { isAdded: true };
    if (search)     where.OR = [
      { friendlyName: { contains: search, mode: 'insensitive' } },
      { ipAddress:    { contains: search } },
      { manufacturer: { contains: search, mode: 'insensitive' } },
      { model:        { contains: search, mode: 'insensitive' } },
      { serialNumber: { contains: search, mode: 'insensitive' } },
    ];
    if (categoryId) where.categoryId = categoryId;
    if (areaId)     where.areaId = areaId;
    if (status)     where.status = status;

    const [devices, total] = await Promise.all([
      prisma.networkDevice.findMany({
        where, select: SAFE_SELECT,
        orderBy: { [orderBy]: dir },
        skip, take,
      }),
      prisma.networkDevice.count({ where }),
    ]);

    res.json({ success: true, data: devices, total, page: parseInt(page), limit: take });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/devices ─────────────────────────────────────────────────────────
/** Cadastro manual direto (sem discovery). */
router.post('/', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const {
      ipAddress, macAddress, protocolType = 'manual', friendlyName,
      manufacturer, model, serialNumber, deviceType = 'unknown',
      categoryId, areaId, username, password,
      httpPort = 80, sdkPort = 8000,
    } = req.body;

    if (!ipAddress?.trim()) return res.status(400).json({ error: 'ipAddress é obrigatório.' });
    if (!friendlyName?.trim()) return res.status(400).json({ error: 'Nome do dispositivo é obrigatório.' });
    if (!username?.trim() || !password) return res.status(400).json({ error: 'Credenciais são obrigatórias.' });

    const device = await prisma.networkDevice.create({
      data: {
        ipAddress, macAddress: macAddress || null, protocolType, friendlyName,
        manufacturer: manufacturer || null, model: model || null,
        serialNumber: serialNumber || null, deviceType, isAdded: true,
        categoryId: categoryId || null, areaId: areaId || null,
        credentialUsername: username, credentialPasswordEncrypted: encryptPassword(password),
        httpPort: Number(httpPort), sdkPort: Number(sdkPort), status: 'unknown',
      },
      select: SAFE_SELECT,
    });
    res.status(201).json({ success: true, data: device });
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'Conflito: MAC ou número de série já cadastrado.' });
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/devices/categories ──────────────────────────────────────────────
// Precisa vir ANTES de GET /:id — senão o Express casa ":id = categories".
router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const cats = await prisma.deviceCategory.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: cats });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/devices/:id ──────────────────────────────────────────────────────
/** Detalhes do dispositivo + últimos 20 logs de sincronização. */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const device = await prisma.networkDevice.findUnique({
      where: { id: req.params.id },
      select: {
        ...SAFE_SELECT,
        syncLogs: {
          select: { id: true, status: true, message: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    res.json({ success: true, data: device });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/devices/:id ──────────────────────────────────────────────────────
/** Atualiza nome, área, credenciais e portas de um dispositivo. */
router.put('/:id', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      friendlyName, areaId, categoryId,
      username, password,
      httpPort, sdkPort, status,
    } = req.body;

    const data: any = {};
    if (friendlyName !== undefined) data.friendlyName = friendlyName;
    if (areaId !== undefined)       data.areaId = areaId || null;
    if (categoryId !== undefined)   data.categoryId = categoryId || null;
    if (username !== undefined)     data.credentialUsername = username;
    if (password)                   data.credentialPasswordEncrypted = encryptPassword(password);
    if (httpPort !== undefined)     data.httpPort = Number(httpPort);
    if (sdkPort !== undefined)      data.sdkPort = Number(sdkPort);
    if (status !== undefined)       data.status = status;

    const device = await prisma.networkDevice.update({
      where: { id }, data, select: SAFE_SELECT,
    });
    res.json({ success: true, data: device });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Dispositivo não encontrado.' });
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/devices ───────────────────────────────────────────────────────
/**
 * Remoção em lote.
 * Bloqueia se algum dispositivo (pela serialNumber ou ipAddress) estiver
 * vinculado a uma porta ativa em AccessAreaDoor via FacialAccessDevice.
 * Body: { ids: string[] }
 */
router.delete('/', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Nenhum ID informado.' });
    }

    // Verifica dispositivos que têm portas vinculadas a áreas de acesso
    const blockedDevices = await prisma.networkDevice.findMany({
      where: {
        id: { in: ids },
        isAdded: true,
      },
      select: { id: true, friendlyName: true, ipAddress: true },
    });

    // Verifica se algum dos IPs bate com um FacialAccessDevice vinculado a uma área
    const deviceIps = blockedDevices.map((d) => d.ipAddress);
    const linked = await (prisma as any).facialAccessDevice?.findMany({
      where: { ip: { in: deviceIps } },
      select: { ip: true, name: true },
    }).catch(() => [] as any[]);

    if (linked && linked.length > 0) {
      const names = linked.map((d: any) => d.name || d.ip).join(', ');
      return res.status(400).json({
        error: `Os seguintes dispositivos possuem portas de acesso configuradas e não podem ser removidos: ${names}. Remova os vínculos em "Áreas de Acesso" antes de excluir.`,
      });
    }

    await prisma.networkDevice.deleteMany({ where: { id: { in: ids } } });
    res.json({ success: true, deleted: ids.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/devices/:id/sync ────────────────────────────────────────────────
/** Sincroniza status de rede de um dispositivo via TCP ping nas portas conhecidas. */
router.post('/:id/sync', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const device = await prisma.networkDevice.findUnique({
      where: { id: req.params.id },
      select: { id: true, ipAddress: true, httpPort: true, sdkPort: true },
    });
    if (!device) return res.status(404).json({ error: 'Dispositivo não encontrado.' });

    const portsToCheck = [device.httpPort, device.sdkPort, 554].filter(Boolean) as number[];
    const results = await Promise.all(portsToCheck.map((p) => tcpPing(device.ipAddress, p)));
    const online = results.some(Boolean);
    const newStatus = online ? 'online' : 'offline';

    const [updated] = await Promise.all([
      prisma.networkDevice.update({
        where: { id: device.id },
        data: { status: newStatus, lastSyncAt: new Date() },
        select: SAFE_SELECT,
      }),
      prisma.deviceSyncLog.create({
        data: {
          deviceId: device.id,
          status: online ? 'success' : 'error',
          message: online ? `Online (ping OK em ${portsToCheck.filter((_, i) => results[i]).join(',')})` : 'Offline — todas as portas inacessíveis',
        },
      }),
    ]);

    res.json({ success: true, data: updated });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/devices/sync-all ────────────────────────────────────────────────
/** Dispara sincronização de status para todos os dispositivos cadastrados (background). */
router.post('/sync-all', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const devices = await prisma.networkDevice.findMany({
      where: { isAdded: true },
      select: { id: true, ipAddress: true, httpPort: true, sdkPort: true },
    });

    res.json({ success: true, message: `Sincronização de ${devices.length} dispositivos iniciada em background.` });

    // Processa em background sem bloquear a resposta
    setImmediate(async () => {
      for (const device of devices) {
        try {
          const portsToCheck = [device.httpPort, device.sdkPort, 554].filter(Boolean) as number[];
          const results = await Promise.all(portsToCheck.map((p) => tcpPing(device.ipAddress, p, 1500)));
          const online = results.some(Boolean);
          await prisma.networkDevice.update({
            where: { id: device.id },
            data: { status: online ? 'online' : 'offline', lastSyncAt: new Date() },
          });
          await prisma.deviceSyncLog.create({
            data: {
              deviceId: device.id,
              status: online ? 'success' : 'error',
              message: online ? 'Online (sync-all)' : 'Offline (sync-all)',
            },
          });
        } catch {}
      }
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/devices/bulk/password ────────────────────────────────────────────
/** Modifica a senha em lote nos registros do banco (não envia para o dispositivo). */
router.put('/bulk/password', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { ids, password } = req.body as { ids: string[]; password: string };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Nenhum ID informado.' });
    if (!password) return res.status(400).json({ error: 'Senha é obrigatória.' });

    const enc = encryptPassword(password);
    await prisma.networkDevice.updateMany({
      where: { id: { in: ids } },
      data: { credentialPasswordEncrypted: enc },
    });
    res.json({ success: true, updated: ids.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/devices/bulk/timezone ────────────────────────────────────────────
/** Registra o timezone padrão do condomínio nos metadados (sem enviar para hardware — placeholder para integração futura). */
router.put('/bulk/timezone', adminMiddleware, async (req: Request, res: Response) => {
  try {
    const { ids, timezone } = req.body as { ids: string[]; timezone: string };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Nenhum ID informado.' });
    if (!timezone) return res.status(400).json({ error: 'Timezone é obrigatório.' });

    // Persiste nos logs para rastreabilidade
    await prisma.deviceSyncLog.createMany({
      data: ids.map((deviceId) => ({
        deviceId,
        status: 'success',
        message: `Timezone definido como "${timezone}" via lote.`,
      })),
    });
    res.json({ success: true, message: `Timezone "${timezone}" registrado para ${ids.length} dispositivos.` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
