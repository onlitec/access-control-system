import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Video, Film, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { LivePlayer } from '@/components/vms/LivePlayer';
import { authRequest } from '@/services/authApi';
import type { SystemEvent } from '@/hooks/useEventStream';

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';
function getToken() { return localStorage.getItem('auth_token') || localStorage.getItem('token') || ''; }

interface Recording { id: string; startedAt: string; endedAt: string | null }

/**
 * Detalhe de um evento de câmera (VCA): duas janelas — a FOTO do momento e o
 * VÍDEO AO VIVO da câmera do evento (a própria ou a vinculada) — e um botão
 * para ver a GRAVAÇÃO do evento. Redimensionável (botão maximizar/tela cheia).
 */
export default function EventDetailDialog({ event, onClose }: {
  event: SystemEvent | null;
  onClose: () => void;
}) {
  const meta = (event?.metadata || {}) as Record<string, unknown>;
  const streamPath = meta.streamPath as string | undefined;
  const channelName = (meta.videoChannelName || meta.channelName) as string | undefined;
  const videoChannelId = (meta.videoChannelId || meta.channelId) as string | undefined;
  const snapshotUrl = meta.snapshotUrl
    ? `${meta.snapshotUrl}?token=${encodeURIComponent(getToken())}`
    : (event?.photoUrl || undefined);

  const [clip, setClip] = useState<Recording | null>(null);
  const [clipState, setClipState] = useState<'idle' | 'loading' | 'none' | 'pending'>('idle');
  const [maximized, setMaximized] = useState(false);

  useEffect(() => { setClip(null); setClipState('idle'); }, [event?.id]);

  // acha o segmento gravado que cobre o momento do evento. Janela larga: um
  // segmento de gravação contínua pode ter COMEÇADO minutos antes do evento.
  const loadClip = useCallback(async () => {
    if (!videoChannelId || !event) return;
    setClipState('loading');
    try {
      const t = new Date(event.occurredAt).getTime();
      const from = new Date(t - 20 * 60_000).toISOString(); // até 20 min antes
      const to = new Date(t + 2 * 60_000).toISOString();
      const data = await authRequest<{ recordings: Recording[] }>(
        `/vms/recordings?channelId=${videoChannelId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      const recs = data.recordings || [];
      // o segmento cujo intervalo [início, fim] contém o instante do evento
      const hit = recs.find((r) => {
        const s = new Date(r.startedAt).getTime();
        const e = r.endedAt ? new Date(r.endedAt).getTime() : Date.now();
        return t >= s - 10_000 && t <= e + 10_000;
      });
      if (hit) { setClip(hit); setClipState('idle'); }
      // sem segmento fechado que contenha o evento: a gravação leva alguns
      // segundos para fechar e ser indexada (ou é uma gravação contínua cujo
      // arquivo do momento ainda está aberto). "Em processamento", não "nenhuma".
      else setClipState('pending');
    } catch { setClipState('none'); }
  }, [videoChannelId, event]);

  if (!event) return null;
  const clipUrl = clip ? `${API_BASE}/vms/recordings/${clip.id}/file?token=${encodeURIComponent(getToken())}` : null;
  const when = new Date(event.occurredAt).toLocaleString('pt-BR');

  return (
    <Dialog open={!!event} onOpenChange={(open) => { if (!open) { setMaximized(false); onClose(); } }}>
      <DialogContent
        className={maximized
          ? '!max-w-[98vw] w-[98vw] !h-[96vh] p-0 overflow-hidden flex flex-col'
          : '!max-w-6xl w-[92vw] p-0 overflow-hidden flex flex-col'}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0 pr-20">
          <DialogTitle className="text-base font-semibold text-red-600 truncate pr-2">
            {event.personName}
          </DialogTitle>
          <button onClick={() => setMaximized((m) => !m)} title={maximized ? 'Restaurar' : 'Maximizar'}
            className="text-zinc-400 hover:text-zinc-700 p-1 shrink-0">
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>

        <div className="px-5 pt-2 pb-1 text-xs text-zinc-500 shrink-0">
          {channelName ? <>Câmera: <strong>{channelName}</strong> · </> : null}{when}
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 p-4 ${maximized ? 'flex-1 min-h-0' : ''}`}>
          {/* foto do momento */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 mb-1.5 shrink-0">
              <Camera className="h-3.5 w-3.5" /> Foto do momento
            </div>
            <div className={`bg-black rounded-lg overflow-hidden flex items-center justify-center ${maximized ? 'flex-1 min-h-0' : 'aspect-video'}`}>
              {snapshotUrl
                ? <img src={snapshotUrl} alt="Snapshot" className="w-full h-full object-contain" />
                : <span className="text-zinc-500 text-sm">sem foto</span>}
            </div>
          </div>

          {/* vídeo ao vivo (ou gravação, se aberta) */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 mb-1.5 shrink-0">
              {clip ? <Film className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
              {clip ? 'Gravação do evento' : 'Ao vivo'}
            </div>
            <div className={`bg-black rounded-lg overflow-hidden ${maximized ? 'flex-1 min-h-0' : 'aspect-video'}`}>
              {clip && clipUrl
                ? <video src={clipUrl} controls autoPlay className="w-full h-full" />
                : streamPath
                  ? <LivePlayer streamPath={streamPath} label={channelName} fit="contain" className="w-full h-full" />
                  : <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">sem vídeo desta câmera</div>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t shrink-0">
          {clip
            ? <Button variant="secondary" size="sm" onClick={() => setClip(null)}><Video className="h-4 w-4 mr-1.5" /> Voltar ao vivo</Button>
            : (
              <Button variant="secondary" size="sm" onClick={loadClip} disabled={clipState === 'loading' || !videoChannelId}>
                {clipState === 'loading' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Film className="h-4 w-4 mr-1.5" />}
                Ver gravação do evento
              </Button>
            )}
          {clipState === 'none' && <span className="text-xs text-zinc-500">Nenhuma gravação encontrada para este evento.</span>}
          {clipState === 'pending' && <span className="text-xs text-zinc-500">A gravação deste evento ainda está sendo processada — tente novamente em alguns segundos.</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
