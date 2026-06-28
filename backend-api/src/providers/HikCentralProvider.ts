import { HikCentralService } from '../services/HikCentralService';
import { PrismaClient } from '@prisma/client';
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

const prisma = new PrismaClient();

/**
 * HikCentral Professional adapter.
 * Delegates to HikCentralService, translating between the generic provider
 * interface and HikCentral-specific API shapes.
 */
export class HikCentralProvider implements IAccessControlProvider {
  readonly name = 'hikcentral';

  async isAvailable(): Promise<boolean> {
    try {
      const config = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
      if (!config?.apiUrl || !config?.appKey || !config?.appSecret) return false;
      await HikCentralService.getOrgList(1, 1);
      return true;
    } catch {
      return false;
    }
  }

  async addPerson(data: PersonInput): Promise<string | null> {
    try {
      const result = await HikCentralService.addPerson({
        personGivenName: data.firstName,
        personFamilyName: data.lastName,
        orgIndexCode: data.orgCode,
        phoneNo: data.phone,
        email: data.email,
        certificateNo: data.cpf ?? data.certificateNo,
        certificateType: data.certificateType,
        ...(data.faceBase64 && { faces: [{ faceData: data.faceBase64 }] }),
      });
      return result?.data?.personId ?? null;
    } catch (err: any) {
      console.error('[HikCentralProvider] addPerson failed:', err.message);
      return null;
    }
  }

  async updatePerson(externalId: string, data: Partial<PersonInput>): Promise<void> {
    await HikCentralService.updatePerson({
      personId: externalId,
      ...(data.firstName && { personGivenName: data.firstName }),
      ...(data.lastName && { personFamilyName: data.lastName }),
      ...(data.orgCode && { orgIndexCode: data.orgCode }),
      ...(data.phone && { phoneNo: data.phone }),
      ...(data.email && { email: data.email }),
    });
  }

  async getPersons(filter: PersonFilter): Promise<ExternalPerson[]> {
    const result = await HikCentralService.getPersonList({
      orgIndexCode: filter.orgCode,
      pageNo: filter.pageNo ?? 1,
      pageSize: filter.pageSize ?? 200,
    });

    const list: any[] = result?.data?.list ?? [];
    return list.map((p: any) => ({
      externalId: p.personId,
      firstName: p.personGivenName ?? '',
      lastName: p.personFamilyName ?? '',
      orgCode: p.orgIndexCode ?? '',
      phone: p.phoneNo,
      email: p.email,
    }));
  }

  async addPersonFace(externalId: string, faceBase64: string): Promise<void> {
    await HikCentralService.addPersonFace(externalId, faceBase64);
  }

  async authorizePersonAccess(externalId: string, levelCodes: string[]): Promise<void> {
    if (levelCodes.length === 0) return;
    await HikCentralService.authorizePerson(externalId, levelCodes);
  }

  async getPersonAccessLevels(externalId: string): Promise<string[]> {
    try {
      const result = await HikCentralService.getPersonAccessLevels(externalId);
      const list: any[] = result?.data?.list ?? [];
      return list.map((l: any) => l.accessLevelIndexCode ?? l.id).filter(Boolean);
    } catch {
      return [];
    }
  }

  async createVisitor(data: VisitorInput): Promise<string | null> {
    try {
      const result = await HikCentralService.reserveVisitor({
        visitorName: data.name,
        certificateNo: data.certificateNo,
        visitStartTime: data.visitStartTime,
        visitEndTime: data.visitEndTime,
        plateNo: data.plateNo,
        visitorPicData: data.faceBase64,
      });
      return result?.data?.visitorId ?? null;
    } catch (err: any) {
      console.error('[HikCentralProvider] createVisitor failed:', err.message);
      return null;
    }
  }

  async listVisitors(groupName: string): Promise<ExternalVisitor[]> {
    try {
      const visitors = await HikCentralService.fetchVisitorsWithStatus(groupName);
      return visitors.map((v) => ({
        externalId: v.visitorId,
        name: v.visitorName,
        certificateNo: v.certificateNo,
        phone: v.phoneNum,
        plateNo: v.plateNo,
        visitStartTime: v.visitStartTime,
        visitEndTime: v.visitEndTime,
        status: v.status,
      }));
    } catch {
      return [];
    }
  }

  async getAccessLogs(params: AccessLogParams): Promise<AccessLogEntry[]> {
    try {
      const result = await HikCentralService.getAccessLogs(params);
      const list: any[] = result?.data?.list ?? [];
      return list.map((e: any) => ({
        personName: e.personName ?? '',
        eventTime: e.eventTime ?? '',
        deviceName: e.deviceName ?? '',
        doorName: e.doorName ?? '',
        eventType: e.eventType ?? '',
        picUri: e.picUri,
      }));
    } catch {
      return [];
    }
  }

  async getDevices(): Promise<Device[]> {
    try {
      const result = await HikCentralService.getAcsDeviceList(1, 100);
      const list: any[] = result?.data?.list ?? [];
      return list.map((d: any) => ({
        id: d.indexCode ?? d.deviceIndexCode,
        name: d.deviceName ?? d.name,
        location: d.installLocation,
        type: d.deviceType,
      }));
    } catch {
      return [];
    }
  }

  async captureDevicePhoto(deviceId: string): Promise<Buffer | null> {
    try {
      return await HikCentralService.captureCameraPicture(deviceId);
    } catch {
      return null;
    }
  }

  async getOrganizations(): Promise<Org[]> {
    try {
      const result = await HikCentralService.getOrgList(1, 200);
      const list: any[] = result?.data?.list ?? [];
      return list.map((o: any) => ({
        id: o.orgIndexCode,
        name: o.orgName,
        parentId: o.parentOrgIndexCode,
      }));
    } catch {
      return [];
    }
  }

  async getAccessLevels(): Promise<AccessLevel[]> {
    try {
      const result = await HikCentralService.getAccessLevelList(1, 200);
      const list: any[] = result?.data?.list ?? [];
      return list.map((l: any) => ({
        id: l.accessLevelIndexCode ?? l.id,
        name: l.accessLevelName ?? l.name,
      }));
    } catch {
      return [];
    }
  }
}
