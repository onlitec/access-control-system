import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { Resident } from '../hikcentral/residents';

export interface SessionPayload {
    sub: string; // hikPersonId
    name: string;
    towers: string[];
}

export function issueSession(resident: Resident): string {
    const payload: SessionPayload = { sub: resident.hikPersonId, name: resident.name, towers: resident.towers };
    return jwt.sign(payload, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
}

export function requireResident(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
        (req as any).resident = jwt.verify(token, config.jwtSecret) as SessionPayload;
        next();
    } catch {
        res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }
}
