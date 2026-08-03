"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOnboardingLink = createOnboardingLink;
const express_1 = require("express");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const unifiedConfig_1 = require("../config/unifiedConfig");
const auth_1 = require("../middleware/auth");
const AuditService_1 = require("../services/AuditService");
const FaceMatchService_1 = require("../services/FaceMatchService");
const cpf_utils_1 = require("../utils/cpf.utils");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const MAX_SELFIE_ATTEMPTS = 5;
const APP_URL = process.env.APP_URL || 'https://127.0.0.1:8443';
function verifyOnboardingToken(token) {
    const decoded = jsonwebtoken_1.default.verify(token, unifiedConfig_1.config.JWT.SECRET);
    if (decoded.type !== 'onboarding') {
        throw new Error('Token inválido para onboarding');
    }
    return decoded;
}
/**
 * Gera um novo link de onboarding para um morador, resetando o estado de
 * verificação facial (usado tanto na criação do morador quanto em
 * "reenviar link" / reset após rejeição do admin).
 */
async function createOnboardingLink(personId, hikPersonId) {
    const onboardingToken = jsonwebtoken_1.default.sign({ personId, hikPersonId: hikPersonId ?? null, type: 'onboarding' }, unifiedConfig_1.config.JWT.SECRET, { expiresIn: '48h' });
    await prisma.onboardingFaceVerification.upsert({
        where: { personId },
        create: { personId, status: 'awaiting_selfie', attempts: 0 },
        update: {
            status: 'awaiting_selfie',
            attempts: 0,
            lastSelfieUrl: null,
            lastSimilarity: null,
            lastAttemptAt: null,
            resolvedBy: null,
            resolvedAt: null,
            resolutionNotes: null,
        },
    });
    return `${APP_URL}/login/first-access?token=${onboardingToken}`;
}
// ── POST /api/onboarding/validate ───────────────────────────────────────────
// Saudação inicial: só confirma o token e mostra o nome do morador.
router.post('/validate', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token)
            return res.status(400).json({ message: 'Token não fornecido' });
        const decoded = verifyOnboardingToken(token);
        const person = await prisma.person.findUnique({ where: { id: decoded.personId } });
        if (!person)
            return res.status(404).json({ message: 'Morador não encontrado' });
        res.json({
            id: person.id,
            name: `${person.firstName} ${person.lastName}`.trim(),
            photoUrl: person.photoUrl,
        });
    }
    catch (error) {
        console.error('Onboarding Validate Error:', error);
        res.status(400).json({ message: 'Token inválido ou expirado' });
    }
});
// ── POST /api/onboarding/confirm-cpf ────────────────────────────────────────
router.post('/confirm-cpf', async (req, res) => {
    try {
        const { token, cpf } = req.body;
        if (!token)
            return res.status(400).json({ message: 'Token não fornecido' });
        if (!cpf || !(0, cpf_utils_1.isValidCpf)(cpf)) {
            return res.status(400).json({ message: 'CPF inválido' });
        }
        const decoded = verifyOnboardingToken(token);
        const person = await prisma.person.findUnique({ where: { id: decoded.personId } });
        if (!person)
            return res.status(404).json({ message: 'Morador não encontrado' });
        if (!person.cpf || !(0, cpf_utils_1.cpfEquals)(person.cpf, cpf)) {
            return res.status(400).json({ message: 'CPF não confere com o cadastro' });
        }
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Onboarding Confirm-CPF Error:', error);
        res.status(400).json({ message: 'Token inválido ou expirado' });
    }
});
// ── POST /api/onboarding/complete ───────────────────────────────────────────
router.post('/complete', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token)
            return res.status(400).json({ message: 'Token não fornecido' });
        if (!password || password.length < 6) {
            return res.status(400).json({ message: 'Senha deve ter ao menos 6 caracteres' });
        }
        const decoded = verifyOnboardingToken(token);
        const person = await prisma.person.findUnique({ where: { id: decoded.personId } });
        if (!person)
            return res.status(404).json({ message: 'Morador não encontrado' });
        const hashed = await bcryptjs_1.default.hash(password, 12);
        await prisma.person.update({ where: { id: person.id }, data: { portalPassword: hashed } });
        await prisma.onboardingFaceVerification.upsert({
            where: { personId: person.id },
            create: { personId: person.id, status: 'awaiting_selfie', attempts: 0 },
            update: { status: 'awaiting_selfie', attempts: 0, lastSelfieUrl: null, lastSimilarity: null },
        });
        res.json({ success: true, nextStep: 'selfie' });
    }
    catch (error) {
        console.error('Onboarding Complete Error:', error);
        res.status(500).json({ message: error.message || 'Erro ao concluir onboarding' });
    }
});
// ── POST /api/onboarding/selfie ──────────────────────────────────────────────
router.post('/selfie', async (req, res) => {
    try {
        const { token, photoBase64 } = req.body;
        if (!token)
            return res.status(400).json({ message: 'Token não fornecido' });
        if (!photoBase64)
            return res.status(400).json({ message: 'Foto não fornecida' });
        const decoded = verifyOnboardingToken(token);
        const person = await prisma.person.findUnique({
            where: { id: decoded.personId },
            include: { faceVerification: true },
        });
        if (!person)
            return res.status(404).json({ message: 'Morador não encontrado' });
        const verification = person.faceVerification;
        if (!verification || verification.status !== 'awaiting_selfie') {
            return res.status(409).json({
                message: verification?.status === 'pending_admin_review'
                    ? 'Seu cadastro já está em análise pela portaria.'
                    : verification?.status === 'approved'
                        ? 'Cadastro já aprovado.'
                        : 'Link de onboarding inválido para esta etapa.',
            });
        }
        if (!person.photoUrl) {
            return res.status(422).json({
                message: 'Não há foto de referência cadastrada para comparação. Entre em contato com a portaria.',
            });
        }
        const result = await FaceMatchService_1.FaceMatchService.compareFaces(person.photoUrl, photoBase64);
        // Foto de referência sem rosto detectável: problema do cadastro (não do
        // morador), não conta como tentativa. Precisa de intervenção da portaria.
        if (result.noFaceDetected === 'reference') {
            console.error(`[Onboarding] Foto de referência sem rosto detectável para pessoa ${person.id}`);
            return res.status(422).json({
                message: 'Não foi possível validar a foto cadastrada. Entre em contato com a portaria para atualizá-la.',
            });
        }
        const attempts = verification.attempts + 1;
        if (result.match) {
            await prisma.onboardingFaceVerification.update({
                where: { personId: person.id },
                data: {
                    status: 'approved',
                    attempts,
                    lastSelfieUrl: photoBase64,
                    lastSimilarity: result.similarity,
                    lastAttemptAt: new Date(),
                },
            });
            await AuditService_1.AuditService.logSessionAuditEvent({
                eventType: 'onboarding_face_match_success',
                success: true,
                req,
                userId: person.id,
                userEmail: person.email,
                details: `similarity=${result.similarity.toFixed(3)}`,
            });
            return res.json({ approved: true });
        }
        const failMessage = result.noFaceDetected === 'candidate'
            ? 'Não conseguimos identificar seu rosto na foto. Tente novamente com melhor iluminação.'
            : 'A foto não corresponde ao cadastro.';
        if (attempts < MAX_SELFIE_ATTEMPTS) {
            await prisma.onboardingFaceVerification.update({
                where: { personId: person.id },
                data: { attempts, lastSelfieUrl: photoBase64, lastSimilarity: result.similarity, lastAttemptAt: new Date() },
            });
            await AuditService_1.AuditService.logSessionAuditEvent({
                eventType: 'onboarding_face_match_fail',
                success: false,
                req,
                userId: person.id,
                userEmail: person.email,
                details: `attempt=${attempts} similarity=${result.similarity}`,
            });
            return res.json({ approved: false, message: failMessage, attemptsRemaining: MAX_SELFIE_ATTEMPTS - attempts });
        }
        // Esgotou as tentativas: fica pendente de revisão manual do admin.
        await prisma.onboardingFaceVerification.update({
            where: { personId: person.id },
            data: {
                status: 'pending_admin_review',
                attempts,
                lastSelfieUrl: photoBase64,
                lastSimilarity: result.similarity,
                lastAttemptAt: new Date(),
            },
        });
        await AuditService_1.AuditService.logSessionAuditEvent({
            eventType: 'onboarding_face_match_exhausted',
            success: false,
            req,
            userId: person.id,
            userEmail: person.email,
            details: `attempts=${attempts}`,
        });
        res.json({ approved: false, pendingReview: true });
    }
    catch (error) {
        console.error('Onboarding Selfie Error:', error);
        res.status(400).json({ message: 'Token inválido ou expirado' });
    }
});
// ── Rotas de administração (revisão manual) ─────────────────────────────────
router.use(auth_1.authMiddleware, auth_1.adminMiddleware);
// GET /api/onboarding/pending-reviews
router.get('/pending-reviews', async (_req, res) => {
    try {
        const pending = await prisma.onboardingFaceVerification.findMany({
            where: { status: 'pending_admin_review' },
            include: {
                person: {
                    select: {
                        id: true, firstName: true, lastName: true, photoUrl: true,
                        unit_number: true, tower: true, block: true,
                    },
                },
            },
            orderBy: { lastAttemptAt: 'desc' },
        });
        res.json({
            data: pending.map((v) => ({
                personId: v.personId,
                name: `${v.person.firstName} ${v.person.lastName}`.trim(),
                unit: v.person.unit_number,
                tower: v.person.tower,
                block: v.person.block,
                referencePhotoUrl: v.person.photoUrl,
                lastSelfieUrl: v.lastSelfieUrl,
                lastSimilarity: v.lastSimilarity,
                attempts: v.attempts,
                lastAttemptAt: v.lastAttemptAt,
            })),
        });
    }
    catch (error) {
        console.error('Onboarding Pending-Reviews Error:', error);
        res.status(500).json({ error: 'Erro ao listar revisões pendentes' });
    }
});
// POST /api/onboarding/pending-reviews/:personId/approve
router.post('/pending-reviews/:personId/approve', async (req, res) => {
    try {
        const { personId } = req.params;
        const adminUser = req.user;
        const verification = await prisma.onboardingFaceVerification.findUnique({ where: { personId } });
        if (!verification || verification.status !== 'pending_admin_review') {
            return res.status(404).json({ error: 'Revisão pendente não encontrada' });
        }
        await prisma.onboardingFaceVerification.update({
            where: { personId },
            data: { status: 'approved', resolvedBy: adminUser?.id ?? null, resolvedAt: new Date() },
        });
        await AuditService_1.AuditService.logAdminAuditEvent({
            action: 'onboarding_face_review_approve',
            status: 'success',
            req,
            userId: adminUser?.id,
            userEmail: adminUser?.email,
            details: `personId=${personId}`,
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Onboarding Approve Error:', error);
        res.status(500).json({ error: 'Erro ao aprovar cadastro' });
    }
});
// POST /api/onboarding/pending-reviews/:personId/reject
router.post('/pending-reviews/:personId/reject', async (req, res) => {
    try {
        const { personId } = req.params;
        const { notes } = req.body || {};
        const adminUser = req.user;
        const verification = await prisma.onboardingFaceVerification.findUnique({ where: { personId } });
        if (!verification || verification.status !== 'pending_admin_review') {
            return res.status(404).json({ error: 'Revisão pendente não encontrada' });
        }
        // Reset completo: limpa a senha e apaga o estado de verificação.
        // Precisa de um novo link de onboarding (admin) para tentar de novo.
        await prisma.person.update({ where: { id: personId }, data: { portalPassword: null } });
        await prisma.onboardingFaceVerification.delete({ where: { personId } });
        await AuditService_1.AuditService.logAdminAuditEvent({
            action: 'onboarding_face_review_reject',
            status: 'success',
            req,
            userId: adminUser?.id,
            userEmail: adminUser?.email,
            details: `personId=${personId}${notes ? ` notes=${notes}` : ''}`,
        });
        res.json({ success: true, message: 'Cadastro resetado. Gere um novo link de onboarding para o morador.' });
    }
    catch (error) {
        console.error('Onboarding Reject Error:', error);
        res.status(500).json({ error: 'Erro ao rejeitar cadastro' });
    }
});
exports.default = router;
