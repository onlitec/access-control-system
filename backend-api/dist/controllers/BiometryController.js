"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BiometryController = void 0;
const BiometryService_1 = require("../services/BiometryService");
/**
 * Controller for Facial Biometry operations
 *
 * BUSINESS RULE: This platform uses EXCLUSIVELY facial credentials.
 * Cards, Fingerprints, and PINs are NOT supported.
 */
class BiometryController {
    constructor() {
        /**
         * POST /api/biometry/validate-face
         * Validate face quality before registration
         *
         * Body: { faceData: string } (base64 encoded JPG)
         *
         * Validation rules:
         * - File format: JPG only
         * - File size: 10KB - 100KB
         * - Face count: exactly 1
         * - Quality score: >= 0.7
         */
        this.validateFace = async (req, res) => {
            try {
                const { faceData } = req.body;
                if (!faceData) {
                    return res.status(400).json({
                        success: false,
                        error: 'faceData is required',
                        errorCode: 'MISSING_FACE_DATA',
                    });
                }
                // Validate image format first
                const formatValidation = BiometryService_1.BiometryService.validateImageFormat(faceData);
                if (!formatValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        error: formatValidation.error,
                        errorCode: 'INVALID_FORMAT',
                    });
                }
                // Validate face with HikCentral
                const result = await BiometryService_1.BiometryService.validateFace(faceData);
                if (result.valid) {
                    res.json({
                        success: true,
                        valid: true,
                        qualityScore: result.qualityScore,
                        message: 'Face validada com sucesso',
                    });
                }
                else {
                    res.status(400).json({
                        success: false,
                        valid: false,
                        errorCode: result.errorCode,
                        error: result.errorMessage,
                        qualityScore: result.qualityScore,
                    });
                }
            }
            catch (error) {
                console.error('[BiometryController] validateFace error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                    errorCode: 'INTERNAL_ERROR',
                });
            }
        };
        /**
         * POST /api/biometry/update-face
         * Update face for existing person
         *
         * Body: { personId: string, faceData: string }
         */
        this.updatePersonFace = async (req, res) => {
            try {
                const { personId, faceData } = req.body;
                if (!personId || !faceData) {
                    return res.status(400).json({
                        success: false,
                        error: 'personId and faceData are required',
                    });
                }
                const result = await BiometryService_1.BiometryService.updatePersonFace(personId, faceData);
                if (result.success) {
                    res.json({
                        success: true,
                        message: result.message,
                    });
                }
                else {
                    res.status(400).json({
                        success: false,
                        error: result.message,
                    });
                }
            }
            catch (error) {
                console.error('[BiometryController] updatePersonFace error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                });
            }
        };
        /**
         * POST /api/biometry/visitor-face
         * Add face for existing visitor
         *
         * Body: { visitorId: string, faceData: string }
         */
        this.addVisitorFace = async (req, res) => {
            try {
                const { visitorId, faceData } = req.body;
                if (!visitorId || !faceData) {
                    return res.status(400).json({
                        success: false,
                        error: 'visitorId and faceData are required',
                    });
                }
                const result = await BiometryService_1.BiometryService.addVisitorFace(visitorId, faceData);
                if (result.success) {
                    res.json({
                        success: true,
                        message: result.message,
                    });
                }
                else {
                    res.status(400).json({
                        success: false,
                        error: result.message,
                    });
                }
            }
            catch (error) {
                console.error('[BiometryController] addVisitorFace error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                });
            }
        };
        /**
         * GET /api/biometry/rules
         * Get face validation rules for frontend
         */
        this.getValidationRules = async (req, res) => {
            try {
                const rules = BiometryService_1.BiometryService.getValidationRules();
                res.json({
                    success: true,
                    data: {
                        ...rules,
                        minFileSizeKB: rules.minFileSize / 1024,
                        maxFileSizeKB: rules.maxFileSize / 1024,
                        qualityThresholdPercent: rules.qualityThreshold * 100,
                    },
                });
            }
            catch (error) {
                console.error('[BiometryController] getValidationRules error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message,
                });
            }
        };
    }
}
exports.BiometryController = BiometryController;
