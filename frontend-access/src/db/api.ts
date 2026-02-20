// API para interação com Backend Local (Refatorado de Supabase)
import type {
  Profile,
  Resident,
  Visitor,
  ServiceProvider,
  VisitLog,
  AccessLog,
  HikcentralConfig,
  DashboardStats,
  DeviceStatus,
  UserRole,
  Tower
} from '@/types';
import { authRequest } from '@/services/authApi';

const request = authRequest;

// ============ Profiles ============
export const getProfile = async (userId: string) => {
  return request<Profile>(`/profiles/${userId}`);
};

export const getAllProfiles = async () => {
  return request<Profile[]>(`/profiles`);
};

export const updateProfile = async (userId: string, updates: Partial<Profile>) => {
  return request<Profile>(`/profiles/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
};

export const updateUserRole = async (userId: string, role: string) => {
  return request<Profile>(`/profiles/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
};

// ============ Residents ============
export const getResidents = async (page = 1, limit = 20, search = '') => {
  return request<{ data: Resident[], count: number }>(`/residents?page=${page}&limit=${limit}&search=${search}`);
};

export const getResident = async (id: string) => {
  return request<Resident>(`/residents/${id}`);
};

export const createResident = async (resident: Omit<Resident, 'id' | 'created_at' | 'updated_at'>) => {
  const result = await request<Resident>(`/residents`, {
    method: 'POST',
    body: JSON.stringify(resident),
  });
  return result;
};

export const updateResident = async (id: string, updates: Partial<Resident>) => {
  return request<Resident>(`/residents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
};

export const deleteResident = async (id: string) => {
  return request<void>(`/residents/${id}`, {
    method: 'DELETE',
  });
};

export const getAllResidentsForSelect = async () => {
  return request<Array<{ id: string; full_name: string; unit_number: string; block: string | null; tower: string | null }>>(`/residents/select`);
};

// ============ Towers ============
export const getActiveTowers = async () => {
  return request<Tower[]>(`/towers/active`);
};

// ============ Service Providers ============
export const getServiceProviders = async (page = 1, limit = 20, search = '') => {
  return request<{ data: ServiceProvider[], count: number }>(`/service-providers?page=${page}&limit=${limit}&search=${search}`);
};

export const createServiceProvider = async (provider: Omit<ServiceProvider, 'id' | 'created_at' | 'updated_at'>) => {
  return request<ServiceProvider>(`/service-providers`, {
    method: 'POST',
    body: JSON.stringify(provider),
  });
};

export const updateServiceProvider = async (id: string, updates: Partial<ServiceProvider>) => {
  return request<ServiceProvider>(`/service-providers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
};

export const deleteServiceProvider = async (id: string) => {
  return request<void>(`/service-providers/${id}`, {
    method: 'DELETE',
  });
};

// ============ Visitors ============
export const getVisitors = async (page = 1, limit = 20, search = '') => {
  return request<{ data: Visitor[], count: number }>(`/visitors?page=${page}&limit=${limit}&search=${search}`);
};

export const createVisitor = async (visitor: Omit<Visitor, 'id' | 'created_at' | 'updated_at'>) => {
  const result = await request<Visitor>(`/visitors`, {
    method: 'POST',
    body: JSON.stringify(visitor),
  });
  return result;
};

// ============ Hikcentral Config ============
export const getHikcentralConfig = async (): Promise<HikcentralConfig> => {
  const data = await request<any>(`/hik-config`);
  // Map camelCase (Prisma/backend) to snake_case (frontend types)
  return {
    id: data.id,
    config_name: data.configName || data.config_name || 'default',
    api_url: data.apiUrl || data.api_url || '',
    app_key: data.appKey || data.app_key || '',
    app_secret: data.appSecret || data.app_secret || '',
    sync_enabled: data.syncEnabled ?? data.sync_enabled ?? false,
    last_sync: data.lastSync || data.last_sync || null,
    sync_interval_minutes: data.syncIntervalMinutes || data.sync_interval_minutes || 30,
    notes: data.notes || null,
    created_by: data.createdBy || data.created_by || null,
    updated_by: data.updatedBy || data.updated_by || null,
    created_at: data.createdAt || data.created_at || '',
    updated_at: data.updatedAt || data.updated_at || '',
  };
};

export const createOrUpdateHikcentralConfig = async (data: Partial<HikcentralConfig>) => {
  // Map snake_case (frontend) to camelCase (backend/Prisma)
  const payload = {
    apiUrl: data.api_url,
    appKey: data.app_key,
    appSecret: data.app_secret,
    syncEnabled: data.sync_enabled,
  };
  return request<any>(`/hik-config`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
};

// ============ Dashboard Stats ============
export const getDashboardStats = async (): Promise<DashboardStats> => {
  return request<DashboardStats>(`/dashboard/stats`);
};

// ============ Visit Logs ============
export const createVisitLog = async (log: any) => {
  return request<any>(`/visit-logs`, {
    method: 'POST',
    body: JSON.stringify(log),
  });
};

// ============ Access Logs ============
export const getAccessLogs = async (page = 1, limit = 100, filters: any = {}) => {
  const startTime = filters.startDate || new Date(Date.now() - 7 * 86400000).toISOString();
  const endTime = filters.endDate || new Date().toISOString();

  const result = await request<{ data: any[]; total: number; source: string }>(
    `/access-logs?startTime=${startTime}&endTime=${endTime}&pageNo=${page}&pageSize=${limit}`
  );

  // Map backend response to the format AccessLogsPage expects
  const data = (result.data || []).map((event: any) => ({
    id: event.id || `ev-${Math.random()}`,
    access_time: event.eventTime || event.happenTime || new Date().toISOString(),
    person_name: event.personName || 'Desconhecido',
    person_type: filters.personType || 'resident',
    direction: event.eventType === 'EXIT' ? 'exit' : 'entry',
    access_point: event.doorName || event.deviceName || 'Portaria',
    notes: event.eventType || '',
  }));

  return { data, count: result.total || data.length };
};

// ============ Devices Status ============
export const getDevicesStatus = async (): Promise<DeviceStatus[]> => {
  return request<DeviceStatus[]>(`/devices/status`);
};
