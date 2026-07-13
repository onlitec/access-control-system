import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, Camera } from 'lucide-react';
import EventDetail from '../components/EventDetail';
import { authFetch, getToken } from '../auth';
import { apiUrl } from '../tenant';

/**
 * Central de eventos do cloud: lista os eventos (câmeras/alarmes) do servidor do
 * tenant, atualiza em tempo real por SSE e abre o detalhe (foto + vídeo ao vivo
 * + gravação) ao clicar num evento de câmera.
 */
export default function EventsView() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const esRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await authFetch('/api/events?page=1&limit=60');
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      setEvents(data.data || data.events || []);
    } catch (e) { setError(e.message || 'Falha ao carregar eventos'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // tempo real (SSE) — EventSource não manda header, o token vai na query
  useEffect(() => {
    const url = apiUrl(`/api/events/stream?token=${encodeURIComponent(getToken())}&categories=alarm`);
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'system_event' && msg.data) {
          setEvents((prev) => prev.some((e) => e.id === msg.data.id) ? prev : [msg.data, ...prev].slice(0, 100));
        }
      } catch { /* keep-alive/connected */ }
    };
    es.onerror = () => { /* EventSource reconecta sozinho */ };
    return () => { es.close(); esRef.current = null; };
  }, []);

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', gap: 8, alignItems: 'center' }}><AlertTriangle size={18} /> Eventos</h2>
        <button onClick={load} title="Atualizar" style={{ background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, padding: 6, cursor: 'pointer' }}>
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: '0.85rem', marginBottom: 10 }}>{error}</div>}
      {!loading && events.length === 0 && <p style={{ color: '#9ca3af', textAlign: 'center', padding: 30 }}>Nenhum evento ainda.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {events.map((e) => {
          const meta = e.metadata || {};
          const isCam = e.source === 'vms';
          const snap = meta.snapshotUrl ? apiUrl(`${meta.snapshotUrl}?token=${encodeURIComponent(getToken())}`) : null;
          return (
            <div key={e.id}
              onClick={isCam ? () => setDetail(e) : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
                background: '#14161a', border: '1px solid #23262d', cursor: isCam ? 'pointer' : 'default',
              }}>
              <div style={{ width: 54, textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#cbd5e1' }}>
                  {new Date(e.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div style={{ fontSize: '0.62rem', color: '#6b7280' }}>{new Date(e.occurredAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</div>
              </div>
              {snap
                ? <img src={snap} alt="" style={{ height: 42, width: 64, objectFit: 'cover', borderRadius: 6, background: '#000', flexShrink: 0 }} />
                : <div style={{ height: 42, width: 42, borderRadius: '50%', background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Camera size={18} color="#9ca3af" /></div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: e.category === 'alarm' ? '#f87171' : '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.personName}</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{e.deviceName || ''}{isCam ? ' · toque para ver ao vivo' : ''}</div>
              </div>
            </div>
          );
        })}
      </div>

      {detail && <EventDetail event={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
