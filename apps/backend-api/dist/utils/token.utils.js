"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = exports.generateRefreshToken = exports.hashRefreshToken = exports.getRefreshExpiry = exports.REFRESH_TOKEN_TTL_MS = exports.parseDurationToMs = void 0;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const unifiedConfig_1 = require("../config/unifiedConfig");
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
exports.REFRESH_TOKEN_TTL_MS = (0, exports.parseDurationToMs)(unifiedConfig_1.config.JWT.REFRESH_EXPIRES_IN);
const getRefreshExpiry = () => new Date(Date.now() + exports.REFRESH_TOKEN_TTL_MS);
exports.getRefreshExpiry = getRefreshExpiry;
const hashRefreshToken = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
exports.hashRefreshToken = hashRefreshToken;
const generateRefreshToken = () => crypto_1.default.randomBytes(48).toString('base64url');
exports.generateRefreshToken = generateRefreshToken;
const database_1 = require("../database");
const signAccessToken = async (user) => {
    const signOptions = { expiresIn: unifiedConfig_1.config.JWT.EXPIRES_IN };
    // Fetch role-level permissions and user-specific overrides in parallel
    const [rolePerms, userRecord] = await Promise.all([
        database_1.prisma.rolePermission.findUnique({ where: { role: user.role } }),
        database_1.prisma.user.findUnique({ where: { id: user.id }, select: { customPermissions: true } }),
    ]);
    const customOverrides = (userRecord?.customPermissions ?? null);
    // Merge: user-level customPermissions override role-level permissions
    const permissions = rolePerms
        ? { ...rolePerms, ...(customOverrides ?? {}) }
        : (customOverrides ?? null);
    return jsonwebtoken_1.default.sign({
        id: user.id,
        email: user.email,
        role: user.role,
        permissions,
    }, unifiedConfig_1.config.JWT.SECRET, signOptions);
};
exports.signAccessToken = signAccessToken;
