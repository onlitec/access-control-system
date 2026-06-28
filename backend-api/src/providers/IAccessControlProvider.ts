import type {
  PersonInput,
  ExternalPerson,
  PersonFilter,
  VisitorInput,
  ExternalVisitor,
  AccessLogParams,
  AccessLogEntry,
  Device,
  Org,
  AccessLevel,
} from './types';

export interface IAccessControlProvider {
  readonly name: string;

  isAvailable(): Promise<boolean>;

  // ── Residents / People ──────────────────────────────────────────────────
  addPerson(data: PersonInput): Promise<string | null>;
  updatePerson(externalId: string, data: Partial<PersonInput>): Promise<void>;
  getPersons(filter: PersonFilter): Promise<ExternalPerson[]>;
  addPersonFace(externalId: string, faceBase64: string): Promise<void>;
  authorizePersonAccess(externalId: string, levelCodes: string[]): Promise<void>;
  getPersonAccessLevels(externalId: string): Promise<string[]>;

  // ── Visitors ─────────────────────────────────────────────────────────────
  createVisitor(data: VisitorInput): Promise<string | null>;
  listVisitors(groupName: string): Promise<ExternalVisitor[]>;

  // ── Access Logs ───────────────────────────────────────────────────────────
  getAccessLogs(params: AccessLogParams): Promise<AccessLogEntry[]>;

  // ── Devices / Terminals ───────────────────────────────────────────────────
  getDevices(): Promise<Device[]>;
  captureDevicePhoto(deviceId: string): Promise<Buffer | null>;

  // ── Configuration / Metadata ──────────────────────────────────────────────
  getOrganizations(): Promise<Org[]>;
  getAccessLevels(): Promise<AccessLevel[]>;
}
