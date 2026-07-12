import { Router, Request, Response } from 'express';
import { promises as fs } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import http from 'http';
import { prisma } from '../database';
import { adminMiddleware } from '../middleware/auth';

const execFileAsync = promisify(execFile);
const router = Router();

/**
 * Acesso via nuvem (cloud.onlitec.com.br) — botão "Habilitar" do painel admin.
 *
 * O registro é AUTO-APROVADO: este backend chama o tenant-registry do VPS pela
 * tailnet (a identidade do servidor é o IP Tailscale de origem, que não é
 * forjável dentro da tailnet; entrar na tailnet já exige chave da Onlitec).
 * O VPS então roteia https://cloud.onlitec.com.br/t/{slug}/... para cá.
 *
 * O estado local (slug, url) fica em IntegrationConfig providerType "cloud".
 */

const REGISTRY_HOST = process.env.CLOUD_REGISTRY_HOST || '100.90.27.7';
const REGISTRY_PORT = Number(process.env.CLOUD_REGISTRY_PORT || 8787);
const VPS_TAILSCALE_IP = process.env.CLOUD_VPS_TAILSCALE_IP || '100.90.27.7';
const IS_WIN = process.platform === 'win32';
const MEDIAMTX_YML = process.env.MEDIAMTX_CONFIG ||
  (IS_WIN ? 'C:\\OnliAcesso\\config\\mediamtx.yml' : '/opt/onliacesso/config/mediamtx.yml');
const MEDIAMTX_SERVICE = process.env.MEDIAMTX_SERVICE ||
  (IS_WIN ? 'onliacesso-mediamtx' : 'onliacesso-mediamtx');
const CLOUD_PORTS = [3001, 8888, 8889];

type StepResult = { step: string; ok: boolean; detail: string };

// ── helpers ────────────────────────────────────────────────────────────────

async function run(cmd: string, args: string[], timeoutMs = 30000): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { timeout: timeoutMs, windowsHide: true });
  return stdout.trim();
}

