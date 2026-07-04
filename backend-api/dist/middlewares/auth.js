"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPermission = exports.adminMiddleware = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const authMiddleware = (req, res, next) => {
    // Check for token in Authorization header
    let authHeader = req.headers.authorization;
    // Check for token in query param (used for pictures)
    const queryToken = req.query.token;
    if (queryToken && !authHeader) {
        authHeader = `Bearer ${queryToken}`;
        req.headers.authorization = authHeader;
    }
    if (!authHeader) {
        console.warn(`[Auth] 401: No token provided for ${req.method} ${req.url}`);
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (err) {
        console.warn(`[Auth] 401: Invalid token for ${req.method} ${req.url} - ${err.message}`);
        return res.status(401).json({ error: 'Invalid token' });
    }
};
exports.authMiddleware = authMiddleware;
const adminMiddleware = (req, res, next) => {
    const role = req.user?.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
};
exports.adminMiddleware = adminMiddleware;
/**
 * Middleware para verificação de permissões (ACL)
 */
const checkPermission = (permissionCode) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Não autenticado' });
            }
            const user = await db_1.prisma.user.findUnique({
                where: { id: req.user.id || req.user.sub },
                include: {
                    permissions: {
                        include: { permission: true }
                    }
                }
            });
            if (!user) {
                return res.status(401).json({ error: 'Usuário não encontrado' });
            }
            // SuperAdmin tem acesso total
            if (user.isSuperAdmin) {
                return next();
            }
            // Verifica se possui a claim específica ou a claim mestra *:delete para deleções
            const hasClaim = user.permissions.some(up => up.permission.code === permissionCode ||
                (permissionCode.endsWith(':delete') && up.permission.code === '*:delete'));
            if (!hasClaim) {
                return res.status(403).json({
                    error: `Acesso negado: permissão '${permissionCode}' necessária`
                });
            }
            next();
        }
        catch (error) {
            console.error('[RBAC] Erro ao verificar permissão:', error);
            res.status(500).json({ error: 'Erro interno na verificação de permissão' });
        }
    };
};
exports.checkPermission = checkPermission;
