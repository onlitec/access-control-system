/**
 * Sessão do Onlitec Cloud.
 *
 * O backend do OnliAcesso emite um access token (validade 1 dia) e um refresh
 * token (7 dias). Guardamos os dois no localStorage: assim a sessão sobrevive a
 * reloads e ao fechar o app, e quando o access token expira ele é renovado
 * automaticamente pelo refresh — sem pedir a senha de novo. Só cai para a tela
 * de login quando o refresh também não vale mais.
 */

const TOKEN_KEY = 'onlitec_cloud_token';
const REFRESH_KEY = 'onlitec_cloud_refresh';
const USER_KEY = 'onlitec_cloud_user';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY) || '';

export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

export function saveSession({ token, refreshToken, user }) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(data.error || data.message || 'Usuário ou senha inválidos');
  }
  saveSession(data);
  return data;
}

// uma renovação por vez, mesmo com várias chamadas simultâneas
let refreshInFlight = null;

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;

  const data = await res.json().catch(() => ({}));
  if (!data.token) return null;

  saveSession({ token: data.token, refreshToken: data.refreshToken });
  return data.token;
}

export function ensureFreshToken() {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken()
      .catch(() => null)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

/**
 * fetch autenticado: injeta o Bearer e, se o token tiver expirado (401),
 * renova pelo refresh e repete a chamada uma vez.
 */
export async function authFetch(path, options = {}) {
  const withAuth = (token) => ({
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  });

  let res = await fetch(path, withAuth(getToken()));
  if (res.status !== 401) return res;

  const newToken = await ensureFreshToken();
  if (!newToken) {
    clearSession();
    return res; // sessão realmente acabou — o App volta para o login
  }
  return fetch(path, withAuth(newToken));
}
