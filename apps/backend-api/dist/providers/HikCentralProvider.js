"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HikCentralProvider = void 0;
const HikCentralService_1 = require("../services/HikCentralService");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * HikCentral Professional adapter.
 * Delegates to HikCentralService, translating between the generic provider
 * interface and HikCentral-specific API shapes.
 */
class HikCentralProvider {
    constructor() {
        this.name = 'hikcentral';
    }
    async isAvailable() {
        try {
            const config = await prisma.hikcentralConfig.findFirst({ orderBy: { createdAt: 'desc' } });
            if (!config?.apiUrl || !config?.appKey || !config?.appSecret)
                return false;
            await HikCentralService_1.HikCentralService.getOrgList(1, 1);
            return true;
        }
        catch {
            return false;
        }
    }
    async addPerson(data) {
        try {
            const result = await HikCentralService_1.HikCentralService.addPerson({
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
        }
        catch (err) {
            console.error('[HikCentralProvider] addPerson failed:', err.message);
            return null;
        }
    }
    async updatePerson(externalId, data) {
        await HikCentralService_1.HikCentralService.updatePerson({
            personId: externalId,
            ...(data.firstName && { personGivenName: data.firstName }),
            ...(data.lastName && { personFamilyName: data.lastName }),
            ...(data.orgCode && { orgIndexCode: data.orgCode }),
            ...(data.phone && { phoneNo: data.phone }),
            ...(data.email && { email: data.email }),
        });
    }
    async getPersons(filter) {
        const result = await HikCentralService_1.HikCentralService.getPersonList({
            orgIndexCode: filter.orgCode,
            pageNo: filter.pageNo ?? 1,
            pageSize: filter.pageSize ?? 200,
        });
        const list = result?.data?.list ?? [];
        return list.map((p) => ({
            externalId: p.personId,
            firstName: p.personGivenName ?? '',
            lastName: p.personFamilyName ?? '',
            orgCode: p.orgIndexCode ?? '',
            phone: p.phoneNo,
            email: p.email,
        }));
    }
    async addPersonFace(externalId, faceBase64) {
        await HikCentralService_1.HikCentralService.addPersonFace(externalId, faceBase64);
    }
    async authorizePersonAccess(externalId, levelCodes) {
        if (levelCodes.length === 0)
            return;
        await HikCentralService_1.HikCentralService.authorizePerson(externalId, levelCodes);
    }
    async getPersonAccessLevels(externalId) {
        try {
            const result = await HikCentralService_1.HikCentralService.getPersonAccessLevels(externalId);
            const list = result?.data?.list ?? [];
            return list.map((l) => l.accessLevelIndexCode ?? l.id).filter(Boolean);
        }
        catch {
            return [];
        }
    }
    async createVisitor(data) {
        try {
            const result = await HikCentralService_1.HikCentralService.reserveVisitor({
                visitorName: data.name,
                certificateNo: data.certificateNo,
                visitStartTime: data.visitStartTime,
                visitEndTime: data.visitEndTime,
                plateNo: data.plateNo,
                visitorPicData: data.faceBase64,
            });
            return result?.data?.visitorId ?? null;
        }
        catch (err) {
            console.error('[HikCentralProvider] createVisitor failed:', err.message);
            return null;
        }
    }
    async listVisitors(groupName) {
        try {
            const visitors = await HikCentralService_1.HikCentralService.fetchVisitorsWithStatus(groupName);
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
        }
        catch {
            return [];
        }
    }
    async getAccessLogs(params) {
        try {
            const result = await HikCentralService_1.HikCentralService.getAccessLogs(params);
            const list = result?.data?.list ?? [];
            return list.map((e) => ({
                personName: e.personName ?? '',
                eventTime: e.eventTime ?? '',
                deviceName: e.deviceName ?? '',
                doorName: e.doorName ?? '',
                eventType: e.eventType ?? '',
                picUri: e.picUri,
            }));
        }
        catch {
            return [];
        }
    }
    async getDevices() {
        try {
            const result = await HikCentralService_1.HikCentralService.getAcsDeviceList(1, 100);
            const list = result?.data?.list ?? [];
            return list.map((d) => ({
                id: d.indexCode ?? d.deviceIndexCode,
                name: d.deviceName ?? d.name,
                location: d.installLocation,
                type: d.deviceType,
            }));
        }
        catch {
            return [];
        }
    }
    async captureDevicePhoto(deviceId) {
        try {
            return await HikCentralService_1.HikCentralService.captureCameraPicture(deviceId);
        }
        catch {
            return null;
        }
    }
    async getOrganizations() {
        try {
            const result = await HikCentralService_1.HikCentralService.getOrgList(1, 200);
            const list = result?.data?.list ?? [];
            return list.map((o) => ({
                id: o.orgIndexCode,
                name: o.orgName,
                parentId: o.parentOrgIndexCode,
            }));
        }
        catch {
            return [];
        }
    }
    async getAccessLevels() {
        try {
            const result = await HikCentralService_1.HikCentralService.getAccessLevelList(1, 200);
            const list = result?.data?.list ?? [];
            return list.map((l) => ({
                id: l.accessLevelIndexCode ?? l.id,
                name: l.accessLevelName ?? l.name,
            }));
        }
        catch {
            return [];
        }
    }
}
exports.HikCentralProvider = HikCentralProvider;
