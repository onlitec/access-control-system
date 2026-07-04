"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserAgent = exports.getClientIp = exports.signAccessToken = exports.generateRefreshToken = exports.hashRefreshToken = exports.getRefreshExpiry = exports.REFRESH_TOKEN_TTL_MS = exports.parseDurationToMs = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '1d');
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const parseDurationToMs = (input) => {
    const match = /^(\d+)([smhd])$/i.exec(input.trim());
    if (!match)
        return 7 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };
    return value * multiplier[unit];
};
exports.parseDurationToMs = parseDurationToMs;
exports.REFRESH_TOKEN_TTL_MS = (0, exports.parseDurationToMs)(REFRESH_TOKEN_EXPIRES_IN);
const getRefreshExpiry = () => new Date(Date.now() + exports.REFRESH_TOKEN_TTL_MS);
exports.getRefreshExpiry = getRefreshExpiry;
const hashRefreshToken = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
exports.hashRefreshToken = hashRefreshToken;
const generateRefreshToken = () => crypto_1.default.randomBytes(48).toString('base64url');
exports.generateRefreshToken = generateRefreshToken;
const signAccessToken = (user) => {
    const signOptions = { expiresIn: JWT_EXPIRES_IN };
    return jsonwebtoken_1.default.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        isSuperAdmin: !!user.isSuperAdmin
    }, JWT_SECRET, signOptions);
};
exports.signAccessToken = signAccessToken;
const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || undefined;
};
exports.getClientIp = getClientIp;
const getUserAgent = (req) => {
    const ua = req.headers['user-agent'];
    return typeof ua === 'string' ? ua.slice(0, 500) : undefined;
};
exports.getUserAgent = getUserAgent;
