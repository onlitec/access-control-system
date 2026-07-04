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

import { prisma } from '../database';

export const signAccessToken = async (user: { id: string; email: string; role: string }): Promise<string> => {
    const signOptions: SignOptions = { expiresIn: config.JWT.EXPIRES_IN };

    // Fetch role-level permissions and user-specific overrides in parallel
    const [rolePerms, userRecord] = await Promise.all([
        prisma.rolePermission.findUnique({ where: { role: user.role } }),
        prisma.user.findUnique({ where: { id: user.id }, select: { customPermissions: true } }),
    ]);

    const customOverrides = (userRecord?.customPermissions ?? null) as Record<string, boolean> | null;

    // Merge: user-level customPermissions override role-level permissions
    const permissions = rolePerms
        ? { ...rolePerms, ...(customOverrides ?? {}) }
        : (customOverrides ?? null);

    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            permissions,
        },
        config.JWT.SECRET,
        signOptions
    );
};
