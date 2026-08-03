"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEventClient = registerEventClient;
exports.unregisterEventClient = unregisterEventClient;
exports.emitEvent = emitEvent;
exports.broadcastPersistedEvent = broadcastPersistedEvent;
const database_1 = require("../database");
// ── Registry SSE genérico (mesmo padrão do passback) ──────────────────────────
const sseClients = new Map();
function registerEventClient(res, categories, allowedChannelIds) {
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sseClients.set(clientId, {
        res,
        categories: categories && categories.length > 0 ? new Set(categories) : null,
        // null = sem restrição de câmera (cameraAccessAll); Set = só esses canais.
        // Só é aplicado a eventos de alarme (VCA) — outras categorias não são afetadas.
        allowedChannelIds: allowedChannelIds ?? null,
    });
    return clientId;
}
function unregisterEventClient(clientId) {
    sseClients.delete(clientId);
}
function broadcastEvent(event) {
    const payload = `data: ${JSON.stringify({ type: 'system_event', data: event })}\n\n`;
    for (const [clientId, client] of sseClients) {
        if (client.categories && !client.categories.has(event.category))
            continue;
        // alarme de VCA: só chega a quem tem permissão pra câmera de origem
        // (mesma restrição já aplicada em live/gravações). Sem channelId no
        // metadata (não deveria acontecer) não filtra, pra não engolir alerta.
        if (event.category === 'alarm' && client.allowedChannelIds) {
            const channelId = event.metadata?.channelId;
            if (channelId && !client.allowedChannelIds.has(channelId))
                continue;
        }
        try {
            client.res.write(payload);
        }
        catch {
            sseClients.delete(clientId);
        }
    }
}
setInterval(() => {
    const payload = 'data: {"type":"ping"}\n\n';
    for (const [clientId, client] of sseClients) {
        try {
            client.res.write(payload);
        }
        catch {
            sseClients.delete(clientId);
        }
    }
}, 30000);
/**
 * Ponto único de escrita de eventos do sistema: persiste como AccessEvent
 * e faz broadcast SSE para os clientes conectados em /api/events/stream.
 */
async function emitEvent(input) {
    const occurredAt = input.occurredAt ?? new Date();
    const event = await database_1.prisma.accessEvent.create({
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
            metadata: input.metadata ?? undefined,
        },
    });
    broadcastEvent(event);
    return event;
}
/** Broadcast de um evento já persistido (ex.: upsert em lote do HikCentral). */
function broadcastPersistedEvent(event) {
    broadcastEvent(event);
}
