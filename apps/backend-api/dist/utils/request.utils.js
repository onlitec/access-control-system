"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserAgent = exports.getClientIp = void 0;
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
