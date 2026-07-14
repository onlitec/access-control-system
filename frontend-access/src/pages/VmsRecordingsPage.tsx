import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Camera, ChevronLeft, ChevronRight, Download, Film, Flag, FlagOff,
  Maximize2, Pause, Play, RefreshCw, StepBack, StepForward,
} from 'lucide-react';
import { authRequest } from '@/services/authApi';
import RecordingTimeline, { TimelineInterval } from '@/components/vms/RecordingTimeline';

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';
// Janela pedida ao playback server a cada trecho. 30min casa com o tamanho do
// segmento: o /get devolve um trecho contínuo por vez e emendamos no gap.
const WINDOW_SEC = 1800;
const RATES = [0.25, 0.5, 1, 2, 4, 8];
const FRAME = 1 / 15; // passo de ~1 frame para as câmeras (fps baixo)

function getToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
}

interface VmsChannel { id: string; name: string }
interface VmsDevice { id: string; name: string; channels: VmsChannel[] }

function pad(n: number) { return String(n).padStart(2, '0'); }
function hms(ms: number | null): string {
  if (ms == null) return '--:--:--';
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtDur(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
/** value para <input type=datetime-local step=1> a partir de ms epoch (local). */
function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 19);
}

export default function VmsRecordingsPage() {
  const [devices, setDevices] = useState<VmsDevice[]>([]);
  const [channelId, setChannelId] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [intervals, setIntervals] = useState<TimelineInterval[]>([]);
  const [loading, setLoading] = useState(false);

  const [windowStartMs, setWindowStartMs] = useState<number | null>(null);
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [zoomH, setZoomH] = useState(24);
  const [inMs, setInMs] = useState<number | null>(null);
  const [outMs, setOutMs] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const dayStartMs = useMemo(() => new Date(`${date}T00:00:00`).getTime(), [date]);
  const dayEndMs = dayStartMs + 24 * 3600e3;

  // câmeras
  useEffect(() => {
    authRequest<{ devices: VmsDevice[] }>('/vms/devices')
      .then((d) => {
        setDevices(d.devices || []);
        if (!channelId && d.devices?.[0]?.channels?.[0]) setChannelId(d.devices[0].channels[0].id);
      })
      .catch(() => setDevices([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const channels = useMemo(
    () => devices.flatMap((d) => d.channels.map((c) => ({ ...c, deviceName: d.name }))),
    [devices],
  );
  const currentChannel = channels.find((c) => c.id === channelId);

  // linha do tempo do dia
  const loadTimeline = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    setErr('');
    try {
      const params = new URLSearchParams({
        channelId,
        from: new Date(`${date}T00:00:00`).toISOString(),
        to: new Date(`${date}T23:59:59.999`).toISOString(),
      });
      const data = await authRequest<{ intervals: TimelineInterval[] }>(`/vms/playback/timeline?${params}`);
      setIntervals(data.intervals || []);
    } catch (e: any) {
      setIntervals([]);
      setErr(e?.message || 'Falha ao carregar');
    } finally {
      setLoading(false);
    }
  }, [channelId, date]);

  useEffect(() => {
    setWindowStartMs(null); setPlayheadMs(null); setPlaying(false); setInMs(null); setOutMs(null);
    void loadTimeline();
  }, [loadTimeline]);

  // primeiro instante gravável a partir de ms (dentro de um trecho, ou o próximo)
  const playableAt = useCallback((ms: number): number | null => {
    for (const iv of intervals) {
      const a = new Date(iv.start).getTime(), b = new Date(iv.end).getTime();
      if (ms >= a - 1000 && ms < b) return Math.max(ms, a);
    }
    let next: number | null = null;
    for (const iv of intervals) {
      const a = new Date(iv.start).getTime();
      if (a > ms && (next == null || a < next)) next = a;
    }
    return next;
  }, [intervals]);

  const streamUrl = (ms: number) =>
    `${API_BASE}/vms/playback/stream?channelId=${channelId}&start=${encodeURIComponent(new Date(ms).toISOString())}` +
    `&duration=${WINDOW_SEC}&token=${encodeURIComponent(getToken())}`;

  // posiciona a reprodução num instante (encaixa no trecho gravado mais próximo)
  const seek = useCallback((ms: number, autoplay = true) => {
    const p = playableAt(ms);
    const target = p ?? ms;
    setWindowStartMs(target);
    setPlayheadMs(target);
    setPlaying(autoplay);
    setErr('');
  }, [playableAt]);

  // ao carregar o vídeo, aplica taxa/estado
  const onLoaded = () => {
    const v = videoRef.current; if (!v) return;
    v.playbackRate = rate;
    if (playing) v.play().catch(() => {});
  };

  const onTimeUpdate = () => {
    const v = videoRef.current; if (!v || windowStartMs == null) return;
    setPlayheadMs(windowStartMs + v.currentTime * 1000);
  };

  // fim do trecho: emenda o próximo (contínuo ou salta o gap)
  const onEnded = () => {
    const v = videoRef.current;
    if (!v || windowStartMs == null) { setPlaying(false); return; }
    const nextMs = windowStartMs + Math.round(v.duration * 1000);
    const p = playableAt(nextMs + 200);
    if (p != null) seek(p, true); else setPlaying(false);
  };

  const onError = () => {
    // trecho sem gravação (gap) → tenta o próximo
    if (windowStartMs == null) return;
    const p = playableAt(windowStartMs + WINDOW_SEC * 1000);
    if (p != null && p !== windowStartMs) seek(p, true);
    else { setPlaying(false); setErr('Sem gravação neste ponto.'); }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (windowStartMs == null) {
      const first = intervals[0] ? new Date(intervals[0].start).getTime() : null;
      if (first != null) seek(first, true);
      return;
    }
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const changeRate = (r: number) => { setRate(r); if (videoRef.current) videoRef.current.playbackRate = r; };
  const nudge = (deltaSec: number) => {
    const v = videoRef.current; if (!v) return;
    v.pause(); setPlaying(false);
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + deltaSec));
  };

  const snapshot = () => {
    const v = videoRef.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/jpeg', 0.92);
    a.download = `${currentChannel?.name || 'camera'}_${hms(playheadMs).replace(/:/g, '-')}.jpg`;
    a.click();
  };

  const goFullscreen = () => { void shellRef.current?.requestFullscreen?.(); };

  const seekToInput = (val: string) => { if (val) seek(new Date(val).getTime(), false); };

  const selSec = inMs != null && outMs != null ? (outMs - inMs) / 1000 : 0;

  const exportEvidence = async () => {
    if (inMs == null || outMs == null || outMs <= inMs) return;
    setExporting(true); setErr('');
    try {
      const url = `${API_BASE}/vms/playback/export?channelId=${channelId}` +
        `&start=${encodeURIComponent(new Date(inMs).toISOString())}` +
        `&duration=${Math.round((outMs - inMs) / 1000)}&download=1&token=${encodeURIComponent(getToken())}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erro ${r.status}`);
      const blob = await r.blob();
      const dispo = r.headers.get('content-disposition') || '';
      const name = /filename="([^"]+)"/.exec(dispo)?.[1] || `evidencia_${Date.now()}.mp4`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e: any) {
      setErr(e?.message || 'Falha ao exportar evidência');
    } finally {
      setExporting(false);
    }
  };

  // janela visível da régua conforme o zoom (segue o playhead quando ampliado)
  const [viewStartMs, viewEndMs] = useMemo(() => {
    const span = zoomH * 3600e3;
    if (zoomH >= 24) return [dayStartMs, dayEndMs];
    const center = playheadMs ?? dayStartMs + 12 * 3600e3;
    let start = center - span / 2;
    start = Math.max(dayStartMs, Math.min(start, dayEndMs - span));
    return [start, start + span];
  }, [zoomH, playheadMs, dayStartMs, dayEndMs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gravações</h1>
          <p className="text-sm text-muted-foreground">Reprodução contínua, recorte e exportação de evidência.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Câmera" /></SelectTrigger>
            <SelectContent>
              {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.deviceName} — {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          <Button variant="outline" size="icon" onClick={() => void loadTimeline()} disabled={loading} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* player */}
      <div ref={shellRef} className="rounded-lg bg-black overflow-hidden">
        <div className="relative aspect-video bg-black flex items-center justify-center">
          {windowStartMs != null ? (
            <video
              ref={videoRef}
              key={windowStartMs}
              src={streamUrl(windowStartMs)}
              className="h-full w-full object-contain"
              autoPlay={playing}
              playsInline
              onLoadedMetadata={onLoaded}
              onTimeUpdate={onTimeUpdate}
              onEnded={onEnded}
              onError={onError}
              onClick={togglePlay}
            />
          ) : (
            <div className="flex flex-col items-center text-muted-foreground">
              <Film className="h-10 w-10 mb-2" />
              <p className="text-sm">{loading ? 'Carregando…' : intervals.length ? 'Clique na linha do tempo ou em play' : 'Nenhuma gravação neste dia'}</p>
            </div>
          )}
          <div className="absolute top-2 left-3 rounded bg-black/60 px-2 py-0.5 text-xs text-white font-mono">
            {currentChannel?.name} · {hms(playheadMs)}
          </div>
        </div>
      </div>

      {/* controles */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" size="icon" title="-10s" onClick={() => nudge(-10)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" title="Frame anterior" onClick={() => nudge(-FRAME)}><StepBack className="h-4 w-4" /></Button>
        <Button variant="default" size="icon" title={playing ? 'Pausar' : 'Reproduzir'} onClick={togglePlay}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="icon" title="Próximo frame" onClick={() => nudge(FRAME)}><StepForward className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" title="+10s" onClick={() => nudge(10)}><ChevronRight className="h-4 w-4" /></Button>

        <Select value={String(rate)} onValueChange={(v) => changeRate(Number(v))}>
          <SelectTrigger className="w-20 h-9" title="Velocidade"><SelectValue /></SelectTrigger>
          <SelectContent>{RATES.map((r) => <SelectItem key={r} value={String(r)}>{r}×</SelectItem>)}</SelectContent>
        </Select>

        <Button variant="outline" size="icon" title="Capturar imagem" onClick={snapshot}><Camera className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" title="Tela cheia" onClick={goFullscreen}><Maximize2 className="h-4 w-4" /></Button>

        <div className="mx-1 h-6 w-px bg-border" />
        <Input
          type="datetime-local" step={1}
          value={playheadMs != null ? toLocalInput(playheadMs) : ''}
          onChange={(e) => seekToInput(e.target.value)}
          className="w-52 h-9"
          title="Ir para data/hora exata"
        />

        <div className="ml-auto flex items-center gap-1.5">
          {[1, 6, 24].map((z) => (
            <Button key={z} variant={zoomH === z ? 'default' : 'outline'} size="sm" className="h-9 px-2" onClick={() => setZoomH(z)}>
              {z === 24 ? '24h' : `${z}h`}
            </Button>
          ))}
        </div>
      </div>

      {/* seleção de evidência */}
      <div className="flex items-center gap-2 flex-wrap rounded-md border p-2">
        <Button variant="outline" size="sm" onClick={() => setInMs(playheadMs)} disabled={playheadMs == null} title="Marcar início da evidência">
          <Flag className="h-4 w-4 mr-1" /> Marcar início
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOutMs(playheadMs)} disabled={playheadMs == null} title="Marcar fim da evidência">
          <FlagOff className="h-4 w-4 mr-1" /> Marcar fim
        </Button>
        <span className="text-sm text-muted-foreground font-mono">
          {inMs != null ? hms(inMs) : '--:--:--'} → {outMs != null ? hms(outMs) : '--:--:--'}
          {selSec > 0 && <span className="ml-2 text-foreground">({fmtDur(selSec)})</span>}
        </span>
        {(inMs != null || outMs != null) && (
          <Button variant="ghost" size="sm" onClick={() => { setInMs(null); setOutMs(null); }}>Limpar</Button>
        )}
        <Button
          className="ml-auto" size="sm"
          onClick={exportEvidence}
          disabled={exporting || inMs == null || outMs == null || outMs <= inMs}
        >
          {exporting
            ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Gerando evidência…</>
            : <><Download className="h-4 w-4 mr-1" /> Exportar evidência</>}
        </Button>
      </div>

      {/* linha do tempo */}
      <RecordingTimeline
        viewStartMs={viewStartMs}
        viewEndMs={viewEndMs}
        intervals={intervals}
        playheadMs={playheadMs}
        inMs={inMs}
        outMs={outMs}
        onSeek={(ms) => seek(ms, false)}
      />

      {err && <p className="text-sm text-destructive">{err}</p>}
      <p className="text-xs text-muted-foreground">
        A evidência exportada tem a data/hora e o nome da câmera gravados na imagem.
        Trechos com pequenas falhas de gravação são emendados automaticamente.
      </p>
    </div>
  );
}
