import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/unifiedConfig';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    let token = '';
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.auth_token) {
        token = req.cookies.auth_token;
    }

    if (!token) {
        console.warn(`[Auth] 401: No token provided for ${req.method} ${req.url}`);
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, config.JWT.SECRET);
        (req as any).user = decoded;
        next();
    } catch (err: any) {
        console.warn(`[Auth] 401: Invalid token for ${req.method} ${req.url} - ${err.message}`);
        return res.status(401).json({ error: 'Invalid token' });
    }
};

export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).user?.role;
    if (role !== 'ADMIN') {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
};

export const portariaMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const role = (req as any).user?.role;
    if (role !== 'ADMIN' && role !== 'PORTARIA') {
        return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
};
