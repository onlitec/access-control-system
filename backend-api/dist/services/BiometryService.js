"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BiometryService = void 0;
const HikCentralClient_1 = require("./HikCentralClient");
/**
 * Face quality thresholds
 */
const FACE_QUALITY_THRESHOLD = 0.7; // Minimum quality score
const MIN_FILE_SIZE = 10 * 1024; // 10 KB
const MAX_FILE_SIZE = 100 * 1024; // 100 KB
/**
 * Biometry Service - Facial Recognition Only
 *
 * BUSINESS RULE: This platform uses EXCLUSIVELY facial credentials.
 * Cards, Fingerprints, and PINs are NOT supported.
 */
class BiometryService {
    /**
     * Validate face image before registration
     *
     * Rules:
     * - File must be JPG format
     * - File size must be between 10KB and 100KB
     * - Exactly one face must be detected
     * - Face quality score must be >= 0.7
     *
     * POST /artemis/api/acs/v1/faceCheck
     */
    static async validateFace(faceData) {
        try {
            // 1. Validate base64 format and JPG format
            if (!faceData.startsWith('data:image/jpeg') && !faceData.startsWith('data:image/jpg')) {
                // Also check if it's raw base64 without data URI prefix
                if (!faceData.startsWith('/9j/')) {
                    return {
                        valid: false,
                        errorCode: 'INVALID_FORMAT',
                        errorMessage: 'Formato inválido. Apenas imagens JPG são aceitas.',
                    };
                }
            }
            // 2. Extract base64 data
            let base64Data = faceData;
            if (faceData.includes(',')) {
                base64Data = faceData.split(',')[1];
            }
            // 3. Validate file size (10KB - 100KB)
            const buffer = Buffer.from(base64Data, 'base64');
            const fileSize = buffer.length;
            if (fileSize < MIN_FILE_SIZE) {
                return {
                    valid: false,
                    errorCode: 'FILE_TOO_SMALL',
                    errorMessage: `Arquivo muito pequeno (${(fileSize / 1024).toFixed(1)}KB). Tamanho mínimo: 10KB`,
                };
            }
            if (fileSize > MAX_FILE_SIZE) {
                return {
                    valid: false,
                    errorCode: 'FILE_TOO_LARGE',
                    errorMessage: `Arquivo muito grande (${(fileSize / 1024).toFixed(1)}KB). Tamanho máximo: 100KB`,
                };
            }
            // 3. Call HikCentral faceCheck API
            console.log('[BiometryService] Calling faceCheck API...');
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/acs/v1/faceCheck', {
                method: 'POST',
                body: JSON.stringify({ faceData: base64Data }),
            });
            // 4. Parse result
            const faceList = result?.data?.faceList || [];
            const faceCount = faceList.length;
            if (faceCount === 0) {
                return {
                    valid: false,
                    faceCount: 0,
                    errorCode: 'NO_FACE_DETECTED',
                    errorMessage: 'Nenhum rosto detectado na imagem. Posicione o rosto centralizado e com boa iluminação.',
                };
            }
            if (faceCount > 1) {
                return {
                    valid: false,
                    faceCount,
                    errorCode: 'MULTIPLE_FACES',
                    errorMessage: `${faceCount} rostos detectados. A imagem deve conter apenas um rosto.`,
                };
            }
            // 5. Check face quality
            const face = faceList[0];
            const qualityScore = face.qualityScore || face.score || 0;
            if (qualityScore < FACE_QUALITY_THRESHOLD) {
                return {
                    valid: false,
                    qualityScore,
                    faceCount: 1,
                    errorCode: 'LOW_QUALITY',
                    errorMessage: `Qualidade do rosto insuficiente (${(qualityScore * 100).toFixed(0)}%). Melhore a iluminação e tente novamente.`,
                };
            }
            // 6. Face is valid!
            console.log(`[BiometryService] Face validated successfully. Quality: ${(qualityScore * 100).toFixed(0)}%`);
            return {
                valid: true,
                qualityScore,
                faceCount: 1,
            };
        }
        catch (error) {
            console.error('[BiometryService] Face validation error:', error.message);
            return {
                valid: false,
                errorCode: 'API_ERROR',
                errorMessage: `Erro na validação: ${error.message}`,
            };
        }
    }
    /**
     * Add face to existing person
     *
     * POST /artemis/api/resource/v1/person/face/update
     */
    static async updatePersonFace(personId, faceData) {
        try {
            // 1. Validate face first
            const validation = await this.validateFace(faceData);
            if (!validation.valid) {
                return {
                    success: false,
                    message: validation.errorMessage || 'Face validation failed',
                };
            }
            // 2. Extract base64 data
            let base64Data = faceData;
            if (faceData.includes(',')) {
                base64Data = faceData.split(',')[1];
            }
            // 3. Call HikCentral face update API
            console.log(`[BiometryService] Updating face for person ${personId}...`);
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/resource/v1/person/face/update', {
                method: 'POST',
                body: JSON.stringify({
                    personId,
                    faceData: base64Data,
                }),
            });
            console.log(`[BiometryService] Face updated successfully for person ${personId}`);
            return {
                success: true,
                message: 'Face atualizada com sucesso',
            };
        }
        catch (error) {
            console.error('[BiometryService] Face update error:', error.message);
            return {
                success: false,
                message: `Erro ao atualizar face: ${error.message}`,
            };
        }
    }
    /**
     * Add face to existing visitor
     *
     * POST /artemis/api/visitor/v1/visitor/face/add
     */
    static async addVisitorFace(visitorId, faceData) {
        try {
            // 1. Validate face first
            const validation = await this.validateFace(faceData);
            if (!validation.valid) {
                return {
                    success: false,
                    message: validation.errorMessage || 'Face validation failed',
                };
            }
            // 2. Extract base64 data
            let base64Data = faceData;
            if (faceData.includes(',')) {
                base64Data = faceData.split(',')[1];
            }
            // 3. Call HikCentral visitor face add API
            console.log(`[BiometryService] Adding face for visitor ${visitorId}...`);
            const result = await (0, HikCentralClient_1.hikRequest)('/artemis/api/visitor/v1/visitor/face/add', {
                method: 'POST',
                body: JSON.stringify({
                    visitorId,
                    faceData: base64Data,
                }),
            });
            console.log(`[BiometryService] Face added successfully for visitor ${visitorId}`);
            return {
                success: true,
                message: 'Face adicionada com sucesso',
            };
        }
        catch (error) {
            console.error('[BiometryService] Visitor face add error:', error.message);
            return {
                success: false,
                message: `Erro ao adicionar face: ${error.message}`,
            };
        }
    }
    /**
     * Validate image format (JPG only)
     */
    static validateImageFormat(faceData) {
        // Check if it's a data URL with JPG format
        if (faceData.startsWith('data:')) {
            const mimeMatch = faceData.match(/^data:(image\/[^;]+);/);
            if (mimeMatch) {
                const mimeType = mimeMatch[1];
                if (mimeType !== 'image/jpeg') {
                    return {
                        valid: false,
                        error: `Formato inválido (${mimeType}). Use apenas JPG.`,
                    };
                }
            }
        }
        return { valid: true };
    }
    /**
     * Get face validation rules for frontend display
     */
    static getValidationRules() {
        return {
            minFileSize: MIN_FILE_SIZE,
            maxFileSize: MAX_FILE_SIZE,
            qualityThreshold: FACE_QUALITY_THRESHOLD,
            allowedFormats: ['image/jpeg'],
        };
    }
}
exports.BiometryService = BiometryService;
