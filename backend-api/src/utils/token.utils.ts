import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { config } from '../config/unifiedConfig';

export const parseDurationToMs = (input: string): number => {
    const match = /^(\d+)([smhd])$/i.exec(input.trim());
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier: Record<string, number> = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };
    return value * multiplier[unit];
};

export const REFRESH_TOKEN_TTL_MS = parseDurationToMs(config.JWT.REFRESH_EXPIRES_IN);

export const getRefreshExpiry = (): Date => new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

export const hashRefreshToken = (token: string): string => 
    crypto.createHash('sha256').update(token).digest('hex');

export const generateRefreshToken = (): string => 
    crypto.randomBytes(48).toString('base64url');

export const signAccessToken = (user: { id: string; email: string; role: string }): string => {
    const signOptions: SignOptions = { expiresIn: config.JWT.EXPIRES_IN };
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role }, 
        config.JWT.SECRET, 
        signOptions
    );
};
