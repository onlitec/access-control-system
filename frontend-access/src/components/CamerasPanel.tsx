import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Camera } from 'lucide-react';

interface DoorbellDevice {
  id: string;
  name: string;
  location?: string;
}

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';

function getToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
}

/** Miniatura com snapshot atualizado por polling (fetch com Bearer → blob URL). */
function CameraThumb({ device, onClick, refreshMs = 5000 }: { device: DoorbellDevice; onClick: () => void; refreshMs?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const capture = async () => {
      try {
        const res = await fetch(`${API_BASE}/doorbell/devices/${device.id}/snapshot`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (!active) return;
        const url = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setSrc(url);
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      }
    };

    capture();
    const timer = setInterval(capture, refreshMs);
    return () => {
      active = false;
      clearInterval(timer);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [device.id, refreshMs]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100 aspect-video group text-left w-full"
      title={`Expandir ${device.name}`}
    >
      {src && !failed ? (
        <img src={src} alt={device.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-zinc-300">
          <Camera className="h-6 w-6" />
        </div>
      )}
      <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/90 text-[9px] font-bold uppercase tracking-wider text-red-600 border border-red-100">
        <span className={`h-1 w-1 rounded-full ${failed ? 'bg-zinc-400' : 'bg-red-600 animate-pulse'}`} />
        {failed ? 'Offline' : 'Ao vivo'}
      </span>
      <span className="absolute bottom-0 inset-x-0 px-2 py-1 bg-gradient-to-t from-black/60 to-transparent text-white text-[11px] font-semibold truncate">
        {device.name}
      </span>
    </button>
  );
}

/** Painel "Câmeras Principais": miniaturas por snapshot; clique abre stream MJPEG. */
export function CamerasPanel({ maxCameras = 3 }: { maxCameras?: number }) {
  const [devices, setDevices] = useState<DoorbellDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<DoorbellDevice | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/doorbell/devices`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(res => (res.ok ? res.json() : { devices: [] }))
      .then(data => setDevices((data.devices || []).slice(0, maxCameras)))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false));
  }, [maxCameras]);

  if (!loading && devices.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Câmeras Principais</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-1 gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video w-full rounded-xl bg-zinc-100" />
            ))}
          </div>
        ) : (
          <div className={`grid gap-3 ${devices.length > 1 ? 'grid-cols-2 xl:grid-cols-1' : 'grid-cols-1'}`}>
            {devices.map(device => (
              <CameraThumb key={device.id} device={device} onClick={() => setExpanded(device)} />
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!expanded} onOpenChange={(open) => { if (!open) setExpanded(null); }}>
        <DialogContent className="max-w-4xl p-2 bg-black border-none">
          <DialogTitle className="sr-only">{expanded?.name}</DialogTitle>
          {expanded && (
            <img
              src={`${API_BASE}/doorbell/devices/${expanded.id}/stream?token=${encodeURIComponent(getToken())}`}
              alt={expanded.name}
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
