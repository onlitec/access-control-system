// OnliAcesso - servidor estático mínimo para os frontends Vite (SPA).
// Uso: node serve-static.js --root <dir> --port <n> --base </painel>
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const root = path.resolve(arg('root', '.'));
const port = parseInt(arg('port', '3003'), 10);
const base = arg('base', '/').replace(/\/+$/, '') || '/';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  // raiz → base do app (ex.: / → /painel/)
  if (base !== '/' && (urlPath === '/' || urlPath === base)) {
    res.writeHead(302, { Location: base + '/' });
    res.end();
    return;
  }

  let rel = urlPath;
  if (base !== '/' && rel.startsWith(base + '/')) {
    rel = rel.slice(base.length);
  }

  let filePath = path.normalize(path.join(root, rel));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        // fallback de SPA: qualquer rota desconhecida devolve index.html
        fs.readFile(path.join(root, 'index.html'), (err3, index) => {
          if (err3) {
            res.writeHead(404).end('Not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(index);
        });
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
      if (rel.startsWith('/assets/')) {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serve-static: root=${root} base=${base} http://127.0.0.1:${port}`);
});
