import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/unifiedConfig';
import { prisma } from '../database';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
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
            const decoded = jwt.verify(token, config.JWT.SECRET) as any;
            (req as any).user = decoded;

            // Optional: Block blacklisted sessions immediately
            // But we already perform validation on refresh.
            // Access tokens are short-lived.
            
            next();
        } catch (jwtError: any) {
            console.warn('[JWT] Verification failed:', jwtError.message);
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
            }
            return res.status(401).json({ error: 'Invalid token' });
        }
    } catch (error: any) {
        console.error('[AuthMiddleware] System error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * Role-based access control middleware.
 * roles: array of allowed roles (ADMIN, STAFF, etc)
 */
export const roleMiddleware = (allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (!user || !allowedRoles.includes(user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }
        next();
    };
};
