"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetupController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../database");
const EmailService_1 = require("../services/EmailService");
const AuditService_1 = require("../services/AuditService");
const token_utils_1 = require("../utils/token.utils");
const CODE_TTL_MS = 15 * 60 * 1000; // código expira em 15 minutos
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 reenvio por minuto
const MAX_VERIFY_ATTEMPTS = 5;
// Cadastro pendente em memória: o fluxo (cadastro → código → verificação)
// dura minutos; se o serviço reiniciar no meio, basta refazer o cadastro.
const pending = new Map();
const normalizeEmail = (email) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
const newCode = () => String(crypto_1.default.randomInt(100000, 1000000));
const hashCode = (code) => crypto_1.default.createHash('sha256').update(code).digest('hex');
/**
 * Cadastro do primeiro administrador (pós-instalação), com verificação de
 * e-mail por código. Disponível apenas enquanto não existir nenhum usuário
 * não-protegido (o admin protegido de bootstrap não conta).
 */
class SetupController {
    static async needsSetup() {
        const count = await database_1.prisma.user.count({ where: { isProtected: false } });
        return count === 0;
    }
    /** GET /api/setup/status */
    static async status(_req, res) {
        try {
            res.json({
                needsSetup: await SetupController.needsSetup(),
                smtpConfigured: await EmailService_1.EmailService.isConfigured(),
            });
        }
        catch (error) {
            console.error('[Setup] status error:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
    /** POST /api/setup/register { name?, email, password } */
    static async register(req, res) {
        try {
            if (!(await SetupController.needsSetup())) {
                return res.status(409).json({ error: 'O sistema já foi configurado' });
            }
            const email = normalizeEmail(req.body?.email);
            const password = typeof req.body?.password === 'string' ? req.body.password : '';
            const name = typeof req.body?.name === 'string' && req.body.name.trim()
                ? req.body.name.trim()
                : 'Administrador';
            if (!isValidEmail(email)) {
                return res.status(400).json({ error: 'E-mail inválido' });
            }
            if (password.length < 8) {
                return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres' });
            }
            if (!(await EmailService_1.EmailService.isConfigured())) {
                return res.status(503).json({
                    error: 'Envio de e-mail não configurado no servidor (SMTP). Contate o suporte.',
                });
            }
            const existing = pending.get(email);
            const now = Date.now();
            if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
                return res.status(429).json({
                    error: 'Aguarde um minuto antes de solicitar um novo código',
                });
            }
            const code = newCode();
            const passwordHash = await bcryptjs_1.default.hash(password, 12);
            await EmailService_1.EmailService.sendVerificationCode(email, code);
            pending.set(email, {
                name,
                passwordHash,
                codeHash: hashCode(code),
                expiresAt: now + CODE_TTL_MS,
                lastSentAt: now,
                attempts: 0,
            });
            res.json({ message: 'Código de verificação enviado para o e-mail informado' });
        }
        catch (error) {
            console.error('[Setup] register error:', error?.message || error);
            res.status(502).json({
                error: 'Falha ao enviar o e-mail de verificação. Verifique o endereço e tente novamente.',
            });
        }
    }
    /** POST /api/setup/verify { email, code } */
    static async verify(req, res) {
        try {
            if (!(await SetupController.needsSetup())) {
                return res.status(409).json({ error: 'O sistema já foi configurado' });
            }
            const email = normalizeEmail(req.body?.email);
            const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
            const entry = pending.get(email);
            if (!entry || Date.now() > entry.expiresAt) {
                pending.delete(email);
                return res.status(410).json({
                    error: 'Código expirado ou cadastro não iniciado. Refaça o cadastro.',
                });
            }
            if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
                pending.delete(email);
                return res.status(429).json({
                    error: 'Número máximo de tentativas excedido. Refaça o cadastro.',
                });
            }
            entry.attempts += 1;
            if (!/^\d{6}$/.test(code) || hashCode(code) !== entry.codeHash) {
                return res.status(401).json({
                    error: `Código incorreto (tentativa ${entry.attempts} de ${MAX_VERIFY_ATTEMPTS})`,
                });
            }
            pending.delete(email);
            const user = await database_1.prisma.user.create({
                data: {
                    email,
                    name: entry.name,
                    password: entry.passwordHash,
                    role: 'ADMIN',
                    status: 'active',
                    mustChangePassword: false,
                },
            });
            // Login automático (mesmo contrato do /auth/login)
            const accessToken = await (0, token_utils_1.signAccessToken)(user);
            const refreshToken = (0, token_utils_1.generateRefreshToken)();
            const session = await database_1.prisma.refreshSession.create({
                data: {
                    userId: user.id,
                    tokenHash: (0, token_utils_1.hashRefreshToken)(refreshToken),
                    expiresAt: (0, token_utils_1.getRefreshExpiry)(),
                },
            });
            await AuditService_1.AuditService.logSessionAuditEvent({
                eventType: 'first_admin_setup',
                success: true,
                req,
                userId: user.id,
                userEmail: user.email,
                sessionId: session.id,
                details: 'initial_admin_created_email_verified',
            });
            const isProd = process.env.NODE_ENV === 'production';
            res.cookie('auth_token', accessToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'strict',
                maxAge: 12 * 60 * 60 * 1000,
            });
            res.cookie('auth_refresh_token', refreshToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
            res.json({
                token: accessToken,
                refreshToken,
                user: { id: user.id, email: user.email, name: user.name, role: user.role },
            });
        }
        catch (error) {
            console.error('[Setup] verify error:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }
}
exports.SetupController = SetupController;
