import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Download, Film, Play, RefreshCw } from 'lucide-react';
import { authRequest } from '@/services/authApi';

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';

function getToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
}

interface VmsChannel { id: string; name: string; enabled: boolean }
interface VmsDevice { id: string; name: string; channels: VmsChannel[] }

interface Recording {
  id: string;
  startedAt: string;
  endedAt: string | null;
  sizeBytes: number;
  trigger: string;
  status: string;
  channel: { id: string; name: string; streamPath: string };
  uploads: Array<{ status: string; destination: { name: string } }>;
}

const TRIGGER_LABEL: Record<string, string> = {
  continuous: 'Contínua',
  schedule: 'Agendada',
  motion: 'Movimento',
};

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function fmtDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '—';
  const sec = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(sec / 60);
  return m > 0 ? `${m}m ${sec % 60}s` : `${sec}s`;
}

export default function VmsRecordingsPage() {
  const [devices, setDevices] = useState<VmsDevice[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelId, setChannelId] = useState<string>('all');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [playing, setPlaying] = useState<Recording | null>(null);

  useEffect(() => {
    authRequest<{ devices: VmsDevice[] }>('/vms/devices')
      .then((data) => setDevices(data.devices || []))
      .catch(() => setDevices([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (channelId !== 'all') params.set('channelId', channelId);
      if (date) {
        params.set('from', new Date(`${date}T00:00:00`).toISOString());
        params.set('to', new Date(`${date}T23:59:59.999`).toISOString());
      }
      const data = await authRequest<{ recordings: Recording[] }>(`/vms/recordings?${params.toString()}`);
      setRecordings(data.recordings || []);
    } catch {
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  }, [channelId, date]);

  useEffect(() => { void load(); }, [load]);

  const channels = useMemo(
    () => devices.flatMap((d) => d.channels.map((c) => ({ ...c, deviceName: d.name }))),
    [devices],
  );

  const fileUrl = (rec: Recording, download = false) =>
    `${API_BASE}/vms/recordings/${rec.id}/file?token=${encodeURIComponent(getToken())}${download ? '&download=1' : ''}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gravações</h1>
          <p className="text-muted-foreground">Segmentos gravados pelas câmeras do condomínio.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Todas as câmeras" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as câmeras</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.deviceName} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : recordings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12">
            <Film className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhuma gravação encontrada</p>
            <p className="text-sm text-muted-foreground">
              Ajuste os filtros ou configure a gravação das câmeras no Painel Administrativo.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {recordings.map((rec) => {
              const uploaded = rec.uploads.filter((u) => u.status === 'done').length;
              const localGone = rec.status === 'deleted_local';
              return (
                <div key={rec.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{rec.channel.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(rec.startedAt).toLocaleString('pt-BR')} · {fmtDuration(rec.startedAt, rec.endedAt)} · {fmtSize(rec.sizeBytes)}
                    </p>
                  </div>
                  <Badge variant="outline">{TRIGGER_LABEL[rec.trigger] ?? rec.trigger}</Badge>
                  {rec.uploads.length > 0 && (
                    <Badge variant={uploaded === rec.uploads.length ? 'default' : 'secondary'}>
                      Nuvem {uploaded}/{rec.uploads.length}
                    </Badge>
                  )}
                  {localGone ? (
                    <Badge variant="secondary">Só remoto</Badge>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" title="Reproduzir" onClick={() => setPlaying(rec)}>
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" title="Baixar" asChild>
                        <a href={fileUrl(rec, true)} download>
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!playing} onOpenChange={(open) => { if (!open) setPlaying(null); }}>
        <DialogContent className="max-w-5xl p-2 bg-black border-none">
          <DialogTitle className="sr-only">
            {playing ? `${playing.channel.name} — ${new Date(playing.startedAt).toLocaleString('pt-BR')}` : ''}
          </DialogTitle>
          {playing && (
            <video src={fileUrl(playing)} controls autoPlay className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
