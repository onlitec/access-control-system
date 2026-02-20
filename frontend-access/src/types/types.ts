// Tipos de dados da aplicação

export type UserRole = 'user' | 'admin';

export type ProviderType = 'fixed' | 'temporary';

export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface Tower {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  username: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Resident {
  id: string;
  full_name: string;
  cpf: string;
  phone: string | null;
  email: string | null;
  unit_number: string;
  block: string | null;
  tower: string | null;
  photo_url: string | null;
  hikcentral_person_id: string | null;
  is_owner: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Visitor {
  id: string;
  full_name: string;
  document: string;
  phone: string | null;
  photo_url: string | null;
  document_photo_url: string | null;
  visiting_unit: string;
  visiting_resident: string | null;
  tower: string | null;
  purpose: string | null;
  notes: string | null;
  hikcentral_person_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceProvider {
  id: string;
  full_name: string;
  company_name: string | null;
  document: string;
  phone: string | null;
  email: string | null;
  service_type: string;
  provider_type: ProviderType;
  photo_url: string | null;
  document_photo_url: string | null;
  tower: string | null;
  visiting_resident: string | null;
  valid_from: string | null;
  valid_until: string | null;
  authorized_units: string[] | null;
  notes: string | null;
  hikcentral_person_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisitLog {
  id: string;
  visitor_id: string;
  entry_time: string;
  exit_time: string | null;
  status: VisitStatus;
  authorized_by: string | null;
  notes: string | null;
  created_at: string;
  visitor?: Visitor;
}

export interface AccessLog {
  id: string;
  person_type: string;
  person_id: string;
  person_name: string;
  access_point: string | null;
  access_time: string;
  direction: string;
  notes: string | null;
  created_at: string;
}

export interface HikcentralConfig {
  id: string;
  config_name: string;
  api_url: string;
  app_key: string;
  app_secret: string;
  sync_enabled: boolean;
  last_sync: string | null;
  sync_interval_minutes: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceStatus {
  id: string;
  name: string;
  status: 'online' | 'offline';
  ip?: string;
  type?: string;
}

export interface DashboardStats {
  totalResidents: number;
  totalVisitors: number;
  activeVisits: number;
  completedVisits: number;
  totalProviders: number;
  todayAccess: number;
  onlineDevices: number;
  offlineDevices: number;
  totalDevices: number;
}
