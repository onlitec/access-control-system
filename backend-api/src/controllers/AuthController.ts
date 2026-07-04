import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../database';
import { config } from '../config/unifiedConfig';
import { 
    generateRefreshToken, 
    hashRefreshToken, 
    getRefreshExpiry, 
    signAccessToken 
} from '../utils/token.utils';
import { AuditService } from '../services/AuditService';
import { OrgResolverService } from '../services/OrgResolverService';
import { HIK_ORG_ROLE_MAP } from '../config/hik-constants';

export class AuthController {
    /**
     * Revokes older sessions if they exceed the maximum limit.
     */
    private static async revokeExcessActiveSessions(userId: string): Promise<number> {
        const sessions = await prisma.refreshSession.findMany({
            where: {
                userId,
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
        });

        if (sessions.length <= config.JWT.MAX_ACTIVE_SESSIONS) {
            return 0;
        }

        const toRevokeIds = sessions.slice(config.JWT.MAX_ACTIVE_SESSIONS).map((s) => s.id);
        const result = await prisma.refreshSession.updateMany({
            where: { id: { in: toRevokeIds } },
            data: { revokedAt: new Date() },
        });
        return result.count;
    }

    static async login(req: Request, res: Response) {
        const { email, password } = req.body;

        try {
            const user = await prisma.user.findUnique({
                where: { email },
            });

            if (!user) {
                await AuditService.logSessionAuditEvent({
                    eventType: 'login',
                    success: false,
                    req,
                    userEmail: email,
                    details: 'user_not_found',
                });
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                await AuditService.logSessionAuditEvent({
                    eventType: 'login',
                    success: false,
                    req,
                    userId: user.id,
                    userEmail: user.email,
                    details: 'invalid_password',
                });
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }

            // Cleanup old sessions
            await AuthController.revokeExcessActiveSessions(user.id);

            // Generate tokens
            const refreshToken = generateRefreshToken();
            const hashedToken = hashRefreshToken(refreshToken);
            const accessToken = await signAccessToken(user);

            // Create session
            const session = await prisma.refreshSession.create({
                data: {
                    userId: user.id,
                    tokenHash: hashedToken,
                    expiresAt: getRefreshExpiry(),
                },
            });

            await AuditService.logSessionAuditEvent({
                eventType: 'login',
                success: true,
                req,
                userId: user.id,
                userEmail: user.email,
                sessionId: session.id,
            });

            // Organizational context (HikCentral)
            const resolvedOrgCodes = await OrgResolverService.resolveOrgCodesByName();
            const userRoles = [HIK_ORG_ROLE_MAP[(user as any).orgIndexCode || ''] || user.role];

            const isProd = process.env.NODE_ENV === 'production';
            
            res.cookie('auth_token', accessToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'strict',
                maxAge: 12 * 60 * 60 * 1000 // 12h
            });

            res.cookie('auth_refresh_token', refreshToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7d
            });

            const rolePermissions = await prisma.rolePermission.findUnique({
                where: { role: user.role }
            });

            res.json({
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    name: user.name,
                    permissions: rolePermissions || null,
                },
                token: accessToken,
                refreshToken,
                sessionInfo: {
                    roles: userRoles,
                    orgCodes: resolvedOrgCodes
                }
            });
        } catch (error: any) {
            console.error('[Auth] Login error:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    static async refreshToken(req: Request, res: Response) {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'Refresh token é obrigatório' });

        try {
            const hashedToken = hashRefreshToken(refreshToken);
            const session = await prisma.refreshSession.findUnique({
                where: { tokenHash: hashedToken },
                include: { user: true }
            });

            if (!session || session.revokedAt || session.expiresAt < new Date()) {
                if (session) {
                    await AuditService.logSessionAuditEvent({
                        eventType: 'refresh',
                        success: false,
                        req,
                        userId: session.userId,
                        userEmail: session.user.email,
                        sessionId: session.id,
                        details: 'expired_or_revoked_token',
                    });
                }
                return res.status(401).json({ error: 'Refresh token inválido', code: 'INVALID_SESSION' });
            }

            const user = session.user;
            const newAccessToken = await signAccessToken(user);

            await AuditService.logSessionAuditEvent({
                eventType: 'refresh',
                success: true,
                req,
                userId: user.id,
                userEmail: user.email,
                sessionId: session.id,
            });

            const isProd = process.env.NODE_ENV === 'production';
            res.cookie('auth_token', newAccessToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'strict',
                maxAge: 12 * 60 * 60 * 1000 // 12h
            });

            res.json({ token: newAccessToken });
        } catch (error: any) {
            console.error('[Auth] Refresh error:', error);
            res.status(500).json({ error: 'Erro interno no servidor' });
        }
    }

    static async logout(req: Request, res: Response) {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: 'Refresh token é obrigatório' });

        try {
            const hashedToken = hashRefreshToken(refreshToken);
            const session = await prisma.refreshSession.update({
                where: { tokenHash: hashedToken },
                data: { revokedAt: new Date() },
                include: { user: true }
            });

            await AuditService.logSessionAuditEvent({
                eventType: 'logout',
                success: true,
                req,
                userId: session.userId,
                userEmail: session.user.email,
                sessionId: session.id,
            });

            res.clearCookie('auth_token');
            res.clearCookie('auth_refresh_token');

            res.json({ message: 'Logout realizado com sucesso' });
        } catch (error) {
            res.clearCookie('auth_token');
            res.clearCookie('auth_refresh_token');
            res.status(200).json({ message: 'Ok' });
        }
    }

    static async listUserSessions(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const sessions = await prisma.refreshSession.findMany({
                where: {
                    userId,
                    revokedAt: null,
                    expiresAt: { gt: new Date() },
                },
                select: {
                    id: true,
                    createdAt: true,
                    expiresAt: true,
                },
                orderBy: { createdAt: 'desc' },
            });

            res.json({
                data: sessions,
                count: sessions.length,
                maxActiveSessions: config.JWT.MAX_ACTIVE_SESSIONS,
            });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    static async revokeSession(req: Request, res: Response) {
        const { sessionId } = req.body;
        const userId = (req as any).user?.id;

        if (!sessionId || !userId) return res.status(400).json({ error: 'Session ID missing or unauthorized' });

        try {
            await prisma.refreshSession.update({
                where: { id: sessionId, userId },
                data: { revokedAt: new Date() }
            });
            res.json({ message: 'Session revoked' });
        } catch (error) {
            res.status(404).json({ error: 'Session not found or already revoked' });
        }
    }

    static async firstAccessValidate(req: Request, res: Response) {
        const { token } = req.body;
        try {
            if (!token) return res.status(400).json({ valid: false, message: 'Token é obrigatório' });
            const decoded: any = jwt.verify(token, config.JWT.SECRET);
            if (decoded.type !== 'onboarding') return res.status(400).json({ valid: false, message: 'Tipo de token inválido' });

            const person = await prisma.person.findUnique({ where: { id: decoded.personId } });
            if (!person) return res.status(404).json({ valid: false, message: 'Morador não encontrado no sistema' });

            if (person.email) {
                const existingUser = await prisma.user.findUnique({ where: { email: person.email } });
                if (existingUser) return res.json({ valid: true, alreadyActive: true, message: 'Sua conta já está ativa!' });
            }

            res.json({
                valid: true,
                personId: person.id,
                name: `${person.firstName} ${person.lastName}`.trim(),
                email: person.email,
                phone: person.phone,
                role: 'MORADOR'
            });
        } catch (err: any) {
            res.status(401).json({ valid: false, message: 'Link de acesso expirado ou inválido.' });
        }
    }

    static async firstAccessSetupPassword(req: Request, res: Response) {
        const { token, password } = req.body;
        try {
            if (!token || !password) return res.status(400).json({ valid: false, message: 'Token e senha são obrigatórios' });
            const decoded: any = jwt.verify(token, config.JWT.SECRET);
            if (decoded.type !== 'onboarding') return res.status(400).json({ error: 'Tipo de token inválido' });

            const person = await prisma.person.findUnique({ where: { id: decoded.personId } });
            if (!person || !person.email) return res.status(400).json({ error: 'Morador não encontrado ou sem e-mail' });

            const hashedPassword = await bcrypt.hash(password, 12);
            const user = await prisma.user.upsert({
                where: { email: person.email },
                update: { password: hashedPassword, role: 'MORADOR', name: `${person.firstName} ${person.lastName}`.trim() },
                create: { email: person.email, password: hashedPassword, name: `${person.firstName} ${person.lastName}`.trim(), role: 'MORADOR' }
            });

            const accessToken = await signAccessToken(user);
            const refreshToken = generateRefreshToken();
            const session = await prisma.refreshSession.create({
                data: { userId: user.id, tokenHash: hashRefreshToken(refreshToken), expiresAt: getRefreshExpiry() }
            });

            await AuditService.logSessionAuditEvent({
                eventType: 'first_access_setup',
                success: true,
                req,
                userId: user.id,
                userEmail: user.email,
                sessionId: session.id,
                details: 'onboarding_completed'
            });

            const isProd = process.env.NODE_ENV === 'production';
            res.cookie('auth_token', accessToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'strict',
                maxAge: 12 * 60 * 60 * 1000 // 12h
            });
            res.cookie('auth_refresh_token', refreshToken, {
                httpOnly: true,
                secure: isProd,
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7d
            });

            res.json({ token: accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
        } catch (err: any) {
            res.status(401).json({ valid: false, message: 'Link de acesso expirado ou inválido.' });
        }
    }

    static async me(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            if (!userId) return res.status(401).json({ error: 'Unauthorized' });

            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, name: true, role: true, createdAt: true }
            });

            if (!user) return res.status(404).json({ error: 'User not found' });

            const rolePermissions = await prisma.rolePermission.findUnique({
                where: { role: user.role }
            });

            res.json({
                ...user,
                permissions: rolePermissions || null
            });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
