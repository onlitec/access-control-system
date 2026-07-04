// Centralized API service for Admin Panel
const API_BASE_URL = import.meta.env.VITE_API_URL || (window.location.origin + '/api');
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
        credentials: 'include',
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
        credentials: 'include',
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
            credentials: 'include',
        });
        if (response.status === 401) {
            clearStoredAuth();
            redirectToLogin();
            throw new Error('Session expired');
        }
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        const errorMessage = error.message || error.error || `Request failed: ${response.statusText}`;
        const errorDetails = error.details ? ` (${error.details})` : '';
        throw new Error(`${errorMessage}${errorDetails}`);
    }

    // Tratamento especial para imagens (blob)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('image/')) {
        return response.blob() as Promise<T>;
    }

    if (response.status === 204) return undefined as T;
    return response.json();
}

// ============ Auth ============
export const login = async (email: string, password: string) => {
    const result = await request<{ token: string; refreshToken: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        credentials: 'include',
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

export const getOpsHealth = async () => {
    return request<{
        db: {
            version: string;
            activeConnections: number;
            maxConnections: number;
            sizeBytes: number;
            lastBackupAt: string | null;
        };
        disk: {
            usedBytes: number;
            totalBytes: number;
            uploadDirSizeBytes: number;
        };
        api: {
            requestsLast5Min: number;
            avgResponseTimeMs: number;
            errorRatePercent: number;
        };
    }>('/ops/health');
};

export interface WindowsService {
    name: string;
    displayName: string;
    status: string;      // Running | Stopped | StartPending | ...
    startType: string;
    pid: number | null;
    memoryBytes: number | null;
    uptimeSeconds: number | null;
}

export const getOpsServices = async () => {
    return request<WindowsService[]>('/ops/services');
};

export const restartOpsService = async (name: string) => {
    return request<{ success: boolean; mode: 'sync' | 'deferred'; message: string }>(
        `/ops/services/${name}/restart`,
        { method: 'POST' },
    );
};

export interface SystemSettingsData {
    smtpHost: string | null;
    smtpPort: number | null;
    smtpUser: string | null;
    smtpFrom: string | null;
    smtpFromName: string | null;
    smtpPasswordSet: boolean;
    updateManifestUrl: string | null;
    accessMode: 'ip' | 'domain';
    accessUrlIp: string | null;
    accessUrlDomain: string | null;
    appVersion: string;
    effective: {
        host: string;
        port: number;
        user: string;
        from: string;
        fromName: string;
    };
    effectiveAccessUrl: string;
}

export const getSystemSettings = async () => {
    return request<SystemSettingsData>('/system-settings');
};

export const updateSystemSettings = async (payload: {
    smtpHost?: string;
    smtpPort?: number | null;
    smtpUser?: string;
    smtpPassword?: string;
    smtpFrom?: string;
    smtpFromName?: string;
    updateManifestUrl?: string;
    accessMode?: 'ip' | 'domain';
    accessUrlIp?: string;
    accessUrlDomain?: string;
}) => {
    return request<{ success: boolean }>('/system-settings', {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
};

export const testSmtp = async (to?: string) => {
    return request<{ success: boolean; messageId?: string; to?: string; error?: string }>(
        '/system-settings/smtp-test',
        { method: 'POST', body: JSON.stringify(to ? { to } : {}) },
    );
};

export const checkForUpdate = async () => {
    return request<{
        currentVersion: string;
        latestVersion: string;
        updateAvailable: boolean;
        downloadUrl: string | null;
        sha256: string | null;
        notes: string | null;
        checkedAt: string;
    }>('/ops/update-check');
};

export interface BackupRun {
    id: string;
    status: 'running' | 'success' | 'failed';
    type: 'automatic' | 'manual';
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    sizeBytes: string | null;
    destination: string | null;
    errorMessage: string | null;
    triggeredBy: string | null;
    createdAt: string;
}

export const getBackupStatus = async () => {
    return request<{
        lastBackup: BackupRun | null;
        nextScheduled: string;
        destination: string;
    }>('/ops/backups/status');
};

export const getBackupList = async (page = 1, limit = 10) => {
    return request<{
        items: BackupRun[];
        total: number;
        page: number;
        limit: number;
    }>(`/ops/backups/list?page=${page}&limit=${limit}`);
};

export const runBackup = async () => {
    return request<{
        id: string;
        status: 'running';
        startedAt: string;
    }>('/ops/backups/run', {
        method: 'POST',
    });
};

export const deleteBackup = async (id: string) => {
    return request<{ success: boolean; message: string }>(`/ops/backups/${id}`, {
        method: 'DELETE',
    });
};

export const downloadBackup = async (id: string, fileName: string) => {
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE_URL}/ops/backups/${id}/download`, {
        headers,
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error('Download failed');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};

export interface SystemUser {
    id: string;
    name: string;
    email: string;
    role: 'admin_master' | 'operador_portaria' | 'gestor_condominio';
    status: 'active' | 'inactive';
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export const getSystemUsers = async (role?: string) => {
    const query = role ? `?role=${role}` : '';
    return request<SystemUser[]>(`/system-users${query}`);
};

export const createSystemUser = async (data: Partial<SystemUser> & { password?: string }) => {
    return request<SystemUser>('/system-users', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

export const updateSystemUser = async (id: string, data: Partial<SystemUser>) => {
    return request<SystemUser>(`/system-users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

export const deleteSystemUser = async (id: string) => {
    return request<SystemUser>(`/system-users/${id}`, {
        method: 'DELETE',
    });
};

export const resetSystemUserPassword = async (id: string) => {
    return request<{ tempPassword: string }>(`/system-users/${id}/reset-password`, {
        method: 'POST',
    });
};

export interface UserPermissionsResponse {
    role: string;
    rolePermissions: Record<string, boolean> | null;
    customPermissions: Record<string, boolean>;
    effectivePermissions: Record<string, boolean>;
}

export const getUserPermissions = async (id: string) => {
    return request<UserPermissionsResponse>(`/system-users/${id}/permissions`);
};

export const setUserPermissions = async (id: string, overrides: Record<string, boolean | null>) => {
    return request<{ success: boolean; customPermissions: Record<string, boolean> }>(
        `/system-users/${id}/permissions`,
        { method: 'PUT', body: JSON.stringify(overrides) }
    );
};

export interface AccessEvent {
    id: string;
    occurredAt: string;
    personName: string;
    personType: 'resident' | 'visitor' | 'provider_condo' | 'provider_resident';
    personId: string | null;
    unit: string | null;
    operatorId: string | null;
    deviceName: string | null;
    status: 'authorized' | 'denied' | 'pending';
    photoUrl: string | null;
    notes: string | null;
    createdAt: string;
}

export const getAccessAudit = async (filters: {
    from?: string;
    to?: string;
    search?: string;
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
}) => {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.search) params.set('search', filters.search);
    if (filters.type) params.set('type', filters.type);
    if (filters.status) params.set('status', filters.status);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));

    const query = params.toString() ? `?${params.toString()}` : '';
    return request<{
        items: AccessEvent[];
        total: number;
        page: number;
        limit: number;
    }>(`/audit/access${query}`);
};

export const exportAccessAuditCSV = async (filters: {
    from?: string;
    to?: string;
    search?: string;
    type?: string;
    status?: string;
}) => {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.search) params.set('search', filters.search);
    if (filters.type) params.set('type', filters.type);
    if (filters.status) params.set('status', filters.status);

    const query = params.toString() ? `?${params.toString()}` : '';
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/audit/access/export${query}`, {
        headers,
        credentials: 'include',
    });
    if (!response.ok) {
        throw new Error('CSV Export failed');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `acessos-${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};

export interface CondominiumSettings {
    id: string;
    name: string;
    cnpj: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
    type?: string;
    updatedAt: string;
}

export interface Tower {
    id: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
    floors: number;
    blocks?: Block[];
    createdAt?: string;
    updatedAt?: string;
}

export interface Block {
    id: string;
    name: string;
    towerId: string;
    createdAt?: string;
}

export interface Unit {
    id: string;
    number: string;
    floor: number | null;
    status: 'occupied' | 'vacant';
    towerId: string;
    tower?: Tower;
    blockId: string | null;
    block?: Block | null;
    parkingSpaces?: number;
    createdAt?: string;
}

export const getCondominiumSettings = async () => {
    return request<CondominiumSettings>('/condominium/settings');
};

export const updateCondominiumSettings = async (data: Partial<CondominiumSettings>) => {
    return request<CondominiumSettings>('/condominium/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

export const getTowers = async () => {
    return request<Tower[]>('/condominium/towers');
};

export const createTower = async (data: Partial<Tower>) => {
    return request<Tower>('/condominium/towers', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

export const updateTower = async (id: string, data: Partial<Tower>) => {
    return request<Tower>(`/condominium/towers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

export const deleteTower = async (id: string) => {
    return request<{ success: boolean; message: string }>(`/condominium/towers/${id}`, {
        method: 'DELETE',
    });
};

export const createBlock = async (towerId: string, name: string) => {
    return request<Block>(`/condominium/towers/${towerId}/blocks`, {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
};

export const deleteBlock = async (id: string) => {
    return request<{ success: boolean; message: string }>(`/condominium/blocks/${id}`, {
        method: 'DELETE',
    });
};

export const getUnits = async (towerId?: string) => {
    const query = towerId ? `?towerId=${towerId}` : '';
    return request<Unit[]>(`/condominium/units${query}`);
};

export const createUnit = async (data: Partial<Unit>) => {
    return request<Unit>('/condominium/units', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

export const updateUnit = async (id: string, data: Partial<Unit>) => {
    return request<Unit>(`/condominium/units/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

export const deleteUnit = async (id: string) => {
    return request<{ success: boolean; message: string }>(`/condominium/units/${id}`, {
        method: 'DELETE',
    });
};

export const importUnitsCSV = async (csvContent: string) => {
    return request<{ success: boolean; imported: number }>('/condominium/units/import', {
        method: 'POST',
        body: JSON.stringify({ csvContent }),
    });
};

export interface RegistrationRequirement {
    id: string;
    category: string;
    fieldName: string;
    status: 'required' | 'optional' | 'hidden';
}

export interface BlacklistRecord {
    id: string;
    name: string;
    document: string;
    reason: string;
    createdAt?: string;
    createdBy?: string;
}

export interface AccessSchedule {
    id?: string;
    type: 'visitor' | 'provider';
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
}

export const getRegistrationRequirements = async () => {
    return request<RegistrationRequirement[]>('/condominium/requirements');
};

export const updateRegistrationRequirements = async (requirements: { id: string; status: string }[]) => {
    return request<{ success: boolean }>('/condominium/requirements', {
        method: 'PUT',
        body: JSON.stringify({ requirements })
    });
};

export const getBlacklist = async () => {
    return request<BlacklistRecord[]>('/condominium/blacklist');
};

export const addToBlacklist = async (data: { name: string; document: string; reason: string; createdBy?: string }) => {
    return request<BlacklistRecord>('/condominium/blacklist', {
        method: 'POST',
        body: JSON.stringify(data)
    });
};

export const deleteFromBlacklist = async (id: string) => {
    return request<{ success: boolean }>(`/condominium/blacklist/${id}`, {
        method: 'DELETE'
    });
};

export const getAccessSchedules = async () => {
    return request<AccessSchedule[]>('/condominium/schedules');
};

export const updateAccessSchedules = async (schedules: AccessSchedule[]) => {
    return request<AccessSchedule[]>('/condominium/schedules', {
        method: 'PUT',
        body: JSON.stringify({ schedules })
    });
};

// ============ Onboarding: revisão de verificação facial pendente ============
export interface OnboardingPendingReview {
    personId: string;
    name: string;
    unit: string | null;
    tower: string | null;
    block: string | null;
    referencePhotoUrl: string | null;
    lastSelfieUrl: string | null;
    lastSimilarity: number | null;
    attempts: number;
    lastAttemptAt: string | null;
}

export const getOnboardingPendingReviews = async () => {
    return request<{ data: OnboardingPendingReview[] }>('/onboarding/pending-reviews');
};

export const approveOnboardingReview = async (personId: string) => {
    return request<{ success: boolean }>(`/onboarding/pending-reviews/${personId}/approve`, {
        method: 'POST',
    });
};

export const rejectOnboardingReview = async (personId: string, notes?: string) => {
    return request<{ success: boolean; message: string }>(`/onboarding/pending-reviews/${personId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
    });
};

// ============ Pools de níveis de acesso p/ visitantes/prestadores ============

export interface GrantableAccessLevelItem {
    id?: string; // presente nos níveis locais (criados na plataforma)
    hikAccessLevelId: string;
    name: string;
    type: number;
    source: 'area' | 'local' | 'hikcentral';
    approved: boolean;
}

export const getAccessLevelPool = async (appliesTo: 'visitor' | 'provider') => {
    return request<{ success: boolean; hikAvailable: boolean; data: GrantableAccessLevelItem[] }>(
        `/ops/access-level-pools?appliesTo=${appliesTo}`,
    );
};

export const saveAccessLevelPool = async (
    appliesTo: 'visitor' | 'provider',
    items: { hikAccessLevelId: string; name: string }[],
) => {
    return request<{ success: boolean }>('/ops/access-level-pools', {
        method: 'POST',
        body: JSON.stringify({ appliesTo, items }),
    });
};

export const createCustomAccessLevel = async (appliesTo: 'visitor' | 'provider', name: string) => {
    return request<{ success: boolean; level: { id: string; hikAccessLevelId: string; name: string } }>(
        '/ops/access-level-pools/custom',
        { method: 'POST', body: JSON.stringify({ appliesTo, name }) },
    );
};

export const deleteCustomAccessLevel = async (id: string) => {
    return request<{ success: boolean }>(`/ops/access-level-pools/custom/${id}`, { method: 'DELETE' });
};

export const apiFetch = request;
