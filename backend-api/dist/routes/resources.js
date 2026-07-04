"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ResourcesController_1 = require("../controllers/ResourcesController");
const router = (0, express_1.Router)();
const controller = new ResourcesController_1.ResourcesController();
// ============ Logical Resources (Data-Driven UI) ============
// All endpoints use cached HikCentral data
// Organizations (Departments) - for person registration
router.get('/organizations', controller.getOrganizations);
// Privilege Groups (Access Levels) - for access assignment
// Query param: type (1=general, 2=visitor)
router.get('/privilege-groups', controller.getPrivilegeGroups);
// Regions (Physical Areas) - for operations panel
router.get('/regions', controller.getRegions);
// Doors - for operations panel and remote control
router.get('/doors', controller.getDoors);
// Floors (Elevator) - for elevator permissions
router.get('/floors', controller.getFloors);
// Visitor Groups - for visitor type selection
router.get('/visitor-groups', controller.getVisitorGroups);
// Custom Fields - for dynamic form generation
router.get('/custom-fields/person', controller.getPersonCustomFields);
router.get('/custom-fields/visitor', controller.getVisitorCustomFields);
// All resources at once (for initial load)
router.get('/all', controller.getAllResources);
// Cache management
router.post('/cache/refresh', controller.refreshCache);
exports.default = router;
