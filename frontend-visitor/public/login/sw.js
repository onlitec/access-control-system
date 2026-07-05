// Service worker do portal do morador (OnliAcesso).
// Estratégia conservadora: rede primeiro pra tudo (dados de acesso precisam
// estar frescos), com cache apenas dos assets estáticos imutáveis do Next
// (/_next/static, hash no nome) e dos ícones - o ganho é abrir rápido no
// celular; nada de cachear API nem páginas HTML.
const CACHE = 'onliacesso-morador-v1';
const STATIC_PATTERNS = [/^\/_next\/static\//, /^\/login\/icons\//];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isStatic = STATIC_PATTERNS.some((re) => re.test(url.pathname));
  if (!isStatic) return; // API e HTML: sempre rede, sem interceptar

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return resp;
      });
    })
  );
});
