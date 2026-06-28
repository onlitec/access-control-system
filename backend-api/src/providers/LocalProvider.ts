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
 * Standalone provider — all data lives exclusively in the local PostgreSQL DB.
 * No external ACS system required. Used when no integration is configured.
 */
export class LocalProvider implements IAccessControlProvider {
  readonly name = 'local';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async addPerson(data: PersonInput): Promise<string | null> {
    const person = await prisma.person.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        orgIndexCode: data.orgCode,
        phone: data.phone,
        email: data.email,
        cpf: data.cpf,
        photoUrl: data.faceBase64 ? `data:image/jpeg;base64,${data.faceBase64}` : undefined,
      },
    });
    return person.id;
  }

  async updatePerson(externalId: string, data: Partial<PersonInput>): Promise<void> {
    await prisma.person.update({
      where: { id: externalId },
      data: {
        ...(data.firstName && { firstName: data.firstName }),
        ...(data.lastName && { lastName: data.lastName }),
        ...(data.phone && { phone: data.phone }),
        ...(data.email && { email: data.email }),
        ...(data.orgCode && { orgIndexCode: data.orgCode }),
      },
    });
  }

  async getPersons(filter: PersonFilter): Promise<ExternalPerson[]> {
    const persons = await prisma.person.findMany({
      where: {
        ...(filter.orgCode && { orgIndexCode: filter.orgCode }),
        ...(filter.name && {
          OR: [
            { firstName: { contains: filter.name, mode: 'insensitive' } },
            { lastName: { contains: filter.name, mode: 'insensitive' } },
          ],
        }),
      },
      skip: filter.pageNo && filter.pageSize ? (filter.pageNo - 1) * filter.pageSize : undefined,
      take: filter.pageSize,
    });

    return persons.map((p) => ({
      externalId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      orgCode: p.orgIndexCode,
      phone: p.phone ?? undefined,
      email: p.email ?? undefined,
    }));
  }

  async addPersonFace(externalId: string, faceBase64: string): Promise<void> {
    await prisma.person.update({
      where: { id: externalId },
      data: { photoUrl: `data:image/jpeg;base64,${faceBase64}` },
    });
  }

  async authorizePersonAccess(_externalId: string, _levelCodes: string[]): Promise<void> {
    // Local mode: access levels stored in DB metadata only (no ACS enforcement)
    console.log(`[LocalProvider] authorizePersonAccess: recorded locally (no ACS enforcement)`);
  }

  async getPersonAccessLevels(_externalId: string): Promise<string[]> {
    return [];
  }

  async createVisitor(data: VisitorInput): Promise<string | null> {
    const visitor = await prisma.visitor.create({
      data: {
        name: data.name,
        certificateNo: data.certificateNo,
        visitStartTime: new Date(data.visitStartTime),
        visitEndTime: new Date(data.visitEndTime),
        plateNo: data.plateNo,
        photo_url: data.faceBase64 ? `data:image/jpeg;base64,${data.faceBase64}` : undefined,
        status: 'ACTIVE',
        lgpdConsent: false,
      },
    });
    return visitor.id;
  }

  async listVisitors(_groupName: string): Promise<ExternalVisitor[]> {
    const visitors = await prisma.visitor.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return visitors.map((v) => ({
      externalId: v.id,
      name: v.name,
      certificateNo: v.certificateNo ?? undefined,
      phone: v.phone ?? undefined,
      plateNo: v.plateNo ?? undefined,
      visitStartTime: v.visitStartTime?.toISOString(),
      visitEndTime: v.visitEndTime?.toISOString(),
      status: 2, // active
    }));
  }

  async getAccessLogs(params: AccessLogParams): Promise<AccessLogEntry[]> {
    const events = await prisma.accessEvent.findMany({
      where: {
        eventTime: {
          gte: new Date(params.startTime),
          lte: new Date(params.endTime),
        },
      },
      orderBy: { eventTime: 'desc' },
      skip: params.pageNo && params.pageSize ? (params.pageNo - 1) * params.pageSize : undefined,
      take: params.pageSize ?? 100,
    });

    return events.map((e) => ({
      personName: e.personName,
      eventTime: e.eventTime.toISOString(),
      deviceName: e.deviceName,
      doorName: e.doorName,
      eventType: e.eventType,
      picUri: e.picUri ?? undefined,
    }));
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
}
