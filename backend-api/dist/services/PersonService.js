"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonService = void 0;
const HikCentralClient_1 = require("./HikCentralClient");
const BiometryService_1 = require("./BiometryService");
class PersonService {
    /**
     * Create person with face-only authentication
     *
     * Flow:
     * 1. Validate face quality
     * 2. Create person in HikCentral
     * 3. Assign privilege group
     * 4. Sync to devices
     * 5. Save to local DB
     */
    static async createPerson(data) {
        try {
            // 1. Validate face quality
            console.log('[PersonService] Validating face...');
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
                personGivenName: data.personGivenName,
                personFamilyName: data.personFamilyName,
                orgIndexCode: data.orgIndexCode,
                faces: [{ faceData: base64Face }],
            };
            if (data.phoneNo)
                payload.phoneNo = data.phoneNo;
            if (data.email)
                payload.email = data.email;
            if (data.certificateNo) {
                payload.certificateNo = data.certificateNo;
                payload.certificateType = data.certificateType || 111;
            }
            if (data.customFields && data.customFields.length > 0) {
                payload.personCustomList = data.customFields.map(f => ({
                    customFieldName: f.fieldName,
                    customFieldValue: f.fieldValue,
                }));
            }
            // 4. Create person in HikCentral
            console.log('[PersonService] Creating person in HikCentral...');
            const createResult = await (0, HikCentralClient_1.hikRequest)('/artemis/api/resource/v1/person/single/add', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const hikPersonId = createResult?.data?.personId;
            if (!hikPersonId) {
                return {
                    success: false,
                    error: 'Failed to get personId from HikCentral',
                    errorCode: 'NO_PERSON_ID',
                };
            }
            console.log(`[PersonService] Person created in HikCentral: ${hikPersonId}`);
            // 5. Assign privilege group
            console.log(`[PersonService] Assigning privilege group ${data.privilegeGroupId}...`);
            await this.assignPrivilegeGroup(hikPersonId, data.privilegeGroupId);
            // 6. Sync to devices
            console.log('[PersonService] Syncing to devices...');
            await this.syncToDevice(hikPersonId);
            // 7. Save to local database
            const localPerson = await HikCentralClient_1.prisma.person.create({
                data: {
                    firstName: data.personGivenName,
                    lastName: data.personFamilyName,
                    orgIndexCode: data.orgIndexCode,
                    hikPersonId: hikPersonId,
                    phone: data.phoneNo,
                    email: data.email,
                    cpf: data.certificateNo,
                    photoUrl: data.faceData.startsWith('data:') ? data.faceData : `data:image/jpeg;base64,${base64Face}`,
                    privilegeGroupId: data.privilegeGroupId,
                },
            });
            console.log(`[PersonService] Person saved to local DB: ${localPerson.id}`);
            return {
                success: true,
                personId: localPerson.id,
                hikPersonId: hikPersonId,
            };
        }
        catch (error) {
            console.error('[PersonService] Create person error:', error);
            return {
                success: false,
                error: error.message,
                errorCode: 'CREATE_ERROR',
            };
        }
    }
    /**
     * Update person (optionally update face)
     */
    static async updatePerson(data) {
        try {
            // Get existing person
            const existingPerson = await HikCentralClient_1.prisma.person.findFirst({
                where: {
                    OR: [
                        { id: data.personId },
                        { hikPersonId: data.personId }
                    ]
                },
            });
            if (!existingPerson) {
                return {
                    success: false,
                    error: 'Person not found',
                    errorCode: 'NOT_FOUND',
                };
            }
            const hikPersonId = existingPerson.hikPersonId;
            if (!hikPersonId) {
                return {
                    success: false,
                    error: 'Person does not have HikCentral ID',
                    errorCode: 'NO_HIK_ID',
                };
            }
            // Update face if provided
            if (data.faceData) {
                console.log('[PersonService] Updating face...');
                const faceResult = await BiometryService_1.BiometryService.updatePersonFace(hikPersonId, data.faceData);
                if (!faceResult.success) {
                    return {
                        success: false,
                        error: faceResult.message,
                        errorCode: 'FACE_UPDATE_ERROR',
                    };
                }
            }
            // Update person data in HikCentral
            const payload = {
                personId: hikPersonId,
                indexCode: hikPersonId,
            };
            if (data.personGivenName)
                payload.personGivenName = data.personGivenName;
            if (data.personFamilyName)
                payload.personFamilyName = data.personFamilyName;
            if (data.orgIndexCode)
                payload.orgIndexCode = data.orgIndexCode;
            if (data.phoneNo)
                payload.phoneNo = data.phoneNo;
            if (data.email)
                payload.email = data.email;
            if (data.certificateNo) {
                payload.certificateNo = data.certificateNo;
                payload.certificateType = data.certificateType || 111;
            }
            if (data.customFields && data.customFields.length > 0) {
                payload.personCustomList = data.customFields.map(f => ({
                    customFieldName: f.fieldName,
                    customFieldValue: f.fieldValue,
                }));
            }
            console.log('[PersonService] Updating person in HikCentral...');
            await (0, HikCentralClient_1.hikRequest)('/artemis/api/resource/v1/person/single/update', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            // Update privilege group if changed
            if (data.privilegeGroupId) {
                console.log(`[PersonService] Updating privilege group to ${data.privilegeGroupId}...`);
                await this.assignPrivilegeGroup(hikPersonId, data.privilegeGroupId);
            }
            // Sync to devices
            await this.syncToDevice(hikPersonId);
            // Update local database
            await HikCentralClient_1.prisma.person.update({
                where: { id: existingPerson.id },
                data: {
                    firstName: data.personGivenName || existingPerson.firstName,
                    lastName: data.personFamilyName || existingPerson.lastName,
                    orgIndexCode: data.orgIndexCode || existingPerson.orgIndexCode,
                    phone: data.phoneNo || existingPerson.phone,
                    email: data.email || existingPerson.email,
                    cpf: data.certificateNo || existingPerson.cpf,
                    privilegeGroupId: data.privilegeGroupId || existingPerson.privilegeGroupId,
                    updatedAt: new Date(),
                },
            });
            console.log(`[PersonService] Person updated: ${existingPerson.id}`);
            return {
                success: true,
                personId: existingPerson.id,
                hikPersonId: hikPersonId,
            };
        }
        catch (error) {
            console.error('[PersonService] Update person error:', error);
            return {
                success: false,
                error: error.message,
                errorCode: 'UPDATE_ERROR',
            };
        }
    }
    /**
     * Assign privilege group to person
     * POST /artemis/api/acs/v1/privilege/group/single/addPersons
     */
    static async assignPrivilegeGroup(personId, privilegeGroupId) {
        await (0, HikCentralClient_1.hikRequest)('/artemis/api/acs/v1/privilege/group/single/addPersons', {
            method: 'POST',
            body: JSON.stringify({
                privilegeGroupId,
                personIds: [personId],
            }),
        });
        console.log(`[PersonService] Privilege group ${privilegeGroupId} assigned to ${personId}`);
    }
    /**
     * Sync person to devices (reapplication)
     * POST /artemis/api/visitor/v1/auth/reapplication
     */
    static async syncToDevice(personId) {
        try {
            await (0, HikCentralClient_1.hikRequest)('/artemis/api/visitor/v1/auth/reapplication', {
                method: 'POST',
                body: JSON.stringify({
                    personId,
                }),
            });
            console.log(`[PersonService] Person ${personId} synced to devices`);
        }
        catch (error) {
            console.warn(`[PersonService] Sync warning: ${error.message}`);
            // Don't fail the whole operation if sync fails
        }
    }
    /**
     * Delete person from HikCentral and local DB
     */
    static async deletePerson(personId) {
        try {
            const existingPerson = await HikCentralClient_1.prisma.person.findFirst({
                where: {
                    OR: [
                        { id: personId },
                        { hikPersonId: personId }
                    ]
                },
            });
            if (!existingPerson) {
                return {
                    success: false,
                    error: 'Person not found',
                    errorCode: 'NOT_FOUND',
                };
            }
            // Delete from HikCentral
            if (existingPerson.hikPersonId) {
                await (0, HikCentralClient_1.hikRequest)('/artemis/api/resource/v1/person/batch/delete', {
                    method: 'POST',
                    body: JSON.stringify({
                        personIds: [existingPerson.hikPersonId],
                    }),
                });
                console.log(`[PersonService] Person deleted from HikCentral: ${existingPerson.hikPersonId}`);
            }
            // Delete from local DB
            await HikCentralClient_1.prisma.person.delete({
                where: { id: existingPerson.id },
            });
            return {
                success: true,
                personId: existingPerson.id,
            };
        }
        catch (error) {
            console.error('[PersonService] Delete person error:', error);
            return {
                success: false,
                error: error.message,
                errorCode: 'DELETE_ERROR',
            };
        }
    }
}
exports.PersonService = PersonService;
