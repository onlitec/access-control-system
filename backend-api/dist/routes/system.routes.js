"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const SystemController_1 = require("../controllers/SystemController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
const systemController = new SystemController_1.SystemController();
// Public route
router.get('/health', systemController.getHealth);
// Protected routes
router.use(auth_1.authMiddleware);
router.get('/status', systemController.getStatus);
router.get('/devices/status', systemController.getDevicesStatus);
exports.default = router;
