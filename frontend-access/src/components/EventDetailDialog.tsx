import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Video, Film, Loader2, X } from 'lucide-react';
import { LivePlayer } from '@/components/vms/LivePlayer';
import { authRequest } from '@/services/authApi';
import type { SystemEvent } from '@/hooks/useEventStream';

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';
function getToken() { return localStorage.getItem('auth_token') || localStorage.getItem('token') || ''; }

interface Recording { id: string; startedAt: string; endedAt: string | null }

/**
 * Detalhe de um evento de câmera (VCA): duas janelas — a FOTO do momento e o
 * VÍDEO AO VIVO da câmera do evento (a própria ou a vinculada) — e um botão
 * para ver a GRAVAÇÃO do evento (resolvida por câmera + janela de tempo).
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
  const [clipState, setClipState] = useState<'idle' | 'loading' | 'none'>('idle');

  useEffect(() => { setClip(null); setClipState('idle'); }, [event?.id]);

  // acha o segmento gravado que cobre o momento do evento
  const loadClip = useCallback(async () => {
    if (!videoChannelId || !event) return;
    setClipState('loading');
    try {
      const t = new Date(event.occurredAt).getTime();
      const from = new Date(t - 10_000).toISOString();
      const to = new Date(t + 5 * 60_000).toISOString();
      const data = await authRequest<{ recordings: Recording[] }>(
        `/vms/recordings?channelId=${videoChannelId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      const recs = data.recordings || [];
      // o que contém o instante do evento (ou o mais próximo depois)
      const hit = recs.find((r) => {
        const s = new Date(r.startedAt).getTime();
        const e = r.endedAt ? new Date(r.endedAt).getTime() : s + 15 * 60_000;
        return t >= s - 10_000 && t <= e + 10_000;
      }) || recs[0];
      if (hit) { setClip(hit); setClipState('idle'); }
      else setClipState('none');
    } catch { setClipState('none'); }
  }, [videoChannelId, event]);

  if (!event) return null;
  const clipUrl = clip ? `${API_BASE}/vms/recordings/${clip.id}/file?token=${encodeURIComponent(getToken())}` : null;
  const when = new Date(event.occurredAt).toLocaleString('pt-BR');

  return (
    <Dialog open={!!event} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <DialogTitle className="text-base font-semibold text-red-600">
            {event.personName}
          </DialogTitle>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 pt-2 pb-1 text-xs text-zinc-500">
          {channelName ? <>Câmera: <strong>{channelName}</strong> · </> : null}{when}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
          {/* foto do momento */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 mb-1.5">
              <Camera className="h-3.5 w-3.5" /> Foto do momento
            </div>
            <div className="aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
              {snapshotUrl
                ? <img src={snapshotUrl} alt="Snapshot" className="w-full h-full object-contain" />
                : <span className="text-zinc-500 text-sm">sem foto</span>}
            </div>
          </div>

          {/* vídeo ao vivo (ou gravação, se aberta) */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 mb-1.5">
              {clip ? <Film className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
              {clip ? 'Gravação do evento' : 'Ao vivo'}
            </div>
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              {clip && clipUrl
                ? <video src={clipUrl} controls autoPlay className="w-full h-full" />
                : streamPath
                  ? <LivePlayer streamPath={streamPath} label={channelName} fit="contain" className="w-full h-full" />
                  : <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">sem vídeo desta câmera</div>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t">
          {clip
            ? <Button variant="secondary" size="sm" onClick={() => setClip(null)}><Video className="h-4 w-4 mr-1.5" /> Voltar ao vivo</Button>
            : (
              <Button variant="secondary" size="sm" onClick={loadClip} disabled={clipState === 'loading' || !videoChannelId}>
                {clipState === 'loading' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Film className="h-4 w-4 mr-1.5" />}
                Ver gravação do evento
              </Button>
            )}
          {clipState === 'none' && <span className="text-xs text-zinc-500">Nenhuma gravação encontrada para este evento.</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
