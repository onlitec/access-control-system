#!/usr/bin/env node
/**
 * OnliAcesso Cloud — tenant-registry (auto-approve)
 *
 * Registro self-service de tenants: o botão "Habilitar acesso via nuvem" do
 * painel admin de cada cliente chama este serviço PELA TAILNET. A identidade
 * do cliente é o IP Tailscale de ORIGEM da conexão — dentro da tailnet ele não
 * é forjável, e entrar na tailnet já exige uma chave que só a Onlitec emite.
 * Por isso o registro é auto-aprovado: tailnet = autorização.
 *
 * Escuta SOMENTE no IP Tailscale do VPS (invisível para a internet).
 * Roda como root (systemd) porque precisa escrever o map do NPM e dar
 * docker exec no container do proxy.
 *
 * Endpoints (JSON):
 *   GET  /me          → registro do IP chamador (ou 404)
 *   POST /register    → { slug } cria/confirma o tenant e devolve
 *                       { url, iceServers } (bloco p/ webrtcICEServers2)
 *   POST /unregister  → { slug } remove — só se o slug pertencer ao chamador
 *
 * Regras anti-sequestro:
 *   - slug já usado por OUTRO IP → 409 (re-apontar máquina reinstalada
 *     continua manual, via deploy/cloud/add-tenant.sh)
 *   - um IP tem no máximo um slug (o /register devolve o existente)
 */
const http = require('http');
const fs = require('fs');
const { execFileSync } = require('child_process');

const LISTEN_HOST = process.env.REGISTRY_HOST || '100.90.27.7';
const LISTEN_PORT = Number(process.env.REGISTRY_PORT || 8787);
const MAP_FILE = process.env.TENANTS_MAP ||
  '/var/lib/docker/volumes/npm_data/_data/nginx/custom/onliacesso-tenants.map';
const NPM_CONTAINER = process.env.NPM_CONTAINER || 'nginx-proxy-manager';
const CLOUD_URL = process.env.CLOUD_URL || 'https://cloud.onlitec.com.br';
const TURN_HOST = process.env.TURN_HOST || '65.109.14.53';
const TURNSERVER_CONF = process.env.TURNSERVER_CONF || '/etc/turnserver.conf';

const SLUG_RE = /^[a-z0-9-]{2,32}$/;
const RESERVED = new Set(['api', 'hls', 'webrtc', 't', 'admin', 'login', 'assets']);

function turnSecret() {
  const line = fs.readFileSync(TURNSERVER_CONF, 'utf8')
    .split('\n').find((l) => l.startsWith('static-auth-secret='));
  return line ? line.slice('static-auth-secret='.length).trim() : null;
}

/** Bloco pronto para o mediamtx.yml do cliente (username AUTH_SECRET = credencial efêmera HMAC). */
function iceServersBlock() {
  const secret = turnSecret();
  if (!secret) return null;
  return [
    { url: `stun:${TURN_HOST}:3478` },
    { url: `turn:${TURN_HOST}:3478`, username: 'AUTH_SECRET', password: secret },
  ];
}

function readMap() {
  let text = '';
  try { text = fs.readFileSync(MAP_FILE, 'utf8'); } catch { /* primeiro uso */ }
  const entries = new Map(); // slug → ip
  for (const line of text.split('\n')) {
    const m = line.match(/^([a-z0-9-]+)\s+(\d+\.\d+\.\d+\.\d+);/);
    if (m) entries.set(m[1], m[2]);
  }
  return entries;
}

function writeMapOrThrow(entries) {
  const body = [...entries.entries()].map(([s, ip]) => `${s} ${ip};`).join('\n') + '\n';
  const backup = fs.existsSync(MAP_FILE) ? fs.readFileSync(MAP_FILE) : null;
  fs.writeFileSync(MAP_FILE, body);
  try {
    execFileSync('docker', ['exec', NPM_CONTAINER, 'nginx', '-t'], { stdio: 'pipe' });
  } catch (err) {
    if (backup !== null) fs.writeFileSync(MAP_FILE, backup); // rollback: nada foi recarregado
    throw new Error('nginx -t recusou o registry: ' + (err.stderr || err.message));
  }
  execFileSync('docker', ['exec', NPM_CONTAINER, 'nginx', '-s', 'reload'], { stdio: 'pipe' });
}

function callerIp(req) {
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return /^100\.\d+\.\d+\.\d+$/.test(ip) ? ip : null; // só tailnet
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(body);
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 4096) throw new Error('body grande demais');
  }
  return data ? JSON.parse(data) : {};
}

const server = http.createServer(async (req, res) => {
  const ip = callerIp(req);
  if (!ip) return send(res, 403, { error: 'somente pela tailnet' });

  try {
    const entries = readMap();
    const mySlug = [...entries.entries()].find(([, v]) => v === ip)?.[0] || null;

    if (req.method === 'GET' && req.url === '/me') {
      if (!mySlug) return send(res, 404, { error: 'não registrado' });
      return send(res, 200, {
        slug: mySlug, ip, url: `${CLOUD_URL}/?t=${mySlug}`, iceServers: iceServersBlock(),
      });
    }

    if (req.method === 'POST' && req.url === '/register') {
      const { slug } = await readBody(req);
      if (!SLUG_RE.test(slug || '')) return send(res, 400, { error: 'slug inválido (use a-z, 0-9 e hífen, 2 a 32 caracteres)' });
      if (RESERVED.has(slug)) return send(res, 400, { error: `'${slug}' é um nome reservado` });

      const owner = entries.get(slug);
      if (owner && owner !== ip) return send(res, 409, { error: `o código '${slug}' já pertence a outro cliente` });
      if (mySlug && mySlug !== slug) {
        return send(res, 409, { error: `este servidor já está registrado como '${mySlug}'`, slug: mySlug, url: `${CLOUD_URL}/?t=${mySlug}` });
      }

      if (!owner) { // novo registro (idempotente quando owner === ip)
        entries.set(slug, ip);
        writeMapOrThrow(entries);
        console.log(`[registry] +${slug} → ${ip}`);
      }
      return send(res, 200, {
        slug, ip, url: `${CLOUD_URL}/?t=${slug}`, iceServers: iceServersBlock(),
      });
    }

    if (req.method === 'POST' && req.url === '/unregister') {
      const { slug } = await readBody(req);
      if (!slug || entries.get(slug) !== ip) return send(res, 403, { error: 'este código não pertence a este servidor' });
      entries.delete(slug);
      writeMapOrThrow(entries);
      console.log(`[registry] -${slug} (${ip})`);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'rota desconhecida' });
  } catch (err) {
    console.error('[registry] erro:', err.message);
    return send(res, 500, { error: err.message });
  }
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[registry] escutando em ${LISTEN_HOST}:${LISTEN_PORT} (só tailnet)`);
});
