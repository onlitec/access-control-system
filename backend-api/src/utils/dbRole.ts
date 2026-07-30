import { prisma } from '../database';

/**
 * Segundo servidor (réplica de leitura do Postgres): usado tanto pelo
 * middleware HTTP de encaminhamento de escritas quanto pelo VMS, para saber
 * se este processo está rodando contra um standby (e portanto deve pular
 * jobs de escrita em vez de falhar repetidamente contra uma transação
 * somente-leitura).
 */

const RECOVERY_CHECK_TTL_MS = 3_000;

let cachedIsStandby = false;
let cachedAt = 0;

export async function isStandby(): Promise<boolean> {
    const now = Date.now();
    if (now - cachedAt < RECOVERY_CHECK_TTL_MS) {
        return cachedIsStandby;
    }
    try {
        const [{ pg_is_in_recovery }] = await prisma.$queryRaw<[{ pg_is_in_recovery: boolean }]>`SELECT pg_is_in_recovery()`;
        cachedIsStandby = pg_is_in_recovery;
    } catch (error: any) {
        console.error('[DbRole] Falha ao checar pg_is_in_recovery(), assumindo primário:', error?.message || error);
        cachedIsStandby = false;
    }
    cachedAt = now;
    return cachedIsStandby;
}
