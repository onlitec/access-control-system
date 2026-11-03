import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

/** Cria a pasta do arquivo SQLite (file:./data/resident.db) antes de abrir a conexão. */
export function ensureSqliteDir(url = process.env.DATABASE_URL || ''): void {
    const match = /^file:(.+)$/.exec(url);
    if (!match) return;
    const file = match[1].split('?')[0];
    // Caminhos relativos do Prisma são relativos à pasta do schema (prisma/).
    const abs = path.isAbsolute(file) ? file : path.resolve(__dirname, '..', 'prisma', file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
}

ensureSqliteDir();
export const prisma = new PrismaClient();
