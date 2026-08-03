"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const unifiedConfig_1 = require("../config/unifiedConfig");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const RESIDENT_JWT_EXPIRES = '8h';
// ── Middleware ─────────────────────────────────────────────────────────────
function residentAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    if (!token) {
        res.status(401).json({ error: 'Token não fornecido' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, unifiedConfig_1.config.JWT.SECRET);
        if (decoded.type !== 'resident') {
            res.status(403).json({ error: 'Acesso restrito a moradores' });
            return;
        }
        req.resident = decoded;
        next();
    }
    catch {
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
}
// ── POST /api/resident/auth/login ─────────────────────────────────────────
// Validates CPF + phone against the Person table.
router.post('/auth/login', async (req, res) => {
    try {
        const { cpf, password } = req.body;
        if (!cpf || !password) {
            res.status(400).json({ error: 'CPF e senha são obrigatórios' });
            return;
        }
        const cleanCpf = cpf.replace(/\D/g, '');
        const person = await prisma.person.findFirst({
            where: { cpf: { contains: cleanCpf } },
        });
        if (!person || !person.portalPassword) {
            res.status(401).json({ error: 'Acesso não configurado. Solicite o link de primeiro acesso à portaria.' });
            return;
        }
        const passwordMatch = await bcryptjs_1.default.compare(password, person.portalPassword);
        if (!passwordMatch) {
            res.status(401).json({ error: 'Senha incorreta.' });
            return;
        }
        // Gate de onboarding: só loga quem já teve a verificação facial aprovada
        // (automaticamente ou por revisão manual do admin).
        const verification = await prisma.onboardingFaceVerification.findUnique({
            where: { personId: person.id },
        });
        if (!verification || verification.status !== 'approved') {
            res.status(403).json({
                error: verification?.status === 'pending_admin_review'
                    ? 'Seu cadastro está em análise pela portaria. Você será notificado quando aprovado.'
                    : 'Cadastro incompleto. Finalize a verificação facial no link de primeiro acesso.',
            });
            return;
        }
        // Create session token
        const sessionToken = crypto_1.default.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8h
        await prisma.residentSession.create({
            data: { personId: person.id, token: sessionToken, expiresAt },
        });
        const jwtToken = jsonwebtoken_1.default.sign({
            type: 'resident',
            personId: person.id,
            sessionToken,
            name: `${person.firstName} ${person.lastName}`.trim(),
        }, unifiedConfig_1.config.JWT.SECRET, { expiresIn: RESIDENT_JWT_EXPIRES });
        res.json({
            token: jwtToken,
            expiresIn: RESIDENT_JWT_EXPIRES,
            resident: {
                id: person.id,
                name: `${person.firstName} ${person.lastName}`.trim(),
                unit: person.unit_number,
                tower: person.tower,
                block: person.block,
                photoUrl: person.photoUrl,
            },
        });
    }
    catch (err) {
        console.error('[ResidentAuth] login error:', err.message);
        res.status(500).json({ error: 'Erro interno' });
    }
});
// ── POST /api/resident/auth/logout ────────────────────────────────────────
router.post('/auth/logout', residentAuthMiddleware, async (req, res) => {
    try {
        const { sessionToken } = req.resident;
        if (sessionToken) {
            await prisma.residentSession.deleteMany({ where: { token: sessionToken } });
        }
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/resident/auth/me ─────────────────────────────────────────────
router.get('/auth/me', residentAuthMiddleware, async (req, res) => {
    try {
        const { personId } = req.resident;
        const person = await prisma.person.findUnique({ where: { id: personId } });
        if (!person) {
            res.status(404).json({ error: 'Morador não encontrado' });
            return;
        }
        res.json({
            id: person.id,
            name: `${person.firstName} ${person.lastName}`.trim(),
            email: person.email,
            phone: person.phone,
            unit: person.unit_number,
            tower: person.tower,
            block: person.block,
            photoUrl: person.photoUrl,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/resident/visitors ────────────────────────────────────────────
router.get('/visitors', residentAuthMiddleware, async (req, res) => {
    try {
        const { personId } = req.resident;
        const person = await prisma.person.findUnique({ where: { id: personId } });
        if (!person) {
            res.status(404).json({ error: 'Morador não encontrado' });
            return;
        }
        const residentLabel = `${person.firstName} ${person.lastName}`.trim();
        const visitors = await prisma.visitor.findMany({
            where: {
                OR: [
                    { visiting_resident: { contains: residentLabel, mode: 'insensitive' } },
                    { visiting_unit: person.unit_number ?? undefined },
                ],
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        res.json({ visitors });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/resident/visitors/pre-register ──────────────────────────────
router.post('/visitors/pre-register', residentAuthMiddleware, async (req, res) => {
    try {
        const { personId } = req.resident;
        const person = await prisma.person.findUnique({ where: { id: personId } });
        if (!person) {
            res.status(404).json({ error: 'Morador não encontrado' });
            return;
        }
        const { name, surname, phone, email, purpose, visitStartTime, visitEndTime, type } = req.body;
        if (!name) {
            res.status(400).json({ error: 'Nome do visitante é obrigatório' });
            return;
        }
        const inviteToken = crypto_1.default.randomBytes(32).toString('hex');
        const now = new Date();
        const endTime = visitEndTime ? new Date(visitEndTime) : new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const visitor = await prisma.visitor.create({
            data: {
                name,
                surname: surname ?? '',
                phone: phone ?? null,
                email: email ?? null,
                purpose: purpose ?? null,
                type: type ?? 'VISITOR',
                visitStartTime: visitStartTime ? new Date(visitStartTime) : now,
                visitEndTime: endTime,
                status: 'PRE_REGISTERED',
                inviteToken,
                visiting_resident: `${person.firstName} ${person.lastName}`.trim(),
                visiting_unit: person.unit_number ?? null,
                tower: person.tower ?? null,
                // Store resident's hikPersonId so access levels can be inherited on completion
                accessLevelId: person.hikPersonId ?? null,
                lgpdConsent: false,
            },
        });
        const APP_URL = process.env.APP_URL || 'https://127.0.0.1:8443';
        const completionLink = `${APP_URL}/login/guest-complete?token=${inviteToken}`;
        res.json({ success: true, visitor, completionLink });
    }
    catch (err) {
        console.error('[ResidentAuth] pre-register visitor error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
// ── GET /api/resident/providers ───────────────────────────────────────────
router.get('/providers', residentAuthMiddleware, async (req, res) => {
    try {
        const { personId } = req.resident;
        const person = await prisma.person.findUnique({ where: { id: personId } });
        if (!person) {
            res.status(404).json({ error: 'Morador não encontrado' });
            return;
        }
        const residentLabel = `${person.firstName} ${person.lastName}`.trim();
        const providers = await prisma.serviceProvider.findMany({
            where: {
                visitingResident: { contains: residentLabel, mode: 'insensitive' },
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        res.json({ providers });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── POST /api/resident/providers/pre-register ─────────────────────────────
router.post('/providers/pre-register', residentAuthMiddleware, async (req, res) => {
    try {
        const { personId } = req.resident;
        const person = await prisma.person.findUnique({ where: { id: personId } });
        if (!person) {
            res.status(404).json({ error: 'Morador não encontrado' });
            return;
        }
        const { fullName, document, phone, email, serviceType, validFrom, validUntil } = req.body;
        if (!fullName || !document || !serviceType) {
            res.status(400).json({ error: 'Nome, documento e tipo de serviço são obrigatórios' });
            return;
        }
        const provider = await prisma.serviceProvider.create({
            data: {
                fullName,
                document,
                phone: phone ?? null,
                email: email ?? null,
                serviceType,
                providerType: 'temporary',
                visitingResident: `${person.firstName} ${person.lastName}`.trim(),
                tower: person.tower ?? null,
                validFrom: validFrom ?? null,
                validUntil: validUntil ?? null,
            },
        });
        res.json({ success: true, provider });
    }
    catch (err) {
        console.error('[ResidentAuth] pre-register provider error:', err.message);
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
