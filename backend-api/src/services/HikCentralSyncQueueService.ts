import { PrismaClient } from '@prisma/client';
import { HikCentralService } from './HikCentralService';

const prisma = new PrismaClient();

const BATCH_SIZE = 20;
const BASE_BACKOFF_MS = 30_000; // 30s
const MAX_BACKOFF_MS = 30 * 60_000; // 30min

type SyncOperation = 'create' | 'update' | 'delete';

interface ServiceProviderSyncPayload {
    fullName: string;
    phone?: string | null;
    email?: string | null;
    hikcentralPersonId?: string | null;
}

interface QueueRow {
    id: string;
    entityType: string;
    entityId: string;
    operation: string;
    attempts: number;
    maxAttempts: number;
    payload: any;
}

interface DispatchResult {
    notApplicable?: boolean;
    hikEntityId?: string | null;
}

/**
 * Fila de sincronização assíncrona (push local -> HikCentral) com retry e
 * backoff exponencial. O write local sempre acontece primeiro; enqueue()
 * nunca lança erro, e o drain roda em background — nenhum write local deve
 * depender desta fila para ter sucesso.
 */
export class HikCentralSyncQueueService {
    /**
     * Enfileira uma operação de sync. Falha silenciosamente (loga e segue)
     * para nunca derrubar o caller.
     */
    public static async enqueue(
        entityType: string,
        entityId: string,
        operation: SyncOperation,
        payload: Record<string, any>,
    ): Promise<void> {
        try {
            await prisma.hikCentralSyncQueue.create({
                data: { entityType, entityId, operation, payload, status: 'pending' },
            });
        } catch (error: any) {
            console.error(`[HikCentralSyncQueue] Falha ao enfileirar ${entityType}/${entityId}:`, error.message);
        }
    }

    /**
     * Processa um lote de linhas pendentes/com erro cuja próxima tentativa já venceu.
     */
    public static async drainOnce(): Promise<{ processed: number; succeeded: number; failed: number }> {
        const rows = await prisma.hikCentralSyncQueue.findMany({
            where: { status: { in: ['pending', 'error'] }, nextAttemptAt: { lte: new Date() } },
            orderBy: { nextAttemptAt: 'asc' },
            take: BATCH_SIZE,
        });

        let succeeded = 0;
        let failed = 0;

        for (const row of rows) {
            await prisma.hikCentralSyncQueue.update({ where: { id: row.id }, data: { status: 'processing' } });

            try {
                const result = await this.dispatch(row as QueueRow);
                const status = result.notApplicable ? 'not_applicable' : 'synced';
                await prisma.hikCentralSyncQueue.update({
                    where: { id: row.id },
                    data: {
                        status,
                        hikEntityId: result.hikEntityId ?? null,
                        lastError: null,
                        syncedAt: new Date(),
                    },
                });
                await this.reflectStatusOnEntity(row.entityType, row.entityId, status, null);
                succeeded++;
            } catch (error: any) {
                const attempts = row.attempts + 1;
                const exhausted = attempts >= row.maxAttempts;
                const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, attempts), MAX_BACKOFF_MS);
                const errorMessage = (error.message || String(error)).slice(0, 1000);
                await prisma.hikCentralSyncQueue.update({
                    where: { id: row.id },
                    data: {
                        status: 'error',
                        attempts,
                        lastError: errorMessage,
                        // Depois de esgotar as tentativas automáticas, empurra bem pra
                        // frente — um retry manual via /retry ainda reseta attempts.
                        nextAttemptAt: new Date(Date.now() + (exhausted ? MAX_BACKOFF_MS * 48 : backoffMs)),
                    },
                });
                await this.reflectStatusOnEntity(row.entityType, row.entityId, 'error', errorMessage);
                failed++;
                console.error(
                    `[HikCentralSyncQueue] Falha ao processar ${row.entityType}/${row.entityId} (tentativa ${attempts}):`,
                    error.message,
                );
            }
        }

        return { processed: rows.length, succeeded, failed };
    }

    private static async dispatch(row: QueueRow): Promise<DispatchResult> {
        switch (row.entityType) {
            case 'SERVICE_PROVIDER':
                return this.pushServiceProvider(row);
            default:
                throw new Error(`Tipo de entidade desconhecido na fila: ${row.entityType}`);
        }
    }

    /**
     * Reflete o status da última tentativa diretamente no registro sincronizado,
     * para a UI mostrar um badge sem precisar consultar a fila. Se o registro já
     * não existir (ex.: operação de delete já removeu a linha local), ignora.
     */
    private static async reflectStatusOnEntity(
        entityType: string,
        entityId: string,
        status: string,
        error: string | null,
    ): Promise<void> {
        try {
            switch (entityType) {
                case 'SERVICE_PROVIDER':
                    await prisma.serviceProvider.update({
                        where: { id: entityId },
                        data: { hikSyncStatus: status, hikSyncError: error },
                    });
                    break;
            }
        } catch (e: any) {
            // Comum em deletes: o registro local já não existe mais. Não é erro fatal.
        }
    }

    private static async pushServiceProvider(row: QueueRow): Promise<DispatchResult> {
        if (!(await HikCentralService.isConfigured())) {
            return { notApplicable: true };
        }

        const payload = row.payload as ServiceProviderSyncPayload;

        if (row.operation === 'delete') {
            if (payload.hikcentralPersonId) {
                await HikCentralService.deletePerson(payload.hikcentralPersonId);
            }
            return { hikEntityId: payload.hikcentralPersonId || null };
        }

        const nameParts = (payload.fullName || '').trim().split(' ');
        const personGivenName = nameParts[0] || payload.fullName || 'Prestador';
        const personFamilyName = nameParts.slice(1).join(' ');

        if (!payload.hikcentralPersonId) {
            const response: any = await HikCentralService.addPerson({
                personGivenName,
                personFamilyName,
                orgIndexCode: '3', // PRESTADORES (ver HIK_ORG_ROLE_MAP em HikCentralSyncService.ts)
                phoneNo: payload.phone || undefined,
                email: payload.email || undefined,
            });
            const hikPersonId = response?.data?.personId;
            if (hikPersonId) {
                await prisma.serviceProvider.update({
                    where: { id: row.entityId },
                    data: { hikcentralPersonId: hikPersonId },
                });
            }
            return { hikEntityId: hikPersonId || null };
        }

        await HikCentralService.updatePerson({
            personId: payload.hikcentralPersonId,
            personGivenName,
            personFamilyName,
            orgIndexCode: '3',
            phoneNo: payload.phone || undefined,
            email: payload.email || undefined,
        });
        return { hikEntityId: payload.hikcentralPersonId };
    }
}
