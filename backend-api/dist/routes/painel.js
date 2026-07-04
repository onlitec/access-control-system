"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const VisitorsController_1 = require("../controllers/VisitorsController");
const ProvidersController_1 = require("../controllers/ProvidersController");
const DashboardController_1 = require("../controllers/DashboardController");
const router = (0, express_1.Router)();
const visitorsController = new VisitorsController_1.VisitorsController();
const providersController = new ProvidersController_1.ProvidersController();
const dashboardController = new DashboardController_1.DashboardController();
// We'll apply authMiddleware in index.ts when using this router
router.get('/dashboard/stats', dashboardController.getStats);
router.get('/dashboard/alerts', dashboardController.getAlerts);
router.get('/visitors', visitorsController.getVisitors);
router.get('/providers', providersController.getProviders);
exports.default = router;
