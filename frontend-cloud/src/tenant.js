/**
 * Tenant (código do cliente) do Onlitec Cloud.
 *
 * O cloud é multi-tenant: cada cliente do OnliAcesso tem um slug (ex.:
 * "onlitec") e o VPS roteia /t/{slug}/api|hls|webrtc para o servidor local
 * daquele cliente via Tailscale. A autenticação continua no backend local de
 * cada cliente — o slug só decide PARA QUAL servidor a requisição vai; o
 * isolamento real vem do JWT_SECRET único de cada instalação.
 *
 * O slug fica no localStorage e sobrevive ao logout de propósito: quem usa o
 * app raramente sabe o código de cabeça, então ele só é digitado uma vez.
 */

const TENANT_KEY = 'onlitec_cloud_tenant';

export const normalizeSlug = (s) =>
  String(s || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

export const getTenant = () => localStorage.getItem(TENANT_KEY) || '';

export const setTenant = (slug) => {
  localStorage.setItem(TENANT_KEY, normalizeSlug(slug));
};

/** Único ponto que monta URLs do backend/vídeo: prefixa tudo com /t/{slug}. */
export const apiUrl = (path) => `/t/${getTenant()}${path}`;

/** Chave de localStorage por tenant (câmeras, slots do mosaico, etc.). */
export const tenantKey = (base) => `${base}_${getTenant()}`;
