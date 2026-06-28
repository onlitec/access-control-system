import { Request } from 'express';

export const getClientIp = (req: Request): string | undefined => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || undefined;
};

export const getUserAgent = (req: Request): string | undefined => {
    const ua = req.headers['user-agent'];
    return typeof ua === 'string' ? ua.slice(0, 500) : undefined;
};