/** IP Tailscale desta máquina, ou null se o tailscale não estiver ativo. */
async function tailscaleIp(): Promise<string | null> {
  const bin = IS_WIN ? 'C:\\Program Files\\Tailscale\\tailscale.exe' : 'tailscale';
  const attempts: Array<[string, string[]]> = IS_WIN
    ? [[bin, ['ip', '-4']]]
    // no Linux o socket do tailscaled pode ser só-root — tenta direto e via sudo
    : [[bin, ['ip', '-4']], ['sudo', ['-n', bin, 'ip', '-4']]];
  for (const [cmd, args] of attempts) {
    try {
      const out = await run(cmd, args, 10000);
      const ip = out.split('\n')[0].trim();
      if (/^100\.\d+\.\d+\.\d+$/.test(ip)) return ip;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

/** Entra na tailnet com a chave de ativação fornecida pela Onlitec. */
async function tailscaleUp(authKey: string): Promise<void> {
  const bin = IS_WIN ? 'C:\\Program Files\\Tailscale\\tailscale.exe' : 'tailscale';
  const args = ['up', `--authkey=${authKey}`];
  if (!IS_WIN) { await run('sudo', ['-n', bin, ...args], 60000); return; }
  await run(bin, args, 60000);
}

/** Libera 3001/8888/8889 somente para o IP Tailscale do VPS (idempotente). */
async function applyFirewall(): Promise<StepResult> {
  try {
    if (IS_WIN) {
      for (const port of CLOUD_PORTS) {
        const name = `OnliAcesso Cloud ${port} (VPS Tailscale)`;
        const ps = `if (Get-NetFirewallRule -DisplayName '${name}' -ErrorAction SilentlyContinue) { Set-NetFirewallRule -DisplayName '${name}' -RemoteAddress ${VPS_TAILSCALE_IP} } else { New-NetFirewallRule -DisplayName '${name}' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${port} -RemoteAddress ${VPS_TAILSCALE_IP} | Out-Null }`;
        await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps]);
      }
      return { step: 'firewall', ok: true, detail: `portas ${CLOUD_PORTS.join('/')} liberadas para ${VPS_TAILSCALE_IP}` };
    }
    // Linux: exige a entrada correspondente em /etc/sudoers.d/onliacesso
    const status = await run('sudo', ['-n', 'ufw', 'status']);
    if (/Status:\s*inactive/i.test(status)) {
      return { step: 'firewall', ok: true, detail: 'ufw inativo — nada a liberar (acesso já possível pela tailnet)' };
    }
    for (const port of CLOUD_PORTS) {
      await run('sudo', ['-n', 'ufw', 'allow', 'from', VPS_TAILSCALE_IP, 'to', 'any', 'port', String(port), 'proto', 'tcp']);
    }
    return { step: 'firewall', ok: true, detail: `ufw: ${CLOUD_PORTS.join('/')} liberadas para ${VPS_TAILSCALE_IP}` };
  } catch (err: any) {
    return { step: 'firewall', ok: false, detail: `falhou (${err.message}) — rode enable-cloud-access manualmente` };
  }
}

/** POST JSON no tenant-registry do VPS via tailnet. */
function registry(path: string, body?: object): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: REGISTRY_HOST, port: REGISTRY_PORT, path,
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 0, data: JSON.parse(data || '{}') }); }
        catch { resolve({ status: res.statusCode || 0, data: {} }); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Garante o bloco webrtcICEServers2 (TURN do VPS) no mediamtx.yml e reinicia o
 * MediaMTX. Sem o TURN o vídeo remoto cai para HLS silenciosamente.
 */
async function ensureTurn(iceServers: Array<{ url: string; username?: string; password?: string }>): Promise<StepResult> {
  try {
    const yml = await fs.readFile(MEDIAMTX_YML, 'utf8');
    // considera configurado só se houver um bloco ATIVO (linha não comentada)
    if (/^webrtcICEServers2:/m.test(yml)) {
      return { step: 'turn', ok: true, detail: 'webrtcICEServers2 já configurado' };
    }
    const lines = ['', '# TURN do cloud — gravado pelo botão "Habilitar acesso via nuvem"', 'webrtcICEServers2:'];
    for (const s of iceServers) {
      lines.push(`  - url: ${s.url}`);
      if (s.username) lines.push(`    username: ${s.username}`);
      if (s.password) lines.push(`    password: ${s.password}`);
    }
    await fs.writeFile(MEDIAMTX_YML, yml.replace(/\n?$/, '\n') + lines.join('\n') + '\n');

    if (IS_WIN) {
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Restart-Service '${MEDIAMTX_SERVICE}'`], 60000);
    } else {
      await run('sudo', ['-n', 'systemctl', 'restart', MEDIAMTX_SERVICE], 60000);
    }
    return { step: 'turn', ok: true, detail: 'TURN gravado no mediamtx.yml e MediaMTX reiniciado' };
  } catch (err: any) {
    return { step: 'turn', ok: false, detail: `falhou (${err.message}) — vídeo remoto funcionará só em HLS` };
  }
}

async function savedConfig() {
  const row = await prisma.integrationConfig.findUnique({ where: { providerType: 'cloud' } });
  return row?.enabled ? (row.config as any) : null;
}

// ── rotas (todas admin) ────────────────────────────────────────────────────

router.get('/status', adminMiddleware, async (_req: Request, res: Response) => {
  const [ip, saved] = await Promise.all([tailscaleIp(), savedConfig()]);
  let registered: any = null;
  if (ip) {
    try {
      const r = await registry('/me');
      if (r.status === 200) registered = { slug: r.data.slug, url: r.data.url };
    } catch { /* VPS inalcançável — segue com o estado local */ }
  }
  res.json({
    tailscale: ip ? { up: true, ip } : { up: false },
    enabled: Boolean(saved),
    slug: saved?.slug || registered?.slug || null,
    url: saved?.url || registered?.url || null,
    registeredOnVps: Boolean(registered),
  });
});

router.post('/enable', adminMiddleware, async (req: Request, res: Response) => {
  const steps: StepResult[] = [];
  try {
    const slug = String(req.body?.slug || '').trim().toLowerCase();
    const authKey = String(req.body?.authKey || '').trim();
    if (!/^[a-z0-9-]{2,32}$/.test(slug)) {
      res.status(400).json({ error: 'Código inválido: use letras minúsculas, números e hífen (2 a 32 caracteres)' });
      return;
    }

    // 1. tailscale
    let ip = await tailscaleIp();
    if (!ip && authKey) {
      try { await tailscaleUp(authKey); ip = await tailscaleIp(); }
      catch (err: any) { steps.push({ step: 'tailscale', ok: false, detail: err.message }); }
    }
    if (!ip) {
      res.status(409).json({
        error: 'Tailscale não está ativo neste servidor. Informe a chave de ativação fornecida pela Onlitec (ou rode "tailscale up" manualmente) e tente de novo.',
        steps,
      });
      return;
    }
    steps.push({ step: 'tailscale', ok: true, detail: `conectado como ${ip}` });

    // 2. firewall (best-effort: sem ele o registro ainda vale, mas o VPS pode não alcançar)
    steps.push(await applyFirewall());

    // 3. registro no VPS (auto-approve — identidade = IP tailnet de origem)
    const r = await registry('/register', { slug });
    if (r.status !== 200) {
      res.status(r.status === 409 ? 409 : 502).json({ error: r.data?.error || `registro falhou (HTTP ${r.status})`, steps });
      return;
    }
    steps.push({ step: 'registro', ok: true, detail: `tenant '${slug}' ativo no VPS` });

    // 4. TURN
    if (Array.isArray(r.data.iceServers) && r.data.iceServers.length > 0) {
      steps.push(await ensureTurn(r.data.iceServers));
    }

    // 5. estado local
    await prisma.integrationConfig.upsert({
      where: { providerType: 'cloud' },
      update: { enabled: true, config: { slug, url: r.data.url, enabledAt: new Date().toISOString() } },
      create: { providerType: 'cloud', enabled: true, config: { slug, url: r.data.url, enabledAt: new Date().toISOString() } },
    });

    res.json({ success: true, slug, url: r.data.url, steps });
  } catch (err: any) {
    console.error('[Cloud] enable error:', err.message);
    res.status(500).json({ error: err.message, steps });
  }
});

router.post('/disable', adminMiddleware, async (_req: Request, res: Response) => {
  try {
    const saved = await savedConfig();
    const slug = saved?.slug;
    if (slug) {
      try { await registry('/unregister', { slug }); }
      catch (err: any) { console.warn('[Cloud] unregister falhou:', err.message); }
    }
    await prisma.integrationConfig.updateMany({ where: { providerType: 'cloud' }, data: { enabled: false } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
