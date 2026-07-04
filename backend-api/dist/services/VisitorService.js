"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisitorService = void 0;
const HikCentralClient_1 = require("./HikCentralClient");
const BiometryService_1 = require("./BiometryService");
class VisitorService {
    /**
     * Register visitor with face-only authentication
     *
     * Flow:
     * 1. Validate face quality
     * 2. Register visitor in HikCentral
     * 3. Assign privilege group
     * 4. Sync to devices
     * 5. Save to local DB
     */
    static async registerVisitor(data) {
        try {
            // 1. Validate face quality
            console.log('[VisitorService] Validating face...');
            const faceValidation = await BiometryService_1.BiometryService.validateFace(data.faceData);
            if (!faceValidation.valid) {
                return {
                    success: false,
                    error: faceValidation.errorMessage,
                    errorCode: faceValidation.errorCode,
                };
            }
            // 2. Extract base64 data
            let base64Face = data.faceData;
            if (data.faceData.includes(',')) {
                base64Face = data.faceData.split(',')[1];
            }
            // 3. Build payload for HikCentral
            const payload = {
                visitorInfoList: [{
                        visitorName: data.visitorName,
                        certificateType: data.certificateType || 111,
                        certificateNo: data.certificateNo,
                        phoneNo: data.phoneNo,
                        plateNo: data.plateNo,
                        visitStartTime: this.formatDateTime(data.visitStartTime),
                        visitEndTime: this.formatDateTime(data.visitEndTime),
                        faces: [{ faceData: base64Face }],
                    }],
                visitorGroupId: data.visitorGroupId,
            };
            // 4. Register visitor in HikCentral
            console.log('[VisitorService] Registering visitor in HikCentral...');
            const registerResult = await (0, HikCentralClient_1.hikRequest)('/artemis/api/visitor/v1/registerment', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const hikVisitorId = registerResult?.data?.visitorId ||
                registerResult?.data?.visitorIds?.[0];
            if (!hikVisitorId) {
                return {
                    success: false,
                    error: 'Failed to get visitorId from HikCentral',
                    errorCode: 'NO_VISITOR_ID',
                };
            }
            console.log(`[VisitorService] Visitor registered in HikCentral: ${hikVisitorId}`);
            // 5. Assign privilege group
            console.log(`[VisitorService] Assigning privilege group ${data.privilegeGroupId}...`);
            await this.assignPrivilegeGroup(hikVisitorId, data.privilegeGroupId);
            // 6. Sync to devices
            console.log('[VisitorService] Syncing to devices...');
            await this.syncToDevice(hikVisitorId);
            // 7. Save to local database
            const localVisitor = await HikCentralClient_1.prisma.visitor.create({
                data: {
                    name: data.visitorName,
                    certificateNo: data.certificateNo,
                    certificateType: String(data.certificateType || 111),
                    phone: data.phoneNo,
                    plateNo: data.plateNo,
                    visitStartTime: data.visitStartTime,
                    visitEndTime: data.visitEndTime,
                    hikVisitorId: hikVisitorId,
                    photo_url: data.faceData.startsWith('data:') ? data.faceData : `data:image/jpeg;base64,${base64Face}`,
                    visitorGroupId: data.visitorGroupId,
                    privilegeGroupId: data.privilegeGroupId,
                    visiting_resident: data.visitingResident,
                    visiting_unit: data.visitingUnit,
                    purpose: data.purpose,
                    status: 'ACTIVE',
                },
            });
            console.log(`[VisitorService] Visitor saved to local DB: ${localVisitor.id}`);
            return {
                success: true,
                visitorId: localVisitor.id,
                hikVisitorId: hikVisitorId,
            };
        }
        catch (error) {
            console.error('[VisitorService] Register visitor error:', error);
            return {
                success: false,
                error: error.message,
                errorCode: 'REGISTER_ERROR',
            };
        }
    }
    /**
     * Check-out visitor (revoke face from devices)
     *
     * POST /artemis/api/visitor/v1/visitor/out
     */
    static async checkoutVisitor(visitorId) {
        try {
            // Get existing visitor
            const existingVisitor = await HikCentralClient_1.prisma.visitor.findFirst({
                where: {
                    OR: [
                        { id: visitorId },
                        { hikVisitorId: visitorId }
                    ]
                },
            });
            if (!existingVisitor) {
                return {
                    success: false,
                    error: 'Visitor not found',
                    errorCode: 'NOT_FOUND',
                };
            }
            const hikVisitorId = existingVisitor.hikVisitorId;
            // Call visitor/out API to revoke face
            if (hikVisitorId) {
                console.log(`[VisitorService] Checking out visitor ${hikVisitorId}...`);
                await (0, HikCentralClient_1.hikRequest)('/artemis/api/visitor/v1/visitor/out', {
                    method: 'POST',
                    body: JSON.stringify({
                        visitorId: hikVisitorId,
                    }),
                });
                console.log(`[VisitorService] Visitor ${hikVisitorId} checked out - face revoked`);
            }
            // Update local status
            await HikCentralClient_1.prisma.visitor.update({
                where: { id: existingVisitor.id },
                data: {
                    status: 'FINISHED',
                    updated_at: new Date(),
                },
            });
            return {
                success: true,
                visitorId: existingVisitor.id,
                hikVisitorId: hikVisitorId || undefined,
            };
        }
        catch (error) {
            console.error('[VisitorService] Checkout visitor error:', error);
            return {
                success: false,
                error: error.message,
                errorCode: 'CHECKOUT_ERROR',
            };
        }
    }
    /**
     * Extend visitor visit time
     */
    static async extendVisit(visitorId, newEndTime) {
        try {
            const existingVisitor = await HikCentralClient_1.prisma.visitor.findFirst({
                where: {
                    OR: [
                        { id: visitorId },
                        { hikVisitorId: visitorId }
                    ]
                },
            });
            if (!existingVisitor) {
                return {
                    success: false,
                    error: 'Visitor not found',
                    errorCode: 'NOT_FOUND',
                };
            }
            // Update in HikCentral if needed
            // Note: HikCentral may not support direct time extension, 
            // may need to re-register or use specific API
            // Update local
            await HikCentralClient_1.prisma.visitor.update({
                where: { id: existingVisitor.id },
                data: {
                    visitEndTime: newEndTime,
                    updated_at: new Date(),
                },
            });
            return {
                success: true,
                visitorId: existingVisitor.id,
            };
        }
        catch (error) {
            console.error('[VisitorService] Extend visit error:', error);
            return {
                success: false,
                error: error.message,
                errorCode: 'EXTEND_ERROR',
            };
        }
    }
    /**
     * Assign privilege group to visitor
     */
    static async assignPrivilegeGroup(visitorId, privilegeGroupId) {
        try {
            await (0, HikCentralClient_1.hikRequest)('/artemis/api/acs/v1/privilege/group/single/addPersons', {
                method: 'POST',
                body: JSON.stringify({
                    privilegeGroupId,
                    visitorIds: [visitorId],
                }),
            });
            console.log(`[VisitorService] Privilege group ${privilegeGroupId} assigned to visitor ${visitorId}`);
        }
        catch (error) {
            console.warn(`[VisitorService] Privilege assignment warning: ${error.message}`);
        }
    }
    /**
     * Sync visitor to devices
     */
    static async syncToDevice(visitorId) {
        try {
            await (0, HikCentralClient_1.hikRequest)('/artemis/api/visitor/v1/auth/reapplication', {
                method: 'POST',
                body: JSON.stringify({
                    visitorId,
                }),
            });
            console.log(`[VisitorService] Visitor ${visitorId} synced to devices`);
        }
        catch (error) {
            console.warn(`[VisitorService] Sync warning: ${error.message}`);
        }
    }
    /**
     * Format date for HikCentral API
     */
    static formatDateTime(date) {
        return date.toISOString().replace(/\.\d{3}Z$/, '');
    }
}
exports.VisitorService = VisitorService;
