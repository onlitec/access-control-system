import { useEffect, useState, useRef } from 'react';

export interface PassbackAlert {
    id: string;
    personId: string | null;
    personName: string;
    serial: string;
    deviceId: string | null;
    deviceName: string | null;
    unit: string | null;
    photoUrl: string | null;
    occurredAt: string;
    resolved: boolean;
}

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';

function getToken(): string {
    return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
}

async function fetchPendingAlerts(): Promise<PassbackAlert[]> {
    try {
        const res = await fetch(`${API_BASE}/guarita/passback/alerts`, {
            headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.data ?? [];
    } catch {
        return [];
    }
}

export function useGuaritaPassback() {
    const [alerts, setAlerts] = useState<PassbackAlert[]>([]);
    const esRef = useRef<EventSource | null>(null);

    useEffect(() => {
        // Carregar alertas pendentes existentes
        fetchPendingAlerts().then(setAlerts);

        // Conectar SSE
        const token = getToken();
        if (!token) return;

        const es = new EventSource(`${API_BASE}/guarita/passback/events?token=${encodeURIComponent(token)}`);
        esRef.current = es;

        es.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'passback_alert') {
                    setAlerts(prev => {
                        // Evitar duplicatas
                        if (prev.some(a => a.id === msg.data.id)) return prev;
                        return [msg.data, ...prev];
                    });
                    // Beep de alerta
                    playAlertSound();
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
    }, []);

    const release = async (alertId: string) => {
        try {
            await fetch(`${API_BASE}/guarita/passback/alerts/${alertId}/release`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            setAlerts(prev => prev.filter(a => a.id !== alertId));
        } catch (err) {
            console.error('[APB] Erro ao liberar entrada:', err);
        }
    };

    const dismiss = async (alertId: string) => {
        try {
            await fetch(`${API_BASE}/guarita/passback/alerts/${alertId}/dismiss`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            setAlerts(prev => prev.filter(a => a.id !== alertId));
        } catch (err) {
            console.error('[APB] Erro ao dispensar alerta:', err);
        }
    };

    return { alerts, release, dismiss };
}

function playAlertSound() {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    } catch { /* browser pode bloquear áudio sem interação do usuário */ }
}
