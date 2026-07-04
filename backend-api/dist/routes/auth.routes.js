"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const AuthController_1 = require("../controllers/AuthController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/login', AuthController_1.AuthController.login);
router.post('/refresh', AuthController_1.AuthController.refreshToken);
router.get('/me', auth_1.authMiddleware, AuthController_1.AuthController.me);
router.post('/logout', AuthController_1.AuthController.logout);
router.post('/sessions/revoke', auth_1.authMiddleware, AuthController_1.AuthController.revokeSession);
// Onboarding
router.post('/first-access/validate', AuthController_1.AuthController.firstAccessValidate);
router.post('/first-access/setup-password', AuthController_1.AuthController.firstAccessSetupPassword);
router.post('/logout', AuthController_1.AuthController.logout);
exports.default = router;
