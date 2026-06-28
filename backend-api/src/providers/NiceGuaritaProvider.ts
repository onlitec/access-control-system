import type { IAccessControlProvider } from './IAccessControlProvider';
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

/**
 * Nice Guarita IP provider stub.
 * Gate/barrier control integration — implementation pending SDK delivery.
 * All ACS methods return empty results; isAvailable() always returns false
 * until the SDK is integrated.
 */
export class NiceGuaritaProvider implements IAccessControlProvider {
  readonly name = 'nice_guarita';

  async isAvailable(): Promise<boolean> {
    // SDK not yet available
    return false;
  }

  private _notAvailable(method: string): never {
    throw new Error(`NiceGuaritaProvider.${method}: SDK Nice Guarita IP ainda não disponível.`);
  }

  async addPerson(_data: PersonInput): Promise<string | null> {
    console.warn('[NiceGuarita] addPerson: SDK pendente');
    return null;
  }

  async updatePerson(_externalId: string, _data: Partial<PersonInput>): Promise<void> {
    console.warn('[NiceGuarita] updatePerson: SDK pendente');
  }

  async getPersons(_filter: PersonFilter): Promise<ExternalPerson[]> {
    return [];
  }

  async addPersonFace(_externalId: string, _faceBase64: string): Promise<void> {
    console.warn('[NiceGuarita] addPersonFace: SDK pendente');
  }

  async authorizePersonAccess(_externalId: string, _levelCodes: string[]): Promise<void> {
    console.warn('[NiceGuarita] authorizePersonAccess: SDK pendente');
  }

  async getPersonAccessLevels(_externalId: string): Promise<string[]> {
    return [];
  }

  async createVisitor(_data: VisitorInput): Promise<string | null> {
    return null;
  }

  async listVisitors(_groupName: string): Promise<ExternalVisitor[]> {
    return [];
  }

  async getAccessLogs(_params: AccessLogParams): Promise<AccessLogEntry[]> {
    return [];
  }

  async getDevices(): Promise<Device[]> {
    return [];
  }

  async captureDevicePhoto(_deviceId: string): Promise<Buffer | null> {
    return null;
  }

  async getOrganizations(): Promise<Org[]> {
    return [];
  }

  async getAccessLevels(): Promise<AccessLevel[]> {
    return [];
  }

  // ── Guarita-specific gate control (stub) ─────────────────────────────────
  async openGate(_deviceId: string): Promise<void> {
    this._notAvailable('openGate');
  }

  async closeGate(_deviceId: string): Promise<void> {
    this._notAvailable('closeGate');
  }

  async getGateStatus(_deviceId: string): Promise<'open' | 'closed' | 'unknown'> {
    return 'unknown';
  }
}
