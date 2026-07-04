"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourcesController = void 0;
const HikCentralResourceService_1 = require("../services/HikCentralResourceService");
/**
 * Controller for HikCentral Logical Resources
 * Provides data-driven UI population for all frontend applications
 *
 * All endpoints use POST method with AK/SK signature authentication
 */
class ResourcesController {
    constructor() {
        /**
         * GET /api/resources/organizations
         * List all departments/organizations (tree structure)
         */
        this.getOrganizations = async (req, res) => {
            try {
                const organizations = await HikCentralResourceService_1.HikCentralResourceService.getOrganizations();
                res.json({
                    success: true,
                    data: organizations,
                    total: organizations.length
                });
            }
            catch (error) {
                console.error('[ResourcesController] getOrganizations error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/resources/privilege-groups
         * List privilege groups (access levels)
         * Query params: type (1=general, 2=visitor)
         */
        this.getPrivilegeGroups = async (req, res) => {
            try {
                const type = parseInt(req.query.type) || 1;
                const groups = await HikCentralResourceService_1.HikCentralResourceService.getPrivilegeGroups(type);
                res.json({
                    success: true,
                    data: groups,
                    total: groups.length,
                    type
                });
            }
            catch (error) {
                console.error('[ResourcesController] getPrivilegeGroups error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/resources/regions
         * List physical areas (regions)
         */
        this.getRegions = async (req, res) => {
            try {
                const regions = await HikCentralResourceService_1.HikCentralResourceService.getRegions();
                res.json({
                    success: true,
                    data: regions,
                    total: regions.length
                });
            }
            catch (error) {
                console.error('[ResourcesController] getRegions error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/resources/doors
         * List all doors with status
         */
        this.getDoors = async (req, res) => {
            try {
                const doors = await HikCentralResourceService_1.HikCentralResourceService.getDoors();
                res.json({
                    success: true,
                    data: doors,
                    total: doors.length
                });
            }
            catch (error) {
                console.error('[ResourcesController] getDoors error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/resources/floors
         * List elevator floors
         */
        this.getFloors = async (req, res) => {
            try {
                const floors = await HikCentralResourceService_1.HikCentralResourceService.getFloors();
                res.json({
                    success: true,
                    data: floors,
                    total: floors.length
                });
            }
            catch (error) {
                console.error('[ResourcesController] getFloors error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/resources/visitor-groups
         * List visitor groups
         */
        this.getVisitorGroups = async (req, res) => {
            try {
                const groups = await HikCentralResourceService_1.HikCentralResourceService.getVisitorGroups();
                res.json({
                    success: true,
                    data: groups,
                    total: groups.length
                });
            }
            catch (error) {
                console.error('[ResourcesController] getVisitorGroups error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/resources/custom-fields/person
         * List person custom fields (dynamic form fields)
         */
        this.getPersonCustomFields = async (req, res) => {
            try {
                const fields = await HikCentralResourceService_1.HikCentralResourceService.getPersonCustomFields();
                res.json({
                    success: true,
                    data: fields,
                    total: fields.length
                });
            }
            catch (error) {
                console.error('[ResourcesController] getPersonCustomFields error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/resources/custom-fields/visitor
         * List visitor custom fields (dynamic form fields)
         */
        this.getVisitorCustomFields = async (req, res) => {
            try {
                const fields = await HikCentralResourceService_1.HikCentralResourceService.getVisitorCustomFields();
                res.json({
                    success: true,
                    data: fields,
                    total: fields.length
                });
            }
            catch (error) {
                console.error('[ResourcesController] getVisitorCustomFields error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * GET /api/resources/all
         * Get all resources at once (for initial load)
         */
        this.getAllResources = async (req, res) => {
            try {
                const resources = await HikCentralResourceService_1.HikCentralResourceService.getAllResources();
                res.json({
                    success: true,
                    data: resources
                });
            }
            catch (error) {
                console.error('[ResourcesController] getAllResources error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
        /**
         * POST /api/resources/cache/refresh
         * Clear resource cache
         * Body: { entityType?: string }
         */
        this.refreshCache = async (req, res) => {
            try {
                const { entityType } = req.body;
                HikCentralResourceService_1.HikCentralResourceService.clearCache(entityType);
                res.json({
                    success: true,
                    message: `Cache cleared: ${entityType || 'all'}`
                });
            }
            catch (error) {
                console.error('[ResourcesController] refreshCache error:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        };
    }
}
exports.ResourcesController = ResourcesController;
