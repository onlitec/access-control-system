import React, { useEffect, useState } from 'react';
import EventDetail from './EventDetail';
import { getToken } from '../auth';
import { apiUrl } from '../tenant';

/**
 * Popup automático de eventos de câmera (VCA) no cloud. Escuta o SSE do tenant e
 * abre o detalhe (foto + vídeo ao vivo) com som quando um evento marcado como
 * "popup" chega. Igual ao comportamento do painel do operador. Montado no App,
 * vale em qualquer aba.
 */
export default function EventPopup({ enabled }) {
  const [event, setEvent] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    const url = apiUrl(`/api/events/stream?token=${encodeURIComponent(getToken())}&categories=alarm`);
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const d = msg && msg.type === 'system_event' ? msg.data : null;
        if (d && d.source === 'vms' && d.metadata && d.metadata.popup === true) {
          setEvent(d);
          beep();
        }
      } catch { /* keep-alive */ }
    };
    es.onerror = () => { /* reconecta sozinho */ };
    return () => es.close();
  }, [enabled]);

  if (!event) return null;
  return <EventDetail event={event} onClose={() => setEvent(null)} />;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
  } catch { /* navegador pode bloquear áudio sem interação */ }
}
