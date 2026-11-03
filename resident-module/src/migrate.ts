import fs from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';

/** Divide o script SQL do Prisma em comandos, ignorando comentários de linha. */
export function splitSql(sql: string): string[] {
    return sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((stmt) => stmt.trim())
        .filter(Boolean);
}

/**
 * Aplica migrations/NNN_*.sql ainda não aplicadas, em ordem. Dispensa a CLI do Prisma
 * no servidor Windows: o banco SQLite é criado/atualizado sozinho ao iniciar.
 * Retorna os nomes aplicados nesta chamada.
 */
export async function runMigrations(client: PrismaClient, dir = path.resolve(__dirname, '..', 'migrations')): Promise<string[]> {
    await client.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS "_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    const done = new Set((await client.$queryRawUnsafe<{ name: string }[]>('SELECT "name" FROM "_migrations"')).map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    const applied: string[] = [];
    for (const file of files) {
        if (done.has(file)) continue;
        const statements = splitSql(fs.readFileSync(path.join(dir, file), 'utf8'));
        await client.$transaction(async (tx) => {
            for (const stmt of statements) await tx.$executeRawUnsafe(stmt);
            await tx.$executeRawUnsafe('INSERT INTO "_migrations" ("name") VALUES (?)', file);
        });
        applied.push(file);
    }
    return applied;
}
