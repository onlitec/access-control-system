import { useCallback, useState } from 'react';
import { useEventStream, type SystemEvent } from '@/hooks/useEventStream';
import EventDetailDialog from '@/components/EventDetailDialog';

/**
 * Popup automático de eventos de câmera (VCA) no painel do operador. Escuta o
 * SSE de eventos e, quando um evento de câmera marcado com `popup` chega, abre
 * o detalhe (foto + vídeo ao vivo) e toca um alerta sonoro. Montado no
 * AppLayout, funciona em qualquer tela. Só dispara para eventos configurados
 * como popup no admin (metadata.popup === true).
 */
export default function VcaEventPopup() {
  const [event, setEvent] = useState<SystemEvent | null>(null);

  const onEvent = useCallback((e: SystemEvent) => {
    const meta = (e.metadata || {}) as Record<string, unknown>;
    if (e.source !== 'vms' || meta.popup !== true) return;
    setEvent(e);   // o último evento vence (o operador fecha para ver o próximo)
    beep();
  }, []);

  useEventStream(onEvent, ['alarm']);

  return <EventDetailDialog event={event} onClose={() => setEvent(null)} />;
}

/** Bipe curto de alerta (mesmo padrão do anti-passback). */
function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
  } catch { /* navegador pode bloquear áudio sem interação */ }
}
