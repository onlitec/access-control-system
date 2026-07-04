"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HikCentralResourceService = void 0;
const HikCentralClient_1 = require("./HikCentralClient");
/**
 * Cache TTL configuration per resource type (in milliseconds)
 */
const CACHE_TTL = {
    ORGANIZATIONS: 5 * 60 * 1000, // 5 minutes
    PRIVILEGE_GROUPS: 15 * 60 * 1000, // 15 minutes
    REGIONS: 10 * 60 * 1000, // 10 minutes
    DOORS: 10 * 60 * 1000, // 10 minutes
    FLOORS: 60 * 60 * 1000, // 1 hour
    VISITOR_GROUPS: 5 * 60 * 1000, // 5 minutes
    PERSON_CUSTOM_FIELDS: 30 * 60 * 1000, // 30 minutes
    VISITOR_CUSTOM_FIELDS: 30 * 60 * 1000, // 30 minutes
};
/**
 * HikCentral Resource Service with intelligent caching
 * Provides data-driven UI population for all frontend applications
 */
class HikCentralResourceService {
    /**
     * Get cached data or fetch from HikCentral
     */
    static async getWithCache(cacheKey, fetcher) {
        const cached = this.cache.get(cacheKey);
        const now = Date.now();
        if (cached && (now - cached.timestamp) < cached.ttl) {
            console.log(`[ResourceService] Cache HIT for ${cacheKey}`);
            return cached.data;
        }
        console.log(`[ResourceService] Cache MISS for ${cacheKey}, fetching...`);
        const data = await fetcher();
        this.cache.set(cacheKey, {
            data,
            timestamp: now,
            ttl: CACHE_TTL[cacheKey] || 5 * 60 * 1000,
        });
        return data;
    }
    /**
     * Clear cache for specific resource type or all
     */
    static clearCache(entityType) {
        if (entityType) {
            this.cache.delete(entityType);
            console.log(`[ResourceService] Cache cleared for ${entityType}`);
        }
        else {
            this.cache.clear();
            console.log('[ResourceService] All cache cleared');
        }
    }
    // ============================================================
    // ORGANIZATIONS (Departments)
    // POST /artemis/api/resource/v1/org/orgList
    // ============================================================
    static async getOrganizations(pageNo = 1, pageSize = 500) {
        return this.getWithCache('ORGANIZATIONS', async () => {
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/resource/v1/org/orgList', {
                method: 'POST',
                body: JSON.stringify({ pageNo, pageSize }),
            });
            const list = result?.data?.list || [];
            return list.map((org) => ({
                orgIndexCode: org.orgIndexCode,
                orgName: org.orgName,
                parentOrgIndexCode: org.parentOrgIndexCode,
                orgCode: org.orgCode,
                description: org.description || '',
            }));
        });
    }
    /**
     * Get organizations as tree structure
     */
    static async getOrganizationsTree() {
        const orgs = await this.getOrganizations();
        // Return flat list - frontend can build tree if needed
        return orgs;
    }
    // ============================================================
    // PRIVILEGE GROUPS (Access Levels)
    // POST /artemis/api/acs/v1/privilege/group
    // ============================================================
    static async getPrivilegeGroups(type = 1, pageNo = 1, pageSize = 500) {
        const cacheKey = `PRIVILEGE_GROUPS_${type}`;
        return this.getWithCache(cacheKey, async () => {
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/acs/v1/privilege/group', {
                method: 'POST',
                body: JSON.stringify({
                    privilegeGroupType: type, // 1=general, 2=visitor
                    pageNo,
                    pageSize
                }),
            });
            const list = result?.data?.list || [];
            return list.map((group) => ({
                privilegeGroupId: group.privilegeGroupId || group.id,
                privilegeGroupName: group.privilegeGroupName || group.name,
                type: group.type || type,
                description: group.description || '',
            }));
        });
    }
    // ============================================================
    // REGIONS (Physical Areas)
    // POST /artemis/api/resource/v1/regions
    // ============================================================
    static async getRegions(pageNo = 1, pageSize = 500) {
        return this.getWithCache('REGIONS', async () => {
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/resource/v1/regions', {
                method: 'POST',
                body: JSON.stringify({ pageNo, pageSize }),
            });
            const list = result?.data?.list || [];
            return list.map((region) => ({
                indexCode: region.indexCode,
                name: region.name,
                parentIndexCode: region.parentIndexCode,
                description: region.description || '',
            }));
        });
    }
    // ============================================================
    // DOORS (Access Control Doors)
    // POST /artemis/api/resource/v1/acsDoor/acsDoorList
    // ============================================================
    static async getDoors(pageNo = 1, pageSize = 500) {
        return this.getWithCache('DOORS', async () => {
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/resource/v1/acsDoor/acsDoorList', {
                method: 'POST',
                body: JSON.stringify({ pageNo, pageSize }),
            });
            const list = result?.data?.list || [];
            return list.map((door) => ({
                doorIndexCode: door.doorIndexCode || door.indexCode,
                doorName: door.doorName || door.name,
                regionIndexCode: door.regionIndexCode,
                doorStatus: door.doorStatus || door.status,
                description: door.description || '',
            }));
        });
    }
    // ============================================================
    // FLOORS (Elevator Floors)
    // POST /artemis/api/vehicle/v1/floor/list
    // ============================================================
    static async getFloors(pageNo = 1, pageSize = 500) {
        return this.getWithCache('FLOORS', async () => {
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/vehicle/v1/floor/list', {
                method: 'POST',
                body: JSON.stringify({ pageNo, pageSize }),
            });
            const list = result?.data?.list || [];
            return list.map((floor) => ({
                floorIndexCode: floor.floorIndexCode || floor.indexCode,
                floorName: floor.floorName || floor.name,
                description: floor.description || '',
            }));
        });
    }
    // ============================================================
    // VISITOR GROUPS
    // POST /artemis/api/visitor/v1/visitorgroups
    // ============================================================
    static async getVisitorGroups(pageNo = 1, pageSize = 500) {
        return this.getWithCache('VISITOR_GROUPS', async () => {
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/visitor/v1/visitorgroups', {
                method: 'POST',
                body: JSON.stringify({ pageNo, pageSize }),
            });
            const list = result?.data?.list || [];
            return list.map((group) => ({
                visitorGroupId: group.visitorGroupId || group.id,
                visitorGroupName: group.visitorGroupName || group.name,
                description: group.description || '',
            }));
        });
    }
    // ============================================================
    // PERSON CUSTOM FIELDS
    // POST /artemis/api/resource/v1/person/customFields
    // ============================================================
    static async getPersonCustomFields() {
        return this.getWithCache('PERSON_CUSTOM_FIELDS', async () => {
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/resource/v1/person/customFields', {
                method: 'POST',
                body: JSON.stringify({ pageNo: 1, pageSize: 100 }),
            });
            const list = result?.data?.list || [];
            return list.map((field) => ({
                id: field.id || field.fieldId,
                customFieldName: field.customFieldName || field.name,
                fieldType: field.fieldType,
                required: field.required || false,
                options: field.options || undefined,
            }));
        });
    }
    // ============================================================
    // VISITOR CUSTOM FIELDS
    // POST /artemis/api/visitor/v1/visitorconfig/customfields
    // ============================================================
    static async getVisitorCustomFields() {
        return this.getWithCache('VISITOR_CUSTOM_FIELDS', async () => {
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/visitor/v1/visitorconfig/customfields', {
                method: 'POST',
                body: JSON.stringify({ pageNo: 1, pageSize: 100 }),
            });
            const list = result?.data?.list || [];
            return list.map((field) => ({
                id: field.id || field.fieldId,
                customFieldName: field.customFieldName || field.name,
                fieldType: field.fieldType,
                required: field.required || false,
                options: field.options || undefined,
            }));
        });
    }
    // ============================================================
    // BATCH OPERATIONS
    // ============================================================
    /**
     * Get all resources at once (for initial load)
     */
    static async getAllResources() {
        const [organizations, privilegeGroups, visitorPrivilegeGroups, regions, doors, floors, visitorGroups, personCustomFields, visitorCustomFields,] = await Promise.all([
            this.getOrganizations(),
            this.getPrivilegeGroups(1), // General access levels
            this.getPrivilegeGroups(2), // Visitor access levels
            this.getRegions(),
            this.getDoors(),
            this.getFloors(),
            this.getVisitorGroups(),
            this.getPersonCustomFields(),
            this.getVisitorCustomFields(),
        ]);
        return {
            organizations,
            privilegeGroups,
            visitorPrivilegeGroups,
            regions,
            doors,
            floors,
            visitorGroups,
            personCustomFields,
            visitorCustomFields,
        };
    }
}
exports.HikCentralResourceService = HikCentralResourceService;
HikCentralResourceService.cache = new Map();
