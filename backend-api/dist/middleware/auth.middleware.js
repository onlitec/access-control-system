"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleMiddleware = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const unifiedConfig_1 = require("../config/unifiedConfig");
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authorization header required' });
        }
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'Token is required' });
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, unifiedConfig_1.config.JWT.SECRET);
            req.user = decoded;
            // Optional: Block blacklisted sessions immediately
            // But we already perform validation on refresh.
            // Access tokens are short-lived.
            next();
        }
        catch (jwtError) {
            console.warn('[JWT] Verification failed:', jwtError.message);
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
            }
            return res.status(401).json({ error: 'Invalid token' });
        }
    }
    catch (error) {
        console.error('[AuthMiddleware] System error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.authMiddleware = authMiddleware;
/**
 * Role-based access control middleware.
 * roles: array of allowed roles (ADMIN, STAFF, etc)
 */
const roleMiddleware = (allowedRoles) => {
    return (req, res, next) => {
        const user = req.user;
        if (!user || !allowedRoles.includes(user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }
        next();
    };
};
exports.roleMiddleware = roleMiddleware;
