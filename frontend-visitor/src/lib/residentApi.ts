const API = typeof window !== 'undefined' ? `${window.location.origin}/api` : '/api';

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('resident_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function loginResident(cpf: string, password: string) {
  const res = await fetch(`${API}/resident/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha no login');
  return data as { token: string; resident: Record<string, any> };
}

export async function getMe() {
  const res = await fetch(`${API}/resident/auth/me`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Sessão inválida');
  return data;
}

export async function logoutResident() {
  await fetch(`${API}/resident/auth/logout`, { method: 'POST', headers: authHeaders() });
  localStorage.removeItem('resident_token');
  localStorage.removeItem('resident_info');
}

export async function getMyVisitors() {
  const res = await fetch(`${API}/resident/visitors`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao buscar visitantes');
  return data.visitors as any[];
}

export async function getGrantableAccessLevels(type: 'visitor' | 'provider') {
  const res = await fetch(`${API}/resident/access-levels?type=${type}`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao buscar níveis de acesso');
  return data.accessLevels as { id: string; hikAccessLevelId: string; name: string }[];
}

export async function preRegisterVisitor(payload: {
  name: string;
  surname?: string;
  phone?: string;
  email?: string;
  purpose?: string;
  type?: string;
  visitStartTime?: string;
  visitEndTime?: string;
  selectedAccessLevelIds?: string[];
}) {
  const res = await fetch(`${API}/resident/visitors/pre-register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao pré-cadastrar');
  return data as { visitor: any; completionLink: string };
}

export async function getMyProviders() {
  const res = await fetch(`${API}/resident/providers`, { headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao buscar prestadores');
  return data.providers as any[];
}

export async function preRegisterProvider(payload: {
  fullName: string;
  document: string;
  phone?: string;
  email?: string;
  serviceType: string;
  validFrom?: string;
  validUntil?: string;
  selectedAccessLevelIds?: string[];
}) {
  const res = await fetch(`${API}/resident/providers/pre-register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao pré-cadastrar prestador');
  return data as { provider: any };
}
