// Centralized API service for Admin Panel
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://172.20.120.41:8443/api';
const ACCESS_KEY = 'auth_token';
const REFRESH_KEY = 'auth_refresh_token';
const USER_KEY = 'auth_user';

let refreshInFlight: Promise<string | null> | null = null;

const getAccessToken = () => localStorage.getItem(ACCESS_KEY);
const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

export const clearStoredAuth = () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
};

const redirectToLogin = () => {
    if (window.location.pathname !== '/admin/login') {
        window.location.href = '/admin/login';
    }
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

    const data = await response.json().catch(() => ({}));
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = getAccessToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        const nextToken = await ensureAccessToken();
        if (!nextToken) {
            clearStoredAuth();
            redirectToLogin();
            throw new Error('Session expired');
        }

        const retryHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string>),
            Authorization: `Bearer ${nextToken}`,
        };
        response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers: retryHeaders,
        });
        if (response.status === 401) {
            clearStoredAuth();
            redirectToLogin();
            throw new Error('Session expired');
        }
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || error.error || `Request failed: ${response.statusText}`);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
}

// ============ Auth ============
export const login = async (email: string, password: string) => {
    const result = await request<{ token: string; refreshToken: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
    localStorage.setItem(ACCESS_KEY, result.token);
    localStorage.setItem(REFRESH_KEY, result.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    return result;
};

export const logoutCurrentSession = async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return;
    await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
};

export const logoutAllSessions = async () => {
    return request<{ revokedSessions: number }>('/auth/logout-all', {
        method: 'POST',
    });
};

export const getMySessions = async () => {
    return request<{ data: Array<{ id: string; createdAt: string; expiresAt: string }>; count: number; maxActiveSessions: number }>('/auth/sessions');
};

export const revokeMySession = async (sessionId: string) => {
    return request<void>('/auth/revoke-session', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
    });
};

// ============ System Status ============
export const getSystemStatus = async () => {
    return request<{
        api: string;
        database: string;
        hikcentral: string;
        uptime: number;
        timestamp: string;
    }>('/system/status');
};

// ============ Dashboard ============
export const getDashboardStats = async () => {
    return request<{
        totalResidents: number;
        totalVisitors: number;
        activeVisits: number;
        completedVisits: number;
        totalProviders: number;
        todayAccess: number;
        totalAccessEvents: number;
    }>('/dashboard/stats');
};

// ============ Residents ============
export const getResidents = async (page = 1, limit = 20, search = '') => {
    return request<{ data: any[]; count: number }>(`/residents?page=${page}&limit=${limit}&search=${search}`);
};

export const createResident = async (data: any) => {
    return request<any>('/residents', { method: 'POST', body: JSON.stringify(data) });
};

