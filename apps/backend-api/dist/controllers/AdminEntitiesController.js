"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminEntitiesController = void 0;
const HikCentralService_1 = require("../services/HikCentralService");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
/**
 * Controller para endpoints de administração de entidades HikCentral
 * Usado na página /admin/settings para popular tree views e selects
 */
class AdminEntitiesController {
    constructor() {
        /**
         * Standalone (sem HikCentral configurado): responde lista vazia e retorna
         * true — nenhum endpoint deste controller deve chamar a API externa.
         */
        this.standaloneEmpty = async (res) => {
            if (await HikCentralService_1.HikCentralService.isConfigured())
                return false;
            res.json({ success: true, data: [], total: 0 });
            return true;
        };
        /**
         * GET /api/admin/entities/organizations
         * Lista departamentos/organizações do HikCentral (tree view)
         */
        this.getOrganizations = async (req, res) => {
            try {
                if (await this.standaloneEmpty(res))
                    return;
                const result = await HikCentralService_1.HikCentralService.getOrgListCached(1, 500);
                const list = result?.data?.list || [];
                // Monta estrutura hierárquica
                const orgs = list.map((org) => ({
                    id: org.orgIndexCode,
                    name: org.orgName,
                    parentOrgIndexCode: org.parentOrgIndexCode,
                    orgCode: org.orgCode,
                    description: org.description || '',
                }));
                res.json({ success: true, data: orgs, total: orgs.length });
            }
            catch (error) {
                console.error('[AdminEntities] getOrganizations error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/admin/entities/areas
         * Lista áreas físicas (regions) do HikCentral (tree view)
         */
        this.getAreas = async (req, res) => {
            try {
                if (await this.standaloneEmpty(res))
                    return;
                const result = await HikCentralService_1.HikCentralService.getRegionsList(1, 500);
                const list = result?.data?.list || [];
                const areas = list.map((area) => ({
                    id: area.indexCode,
                    name: area.name,
                    parentIndexCode: area.parentIndexCode,
                    description: area.description || '',
                }));
                res.json({ success: true, data: areas, total: areas.length });
            }
            catch (error) {
                console.error('[AdminEntities] getAreas error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/admin/entities/access-levels
         * Lista níveis de acesso / privilege groups
         */
        this.getAccessLevels = async (req, res) => {
            try {
                if (await this.standaloneEmpty(res))
                    return;
                const type = parseInt(req.query.type) || 1; // 1=geral, 2=visitantes
                const result = await HikCentralService_1.HikCentralService.getPrivilegeGroups(type, 1, 500);
                const list = result?.data?.list || [];
                const levels = list.map((level) => ({
                    id: level.privilegeGroupId || level.id,
                    name: level.privilegeGroupName || level.name,
                    type: level.type,
                    description: level.description || '',
                }));
                res.json({ success: true, data: levels, total: levels.length });
            }
            catch (error) {
                console.error('[AdminEntities] getAccessLevels error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/admin/entities/custom-fields
         * Lista campos customizados (cargos, posições, etc)
         */
        this.getCustomFields = async (req, res) => {
            try {
                if (await this.standaloneEmpty(res))
                    return;
                const result = await HikCentralService_1.HikCentralService.getCustomFieldsCached();
                const list = result?.data?.list || [];
                const fields = list.map((field) => ({
                    id: field.id || field.fieldId,
                    name: field.customFieldName || field.name,
                    type: field.fieldType,
                    required: field.required || false,
                }));
                res.json({ success: true, data: fields, total: fields.length });
            }
            catch (error) {
                console.error('[AdminEntities] getCustomFields error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/admin/entities/floors
         * Lista pisos/andares
         */
        this.getFloors = async (req, res) => {
            try {
                if (await this.standaloneEmpty(res))
                    return;
                const result = await HikCentralService_1.HikCentralService.getFloorsList(1, 500);
                const list = result?.data?.list || [];
                const floors = list.map((floor) => ({
                    id: floor.floorIndexCode || floor.id,
                    name: floor.floorName || floor.name,
                    description: floor.description || '',
                }));
                res.json({ success: true, data: floors, total: floors.length });
            }
            catch (error) {
                console.error('[AdminEntities] getFloors error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/admin/entities/visitor-groups
         * Lista grupos de visitantes
         */
        this.getVisitorGroups = async (req, res) => {
            try {
                if (await this.standaloneEmpty(res))
                    return;
                const result = await HikCentralService_1.HikCentralService.getVisitorGroups(1, 500);
                const list = result?.data?.list || [];
                const groups = list.map((group) => ({
                    id: group.visitorGroupId || group.id,
                    name: group.visitorGroupName || group.name,
                    description: group.description || '',
                }));
                res.json({ success: true, data: groups, total: groups.length });
            }
            catch (error) {
                console.error('[AdminEntities] getVisitorGroups error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * POST /api/admin/cache/refresh
         * Limpa cache de entidades
         */
        this.refreshCache = async (req, res) => {
            try {
                const { entityType } = req.body;
                HikCentralService_1.HikCentralService.clearCache(entityType);
                res.json({ success: true, message: `Cache cleared: ${entityType || 'all'}` });
            }
            catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        };
    }
}
exports.AdminEntitiesController = AdminEntitiesController;
