"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalProvider = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * Standalone provider — all data lives exclusively in the local PostgreSQL DB.
 * No external ACS system required. Used when no integration is configured.
 */
class LocalProvider {
    constructor() {
        this.name = 'local';
    }
    async isAvailable() {
        return true;
    }
    async addPerson(data) {
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
    async updatePerson(externalId, data) {
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
    async getPersons(filter) {
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
    async addPersonFace(externalId, faceBase64) {
        await prisma.person.update({
            where: { id: externalId },
            data: { photoUrl: `data:image/jpeg;base64,${faceBase64}` },
        });
    }
    async authorizePersonAccess(_externalId, _levelCodes) {
        // Local mode: access levels stored in DB metadata only (no ACS enforcement)
        console.log(`[LocalProvider] authorizePersonAccess: recorded locally (no ACS enforcement)`);
    }
    async getPersonAccessLevels(_externalId) {
        return [];
    }
    async createVisitor(data) {
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
    async listVisitors(_groupName) {
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
    async getAccessLogs(params) {
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
            deviceName: e.deviceName || '',
            doorName: e.doorName || '',
            eventType: e.eventType || '',
            picUri: e.picUri ?? undefined,
        }));
    }
    async getDevices() {
        return [];
    }
    async captureDevicePhoto(_deviceId) {
        return null;
    }
    async getOrganizations() {
        return [];
    }
    async getAccessLevels() {
        return [];
    }
}
exports.LocalProvider = LocalProvider;
