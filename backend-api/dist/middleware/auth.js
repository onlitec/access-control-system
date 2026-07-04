"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.portariaMiddleware = exports.adminMiddleware = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const unifiedConfig_1 = require("../config/unifiedConfig");
const authMiddleware = (req, res, next) => {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    else if (req.cookies && req.cookies.auth_token) {
        token = req.cookies.auth_token;
    }
    if (!token) {
        console.warn(`[Auth] 401: No token provided for ${req.method} ${req.url}`);
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, unifiedConfig_1.config.JWT.SECRET);
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
    if (role !== 'ADMIN' && role !== 'admin_master') {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
};
exports.adminMiddleware = adminMiddleware;
const portariaMiddleware = (req, res, next) => {
    const role = req.user?.role;
    if (role !== 'ADMIN' && role !== 'PORTARIA') {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
};
exports.portariaMiddleware = portariaMiddleware;
