import { useEffect, useRef } from 'react';

export interface SystemEvent {
    id: string;
    occurredAt: string;
    personName: string;
    personType: string;
    personId: string | null;
    unit: string | null;
    deviceName: string | null;
    status: string; // authorized | denied | pending
    photoUrl: string | null;
    picUri: string | null;
    notes: string | null;
    direction: string | null; // in | out
    category: string; // access | delivery | gate | alarm | device | system
    source: string | null; // hikcentral | guarita | videoporteiro | qr_code | manual | controle_rf
    metadata: Record<string, unknown> | null;
}

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';

function getToken(): string {
    return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
}

/**
 * Conecta ao SSE da Central de Eventos (/api/events/stream) e invoca o callback
 * a cada evento novo. Mesmo padrão do useGuaritaPassback (EventSource reconecta sozinho).
 */
export function useEventStream(onEvent: (event: SystemEvent) => void, categories?: string[]) {
    const esRef = useRef<EventSource | null>(null);
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    const categoriesKey = categories?.join(',') ?? '';

    useEffect(() => {
        const token = getToken();
        if (!token) return;

        const params = new URLSearchParams({ token });
        if (categoriesKey) params.set('categories', categoriesKey);

        const es = new EventSource(`${API_BASE}/events/stream?${params.toString()}`);
        esRef.current = es;

        es.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'system_event' && msg.data) {
                    onEventRef.current(msg.data as SystemEvent);
                }
            } catch { /* ignora frames malformados */ }
        };

        es.onerror = () => {
            // EventSource reconecta automaticamente; sem ação necessária
        };

        return () => {
            es.close();
            esRef.current = null;
        };
    }, [categoriesKey]);
}