export const updateResident = async (id: string, data: any) => {
    return request<any>(`/residents/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
};

export const deleteResident = async (id: string) => {
    return request<void>(`/residents/${id}`, { method: 'DELETE' });
};

export const syncResidentsFromHikCentral = async () => {
    return request<{ success: boolean; count: number }>('/hikcentral/residents/sync', { method: 'POST' });
};

// ============ Visitors ============
export const getVisitors = async (page = 1, limit = 20, search = '') => {
    return request<{ data: any[]; count: number }>(`/visitors?page=${page}&limit=${limit}&search=${search}`);
};

export const createVisitor = async (data: any) => {
    return request<any>('/visitors', { method: 'POST', body: JSON.stringify(data) });
};

// ============ Access Logs ============
export const getAccessLogs = async (startTime?: string, endTime?: string, page = 1, pageSize = 50) => {
    const start = startTime || new Date(Date.now() - 86400000).toISOString();
    const end = endTime || new Date().toISOString();
    return request<{ data: any[]; total: number; source: string }>(
        `/access-logs?startTime=${start}&endTime=${end}&pageNo=${page}&pageSize=${pageSize}`
    );
};

// ============ Users ============
export const getUsers = async () => {
    return request<any[]>('/users');
};

export const createUser = async (data: { email: string; password: string; name: string; role?: string }) => {
    return request<any>('/users', { method: 'POST', body: JSON.stringify(data) });
};

export const deleteUser = async (id: string) => {
    return request<void>(`/users/${id}`, { method: 'DELETE' });
};

// ============ HikCentral Config ============
export const getHikConfig = async () => {
    return request<any>('/hik-config');
};

export const updateHikConfig = async (data: any) => {
    return request<any>('/hik-config', { method: 'PUT', body: JSON.stringify(data) });
};

// ============ Security / Session Audit ============
export interface SessionAuditFilters {
    page?: number;
    limit?: number;
    userEmail?: string;
    eventType?: string;
    success?: 'true' | 'false';
    startTime?: string;
    endTime?: string;
    ipAddress?: string;
    sessionId?: string;
    sortBy?: 'createdAt' | 'eventType' | 'success' | 'userEmail' | 'ipAddress';
    sortOrder?: 'asc' | 'desc';
}

export const getSessionAudit = async (filters: SessionAuditFilters = {}) => {
    const params = new URLSearchParams();
    params.set('page', String(filters.page || 1));
    params.set('limit', String(filters.limit || 20));
    if (filters.userEmail) params.set('userEmail', filters.userEmail);
    if (filters.eventType) params.set('eventType', filters.eventType);
    if (filters.success) params.set('success', filters.success);
    if (filters.startTime) params.set('startTime', filters.startTime);
    if (filters.endTime) params.set('endTime', filters.endTime);
    if (filters.ipAddress) params.set('ipAddress', filters.ipAddress);
    if (filters.sessionId) params.set('sessionId', filters.sessionId);
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);

    return request<{
        data: Array<{
            id: string;
            userId: string | null;
            userEmail: string | null;
            eventType: string;
            success: boolean;
            sessionId: string | null;
            ipAddress: string | null;
            userAgent: string | null;
            details: string | null;
            createdAt: string;
        }>;
        count: number;
        page: number;
        limit: number;
        sortBy?: 'createdAt' | 'eventType' | 'success' | 'userEmail' | 'ipAddress';
        sortOrder?: 'asc' | 'desc';
        summary?: {
            total: number;
            success: number;
            failure: number;
            loginFailure: number;
        };
    }>(`/security/session-audit?${params.toString()}`);
};

export const getSessionAuditExportMeta = async (filters: SessionAuditFilters = {}) => {
    const params = new URLSearchParams();
    params.set('limit', String(filters.limit || 1000));
    if (filters.userEmail) params.set('userEmail', filters.userEmail);
    if (filters.eventType) params.set('eventType', filters.eventType);
    if (filters.success) params.set('success', filters.success);
    if (filters.startTime) params.set('startTime', filters.startTime);
    if (filters.endTime) params.set('endTime', filters.endTime);
    if (filters.ipAddress) params.set('ipAddress', filters.ipAddress);
    if (filters.sessionId) params.set('sessionId', filters.sessionId);
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);

    return request<{
        count: number;
        requestedLimit: number;
        effectiveLimit: number;
        maxLimit: number;
        truncated: boolean;
    }>(`/security/session-audit/export/meta?${params.toString()}`);
};

export const exportSessionAuditCsv = async (
    filters: SessionAuditFilters = {},
    options?: {
        onProgress?: (progress: { loadedBytes: number; totalBytes: number | null; percent: number | null }) => void;
    },
) => {
    const params = new URLSearchParams();
    params.set('limit', String(filters.limit || 1000));
    if (filters.userEmail) params.set('userEmail', filters.userEmail);
    if (filters.eventType) params.set('eventType', filters.eventType);
    if (filters.success) params.set('success', filters.success);
    if (filters.startTime) params.set('startTime', filters.startTime);
    if (filters.endTime) params.set('endTime', filters.endTime);
    if (filters.ipAddress) params.set('ipAddress', filters.ipAddress);
    if (filters.sessionId) params.set('sessionId', filters.sessionId);
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);

    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    let response = await fetch(`${API_BASE_URL}/security/session-audit/export?${params.toString()}`, {
        method: 'GET',
        headers,
    });
    if (response.status === 401) {
        const nextToken = await ensureAccessToken();
        if (!nextToken) {
            clearStoredAuth();
            redirectToLogin();
            throw new Error('Session expired');
        }
        response = await fetch(`${API_BASE_URL}/security/session-audit/export?${params.toString()}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${nextToken}` },
        });
    }
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || 'Falha ao exportar CSV');
    }

    const totalBytesHeader = response.headers.get('content-length');
    const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
    const hasStreamReader = typeof response.body?.getReader === 'function';
    if (!hasStreamReader) {
        const blob = await response.blob();
        options?.onProgress?.({
            loadedBytes: blob.size,
            totalBytes: blob.size,
            percent: 100,
        });
        return blob;
    }

    const reader = response.body!.getReader();
    const chunks: BlobPart[] = [];
    let loadedBytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value as unknown as BlobPart);
        loadedBytes += value.length;
        const percent = totalBytes && totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : null;
        options?.onProgress?.({ loadedBytes, totalBytes, percent });
    }

    options?.onProgress?.({
        loadedBytes,
        totalBytes,
        percent: 100,
    });
    return new Blob(chunks, { type: 'text/csv;charset=utf-8' });
};

export const getSecurityMetrics = async (windowHours = 24, topN = 10) => {
    return request<{
        generatedAt: string;
        topN: number;
        window: { hours: number; start: string; end: string };
        login: { attempts: number; failedAttempts: number; failureRate: number };
        topIpAttempts: Array<{ ipAddress: string | null; attempts: number; failedAttempts: number; failureRate: number }>;
        topUserAttempts: Array<{ userEmail: string | null; attempts: number; failedAttempts: number; failureRate: number }>;
    }>(`/security/metrics?windowHours=${windowHours}&topN=${topN}`);
};

export const getSecurityMetricsHistory = async (params?: {
    limit?: number;
    windowHours?: number;
    startTime?: string;
    endTime?: string;
}) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.windowHours) query.set('windowHours', String(params.windowHours));
    if (params?.startTime) query.set('startTime', params.startTime);
    if (params?.endTime) query.set('endTime', params.endTime);
    return request<{
        generatedAt: string;
        filters: { windowHours: number | null; limit: number; startTime: string | null; endTime: string | null };
        count: number;
        data: Array<{
            id: string;
            generatedAt: string;
            periodStart: string;
            periodEnd: string;
            windowHours: number;
            topN: number;
            login: { attempts: number; failedAttempts: number; failureRate: number };
            topIpAttempts: Array<{ ipAddress: string | null; attempts: number; failedAttempts: number; failureRate: number }>;
            topUserAttempts: Array<{ userEmail: string | null; attempts: number; failedAttempts: number; failureRate: number }>;
            createdAt: string;
        }>;
    }>(`/security/metrics/history?${query.toString()}`);
};
