"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AccessLogsController_1 = require("../controllers/AccessLogsController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
const accessLogsController = new AccessLogsController_1.AccessLogsController();
router.get('/', auth_1.authMiddleware, accessLogsController.getAccessLogs);
exports.default = router;
