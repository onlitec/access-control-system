export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://172.20.120.41:8443/api';
const ACCESS_KEY = 'auth_token';
const REFRESH_KEY = 'auth_refresh_token';
const USER_KEY = 'auth_user';

let refreshInFlight: Promise<string | null> | null = null;

const getAccessToken = () => localStorage.getItem(ACCESS_KEY);
const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

const forceLogout = () => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

export const setAuthSession = (token: string, refreshToken: string, user: AuthUser) => {
  localStorage.setItem(ACCESS_KEY, token);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearAuthSession = () => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
};

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) return null;

  const data = await response.json();
  if (!data?.token || !data?.refreshToken) return null;

  localStorage.setItem(ACCESS_KEY, data.token);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  return data.token as string;
}

const ensureAccessToken = async (): Promise<string | null> => {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken()
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

export async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 401) {
    const nextToken = await ensureAccessToken();
    if (!nextToken) {
      forceLogout();
      throw new Error('Sessão expirada');
    }

    const retryHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
      Authorization: `Bearer ${nextToken}`,
    };
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers: retryHeaders });
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || `Request failed: ${response.statusText}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function loginWithEmail(email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Login failed');
  }
  if (!data?.token || !data?.refreshToken || !data?.user) {
    throw new Error('Resposta de login inválida');
  }
  setAuthSession(data.token, data.refreshToken, data.user as AuthUser);
  return data as { token: string; refreshToken: string; user: AuthUser };
}

export async function logoutCurrentSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return;
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
}
