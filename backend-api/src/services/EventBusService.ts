import { Response } from 'express';
import { prisma } from '../database';

export type EventCategory = 'access' | 'delivery' | 'gate' | 'alarm' | 'device' | 'system';

export interface EmitEventInput {
    id?: string;
    occurredAt?: Date;
    personName: string;
    personType?: string; // resident | visitor | provider_condo | provider_resident | staff | system
    personId?: string | null;
    unit?: string | null;
    operatorId?: string | null;
    deviceName?: string | null;
    status?: string; // authorized | denied | pending
    photoUrl?: string | null;
    notes?: string | null;
    direction?: string | null; // in | out
    category?: EventCategory;
    source?: string | null; // hikcentral | guarita | videoporteiro | qr_code | manual | controle_rf
    metadata?: Record<string, unknown> | null;
    // legados
    eventTime?: Date;
    doorName?: string | null;
    eventType?: string | null;
    picUri?: string | null;
}

// ── Registry SSE genérico (mesmo padrão do passback) ──────────────────────────
const sseClients = new Map<string, { res: Response; categories: Set<string> | null }>();

export function registerEventClient(res: Response, categories?: string[]): string {
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sseClients.set(clientId, {
        res,
        categories: categories && categories.length > 0 ? new Set(categories) : null,
    });
    return clientId;
}

export function unregisterEventClient(clientId: string) {
    sseClients.delete(clientId);
}

function broadcastEvent(event: { category: string } & Record<string, unknown>) {
    const payload = `data: ${JSON.stringify({ type: 'system_event', data: event })}\n\n`;
    for (const [clientId, client] of sseClients) {
        if (client.categories && !client.categories.has(event.category)) continue;
        try {
            client.res.write(payload);
        } catch {
            sseClients.delete(clientId);
        }
    }
}

setInterval(() => {
    const payload = 'data: {"type":"ping"}\n\n';
    for (const [clientId, client] of sseClients) {
        try {
            client.res.write(payload);
        } catch {
            sseClients.delete(clientId);
        }
    }
}, 30_000);

/**
 * Ponto único de escrita de eventos do sistema: persiste como AccessEvent
 * e faz broadcast SSE para os clientes conectados em /api/events/stream.
 */
export async function emitEvent(input: EmitEventInput) {
    const occurredAt = input.occurredAt ?? new Date();
    const event = await prisma.accessEvent.create({
        data: {
            ...(input.id ? { id: input.id } : {}),
            occurredAt,
            eventTime: input.eventTime ?? occurredAt,
            personName: input.personName,
            personType: input.personType ?? 'visitor',
            personId: input.personId ?? null,
            unit: input.unit ?? null,
            operatorId: input.operatorId ?? null,
            deviceName: input.deviceName ?? null,
            doorName: input.doorName ?? null,
            status: input.status ?? 'authorized',
            photoUrl: input.photoUrl ?? null,
            picUri: input.picUri ?? null,
            notes: input.notes ?? null,
            eventType: input.eventType ?? null,
            direction: input.direction ?? null,
            category: input.category ?? 'access',
            source: input.source ?? null,
            metadata: (input.metadata as any) ?? undefined,
        },
    });
    broadcastEvent(event as any);
    return event;
}

/** Broadcast de um evento já persistido (ex.: upsert em lote do HikCentral). */
export function broadcastPersistedEvent(event: { category: string } & Record<string, unknown>) {
    broadcastEvent(event);
}
