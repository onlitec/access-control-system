"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const BiometryController_1 = require("../controllers/BiometryController");
const router = (0, express_1.Router)();
const controller = new BiometryController_1.BiometryController();
// ============ Facial Biometry (Face-Only Authentication) ============
// BUSINESS RULE: This platform uses EXCLUSIVELY facial credentials.
// Cards, Fingerprints, and PINs are NOT supported.
// Validate face quality before registration
// POST /api/biometry/validate-face
// Body: { faceData: string } (base64 encoded JPG, 10KB-100KB)
router.post('/validate-face', controller.validateFace);
// Update face for existing person
// POST /api/biometry/update-face
// Body: { personId: string, faceData: string }
router.post('/update-face', controller.updatePersonFace);
// Add face for existing visitor
// POST /api/biometry/visitor-face
// Body: { visitorId: string, faceData: string }
router.post('/visitor-face', controller.addVisitorFace);
// Get face validation rules
// GET /api/biometry/rules
router.get('/rules', controller.getValidationRules);
exports.default = router;
