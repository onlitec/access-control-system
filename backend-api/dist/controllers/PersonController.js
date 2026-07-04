"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonController = void 0;
const BaseController_1 = require("./BaseController");
const db_1 = require("../db");
const HikCentralService_1 = require("../services/HikCentralService");
const EntityMappingService_1 = require("../services/EntityMappingService");
const hikConstants_1 = require("../config/hikConstants");
const unifiedConfig_1 = require("../config/unifiedConfig");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class PersonController extends BaseController_1.BaseController {
    constructor() {
        super(...arguments);
        /**
         * Lista Moradores (Residents) combinando dados do HikCentral e DB Local
         */
        this.getResidents = async (req, res) => {
            try {
                const { page = 1, limit = 20, search = '' } = req.query;
                const pageNum = parseInt(page);
                const limitNum = parseInt(limit);
                const residentOrgCodes = await EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/residents');
                try {
                    const hikPromise = HikCentralService_1.HikCentralService.getPersonList({
                        orgIndexCodes: residentOrgCodes,
                        pageNo: 1,
                        pageSize: 500,
                    });
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('HikCentral timeout')), 10000));
                    const hikResult = await Promise.race([hikPromise, timeoutPromise]);
                    const hikPersons = hikResult?.data?.list || [];
                    if (hikPersons.length > 0) {
                        const allPersons = hikPersons.map((p) => {
                            const orgCode = String(p.orgIndexCode || '');
                            const role = (0, hikConstants_1.resolveRoleFromOrg)(orgCode);
                            const orgName = hikConstants_1.HIK_ORG_NAMES[orgCode] || p.orgName || 'DESCONHECIDO';
                            return {
                                id: p.personId || p.indexCode,
                                firstName: p.personGivenName || p.personName || '',
                                lastName: p.personFamilyName || '',
                                phone: p.phoneNo || p.phone || null,
                                email: p.email || null,
                                orgIndexCode: orgCode,
                                hikPersonId: p.personId || p.indexCode || null,
                                orgName,
                                role,
                                gender: p.gender || null,
                                certificateNo: p.certificateNo || null,
                                personPhoto: p.personPhoto?.picUri || p.personPhoto?.uri || null,
                                createdAt: p.createTime || new Date().toISOString(),
                                updatedAt: p.updateTime || new Date().toISOString(),
                            };
                        });
                        const residents = allPersons.filter((r) => residentOrgCodes.includes(r.orgIndexCode));
                        let filtered = residents;
                        if (search) {
                            const searchLower = search.toLowerCase();
                            filtered = residents.filter((r) => (r.firstName + ' ' + r.lastName).toLowerCase().includes(searchLower) ||
                                r.phone?.toLowerCase().includes(searchLower) ||
                                r.email?.toLowerCase().includes(searchLower));
                        }
                        const localPhotos = {};
                        for (const r of residents) {
                            try {
                                const existing = await db_1.prisma.person.findFirst({ where: { hikPersonId: r.hikPersonId } });
                                const upserted = await db_1.prisma.person.upsert({
                                    where: { hikPersonId: r.hikPersonId || `temp-${r.id}` },
                                    update: {
                                        firstName: r.firstName,
                                        lastName: r.lastName,
                                        phone: r.phone,
                                        email: r.email,
                                        orgIndexCode: r.orgIndexCode,
                                    },
                                    create: {
                                        firstName: r.firstName,
                                        lastName: r.lastName,
                                        phone: r.phone,
                                        email: r.email,
                                        orgIndexCode: r.orgIndexCode,
                                        hikPersonId: r.hikPersonId,
                                    },
                                });
                                localPhotos[r.hikPersonId || ''] = existing?.photoUrl || upserted.photoUrl || null;
                            }
                            catch (e) { }
                        }
                        return this.success(res, filtered.map((r) => ({
                            id: r.id,
                            full_name: `${r.firstName} ${r.lastName}`.trim() || '-',
                            cpf: r.certificateNo || '',
                            phone: r.phone || null,
                            email: r.email || null,
                            unit_number: r.orgIndexCode || '',
                            block: null,
                            tower: r.orgName || null,
                            photo_url: localPhotos[r.hikPersonId || ''] || (r.hikPersonId ? `/api/hikcentral/person-photo/${r.hikPersonId}${r.personPhoto ? `?picUri=${encodeURIComponent(r.personPhoto)}` : ''}` : null),
                            is_owner: true,
                            hikcentral_person_id: r.hikPersonId || null,
                            notes: `HikCentral | Depto: ${r.orgName} | Perfil: ${r.role}`,
                            created_at: r.createdAt,
                            updated_at: r.updatedAt,
                        })));
                    }
                }
                catch (hikError) {
                    console.log('Fallback to local DB for residents:', hikError.message);
                }
                const skip = (pageNum - 1) * limitNum;
                const where = search ? {
                    OR: [
                        { firstName: { contains: search, mode: 'insensitive' } },
                        { lastName: { contains: search, mode: 'insensitive' } },
                    ]
                } : {};
                const data = await db_1.prisma.person.findMany({
                    where,
                    skip,
                    take: limitNum,
                    orderBy: { createdAt: 'desc' }
                });
                return this.success(res, data.map((p) => ({
                    id: p.id,
                    full_name: `${p.firstName} ${p.lastName}`.trim() || '-',
                    cpf: '',
                    phone: p.phone || null,
                    email: p.email || null,
                    unit_number: p.orgIndexCode || '',
                    block: null,
                    tower: hikConstants_1.HIK_ORG_NAMES[p.orgIndexCode] || null,
                    photo_url: p.photoUrl || (p.hikPersonId ? `/api/hikcentral/person-photo/${p.hikPersonId}` : null),
                    is_owner: true,
                    hikcentral_person_id: p.hikPersonId || null,
                    notes: null,
                    created_at: p.createdAt,
                    updated_at: p.updatedAt,
                })));
            }
            catch (error) {
                console.error('[PersonController] getResidents Error:', error);
                return this.error(res, error.message);
            }
        };
        this.getResidentSelect = async (req, res) => {
            try {
                const data = await db_1.prisma.person.findMany({
                    select: { id: true, firstName: true, lastName: true, orgIndexCode: true },
                    orderBy: { firstName: 'asc' }
                });
                return this.success(res, data.map(p => ({
                    id: p.id,
                    full_name: `${p.firstName} ${p.lastName}`,
                    unit_number: p.orgIndexCode,
                    block: null,
                    tower: null,
                })));
            }
            catch (error) {
                return this.error(res, error.message);
            }
        };
        this.createResident = async (req, res) => {
            try {
                const body = { ...req.body };
                const prismaData = {};
                if (body.full_name) {
                    const parts = body.full_name.trim().split(' ');
                    prismaData.firstName = parts[0] || '';
                    prismaData.lastName = parts.slice(1).join(' ') || '';
                }
                else {
                    prismaData.firstName = body.firstName || '';
                    prismaData.lastName = body.lastName || '';
                }
                prismaData.phone = body.phone || null;
                prismaData.email = body.email || null;
                prismaData.orgIndexCode = body.orgIndexCode || '2'; // Default MORADORES (HikCentral Code 2)
                let hikPersonId = body.hikcentral_person_id || null;
                if (!hikPersonId) {
                    const hikResponse = await HikCentralService_1.HikCentralService.addPerson({
                        personGivenName: prismaData.firstName,
                        personFamilyName: prismaData.lastName,
                        orgIndexCode: prismaData.orgIndexCode,
                        phoneNo: prismaData.phone || undefined,
                        email: prismaData.email || undefined,
                        certificateNo: body.cpf || undefined,
                        certificateType: body.cpf ? 1 : undefined,
                        personProperties: body.tower ? [{ propertyName: "Torre", propertyValue: body.tower }] : []
                    });
                    hikPersonId = hikResponse?.data?.personId;
                }
                if (hikPersonId && body.accessLevels && Array.isArray(body.accessLevels) && body.accessLevels.length > 0) {
                    await HikCentralService_1.HikCentralService.authorizePerson(hikPersonId, body.accessLevels);
                }
                if (hikPersonId && (body.photo || body.photoBase64)) {
                    const b64 = body.photoBase64 || body.photo;
                    const cleanPhotoBase64 = b64.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');
                    try {
                        await HikCentralService_1.HikCentralService.addPersonFace(hikPersonId, cleanPhotoBase64);
                    }
                    catch (faceErr) {
                        console.error(`[HikCentral] Error syncing photo for room ${hikPersonId}:`, faceErr.message);
                    }
                }
                prismaData.hikPersonId = hikPersonId;
                const person = await db_1.prisma.person.create({ data: prismaData });
                const onboardingToken = jsonwebtoken_1.default.sign({ personId: person.id, hikPersonId: person.hikPersonId, type: 'onboarding' }, unifiedConfig_1.config.JWT_SECRET, { expiresIn: '48h' });
                const onboardingUrl = `https://172.20.120.41:8443/login/first-access?token=${onboardingToken}`;
                return this.success(res, {
                    id: person.id,
                    full_name: `${person.firstName} ${person.lastName}`.trim(),
                    hikcentral_person_id: person.hikPersonId,
                    onboarding_url: onboardingUrl,
                    data: person
                });
            }
            catch (error) {
                console.error('[PersonController] createResident Error:', error);
                return this.error(res, error.message);
            }
        };
        this.updateResident = async (req, res) => {
            try {
                const { id } = req.params;
                const body = { ...req.body };
                const existing = await db_1.prisma.person.findFirst({
                    where: {
                        OR: [
                            { id },
                            { hikPersonId: id }
                        ]
                    }
                });
                if (!existing)
                    return this.error(res, 'Morador não encontrado', 404);
                const parts = body.full_name?.trim().split(' ') || [];
                const updateData = {
                    firstName: parts[0] || existing.firstName,
                    lastName: parts.slice(1).join(' ') || existing.lastName,
                    phone: body.phone !== undefined ? body.phone : existing.phone,
                    email: body.email !== undefined ? body.email : existing.email,
                    photoUrl: body.photo_url !== undefined ? body.photo_url : existing.photoUrl,
                    unit_number: body.unit_number !== undefined ? body.unit_number : existing.unit_number
                };
                if (existing.hikPersonId) {
                    try {
                        await HikCentralService_1.HikCentralService.updatePerson({
                            personId: existing.hikPersonId,
                            personGivenName: updateData.firstName,
                            personFamilyName: updateData.lastName,
                            phoneNo: updateData.phone || undefined,
                            email: updateData.email || undefined,
                            certificateNo: body.cpf || undefined,
                            certificateType: body.cpf ? 1 : undefined,
                            personProperties: body.tower ? [{ propertyName: "Torre", propertyValue: body.tower }] : []
                        });
                        if (body.accessLevels && Array.isArray(body.accessLevels)) {
                            await HikCentralService_1.HikCentralService.authorizePerson(existing.hikPersonId, body.accessLevels);
                        }
                    }
                    catch (hikErr) {
                        console.error('[HikCentral] Error updating on patch:', hikErr.message);
                    }
                }
                const person = await db_1.prisma.person.update({
                    where: { id: existing.id },
                    data: updateData
                });
                return this.success(res, {
                    id: person.id,
                    full_name: `${person.firstName} ${person.lastName}`.trim(),
                    phone: person.phone || null,
                    email: person.email || null,
                    unit_number: person.orgIndexCode || '',
                    photo_url: person.photoUrl || null,
                    hikcentral_person_id: person.hikPersonId || null,
                    updated_at: person.updatedAt,
                });
            }
            catch (error) {
                console.error('[PersonController] updateResident Error:', error);
                return this.error(res, error.message);
            }
        };
        this.deleteResident = async (req, res) => {
            try {
                const { id } = req.params;
                try {
                    await db_1.prisma.person.delete({ where: { id } });
                }
                catch (uuidErr) {
                    if (uuidErr?.code === 'P2025' || uuidErr?.code === 'P2023') {
                        const existing = await db_1.prisma.person.findFirst({ where: { hikPersonId: id } });
                        if (!existing)
                            return this.error(res, 'Morador não encontrado', 404);
                        await db_1.prisma.person.delete({ where: { id: existing.id } });
                    }
                    else {
                        throw uuidErr;
                    }
                }
                return res.status(204).send();
            }
            catch (error) {
                return this.error(res, error.message);
            }
        };
        /**
         * Lista Staff combinando dados do HikCentral e DB Local
         */
        this.getStaff = async (req, res) => {
            try {
                const { search = '' } = req.query;
                const staffOrgCodes = await EntityMappingService_1.EntityMappingService.resolveOrgCodesWithFallback('/painel/staff');
                try {
                    const hikStaffPromise = HikCentralService_1.HikCentralService.getPersonList({
                        orgIndexCodes: staffOrgCodes,
                        pageNo: 1,
                        pageSize: 500,
                    });
                    const hikStaffTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('HikCentral timeout')), 10000));
                    const hikResult = await Promise.race([hikStaffPromise, hikStaffTimeout]);
                    const hikPersons = hikResult?.data?.list || [];
                    if (hikPersons.length > 0) {
                        const staff = hikPersons
                            .filter((p) => staffOrgCodes.includes(String(p.orgIndexCode)))
                            .map((p) => ({
                            id: p.personId || p.indexCode,
                            full_name: `${p.personGivenName || p.personName || ''} ${p.personFamilyName || ''}`.trim() || '-',
                            first_name: p.personGivenName || p.personName || '',
                            last_name: p.personFamilyName || '',
                            phone: p.phoneNo || p.phone || null,
                            email: p.email || null,
                            department: p.orgName || hikConstants_1.HIK_ORG_NAMES[String(p.orgIndexCode)],
                            role: (0, hikConstants_1.resolveRoleFromOrg)(String(p.orgIndexCode)),
                            hikPersonId: p.personId || p.indexCode || null,
                            photo_url: p.personPhoto?.picUri ? `/api/hikcentral/person-photo/${p.personId || p.indexCode}?picUri=${encodeURIComponent(p.personPhoto.picUri)}` : null,
                            created_at: p.createTime || new Date().toISOString()
                        }));
                        if (search) {
                            const searchLower = search.toLowerCase();
                            return this.success(res, staff.filter((p) => p.full_name.toLowerCase().includes(searchLower) ||
                                p.phone?.toLowerCase().includes(searchLower) ||
                                p.email?.toLowerCase().includes(searchLower)));
                        }
                        return this.success(res, staff);
                    }
                }
                catch (hikError) {
                    console.error('Staff HikCentral Error:', hikError.message);
                }
                const staffLocal = await db_1.prisma.person.findMany({
                    where: {
                        orgIndexCode: { in: staffOrgCodes },
                        OR: search ? [
                            { firstName: { contains: search, mode: 'insensitive' } },
                            { lastName: { contains: search, mode: 'insensitive' } },
                            { phone: { contains: search, mode: 'insensitive' } },
                            { email: { contains: search, mode: 'insensitive' } },
                        ] : undefined
                    },
                    orderBy: { createdAt: 'desc' }
                });
                return this.success(res, staffLocal.map(r => ({
                    id: r.id,
                    full_name: `${r.firstName} ${r.lastName}`.trim(),
                    phone: r.phone,
                    email: r.email,
                    department: hikConstants_1.HIK_ORG_NAMES[r.orgIndexCode] || 'DESCONHECIDO',
                    role: (0, hikConstants_1.resolveRoleFromOrg)(r.orgIndexCode),
                    hikPersonId: r.hikPersonId,
                    photo_url: r.photoUrl || (r.hikPersonId ? `/api/hikcentral/person-photo/${r.hikPersonId}` : null),
                    updatedAt: r.updatedAt
                })));
            }
            catch (error) {
                console.error('[PersonController] getStaff Error:', error);
                return this.error(res, error.message);
            }
        };
        this.getRecoveryLink = async (req, res) => {
            try {
                const { id } = req.params;
                let person = await db_1.prisma.person.findUnique({ where: { id } });
                if (!person) {
                    person = await db_1.prisma.person.findFirst({ where: { hikPersonId: id } });
                }
                if (!person)
                    return this.error(res, 'Morador não encontrado no banco local.', 404);
                if (!person.email)
                    return this.error(res, 'Este morador não possui e-mail cadastrado.', 400);
                const onboardingToken = jsonwebtoken_1.default.sign({ personId: person.id, hikPersonId: person.hikPersonId, type: 'onboarding' }, unifiedConfig_1.config.JWT_SECRET, { expiresIn: '48h' });
                const onboardingUrl = `https://172.20.120.41:8443/login/first-access?token=${onboardingToken}`;
                return this.success(res, {
                    message: 'Link de acesso gerado com sucesso.',
                    onboarding_url: onboardingUrl
                });
            }
            catch (error) {
                console.error('[PersonController] getRecoveryLink Error:', error);
                return this.error(res, error.message);
            }
        };
        this.createStaff = async (req, res) => {
            try {
                const body = { ...req.body };
                const prismaData = {};
                if (body.full_name) {
                    const parts = body.full_name.trim().split(' ');
                    prismaData.firstName = parts[0] || '';
                    prismaData.lastName = parts.slice(1).join(' ') || '';
                }
                prismaData.phone = body.phone || null;
                prismaData.email = body.email || null;
                prismaData.orgIndexCode = body.orgIndexCode || '4';
                let hikPersonId = body.hikcentral_person_id || null;
                if (!hikPersonId) {
                    const hikResponse = await HikCentralService_1.HikCentralService.addPerson({
                        personGivenName: prismaData.firstName,
                        personFamilyName: prismaData.lastName,
                        orgIndexCode: prismaData.orgIndexCode,
                        phoneNo: prismaData.phone || undefined,
                        email: prismaData.email || undefined,
                    });
                    hikPersonId = hikResponse?.data?.personId;
                }
                prismaData.hikPersonId = hikPersonId;
                const person = await db_1.prisma.person.create({ data: prismaData });
                return this.success(res, person);
            }
            catch (error) {
                console.error('[PersonController] createStaff Error:', error);
                return this.error(res, error.message);
            }
        };
        this.syncPersons = async (req, res) => {
            try {
                const summary = {};
                const errors = [];
                const SYSTEM_ORG_CODES = ['1'];
                const orgCodesToSync = Object.entries(hikConstants_1.HIK_ORG_ROLE_MAP)
                    .filter(([code]) => !SYSTEM_ORG_CODES.includes(code));
                for (const [orgCode, role] of orgCodesToSync) {
                    const orgName = hikConstants_1.HIK_ORG_NAMES[orgCode] || orgCode;
                    try {
                        const result = await HikCentralService_1.HikCentralService.getPersonList({
                            orgIndexCode: orgCode,
                            pageNo: 1,
                            pageSize: 100,
                        });
                        const persons = result?.data?.list || [];
                        summary[orgName] = { role, count: persons.length, names: [] };
                        for (const p of persons) {
                            const fullName = `${p.personGivenName || p.personName || ''} ${p.personFamilyName || ''}`.trim();
                            summary[orgName].names.push(fullName);
                            const hikPersonId = p.personId || p.indexCode || null;
                            if (!hikPersonId)
                                continue;
                            try {
                                await db_1.prisma.person.upsert({
                                    where: { hikPersonId },
                                    update: {
                                        firstName: p.personGivenName || p.personName || '',
                                        lastName: p.personFamilyName || '',
                                        phone: p.phoneNo || p.phone || null,
                                        email: p.email || null,
                                        orgIndexCode: orgCode,
                                    },
                                    create: {
                                        firstName: p.personGivenName || p.personName || '',
                                        lastName: p.personFamilyName || '',
                                        phone: p.phoneNo || p.phone || null,
                                        email: p.email || null,
                                        orgIndexCode: orgCode,
                                        hikPersonId,
                                    },
                                });
                            }
                            catch (upsertErr) {
                                errors.push(`Upsert falhou para ${fullName}: ${upsertErr.message}`);
                            }
                        }
                    }
                    catch (deptErr) {
                        errors.push(`Depto ${orgName} (${orgCode}): ${deptErr.message}`);
                    }
                }
                const totalSynced = Object.values(summary).reduce((acc, v) => acc + v.count, 0);
                return this.success(res, { totalSynced, summary, errors: errors.length > 0 ? errors : undefined });
            }
            catch (error) {
                console.error('[PersonController] syncPersons Error:', error);
                return this.error(res, error.message);
            }
        };
    }
}
exports.PersonController = PersonController;
