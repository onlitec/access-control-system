import { useEffect, useRef, useState } from 'react';
import { Camera, Wifi, WifiOff, Maximize2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DoorbellDevice {
  id: string;
  name: string;
  location?: string;
}

const API_BASE = (typeof window !== 'undefined' ? window.location.origin : '') + '/api';

function getToken() {
  return localStorage.getItem('token') || localStorage.getItem('auth_token') || '';
}

function streamUrl(deviceId: string) {
  return `${API_BASE}/doorbell/devices/${deviceId}/stream?token=${encodeURIComponent(getToken())}`;
}

function DoorbellCamera({ device }: { device: DoorbellDevice }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [online, setOnline] = useState<boolean | null>(null); // null = connecting
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep src assigned — the browser handles the MJPEG stream automatically.
  // We only need to monitor load/error to show status.
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    img.src = streamUrl(device.id);
    return () => {
      img.src = ''; // stop stream when component unmounts
    };
  }, [device.id]);

  function handleLoad() { setOnline(true); }
  function handleError() {
    setOnline(false);
    // Try reconnecting after 3s
    setTimeout(() => {
      if (imgRef.current) imgRef.current.src = streamUrl(device.id);
    }, 3000);
  }

  function toggleFullscreen() {
    if (!fullscreen) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    setFullscreen(f => !f);
  }

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {online === null && <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />}
          {online === true  && <Wifi className="h-3.5 w-3.5 text-green-500" />}
          {online === false && <WifiOff className="h-3.5 w-3.5 text-destructive" />}
          <span className="text-sm font-medium">{device.name}</span>
          {device.location && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {device.location}
            </span>
          )}
        </div>
        <button
          onClick={toggleFullscreen}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Tela cheia"
        >
          {fullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Video frame */}
      <div
        ref={containerRef}
        className="relative w-full rounded-lg overflow-hidden bg-black border border-border"
        style={{ aspectRatio: '4/3' }}
      >
        {/* MJPEG stream — browser handles continuous frame rendering natively */}
        <img
          ref={imgRef}
          alt={device.name}
          className="w-full h-full object-cover"
          onLoad={handleLoad}
          onError={handleError}
          style={{ display: online === false ? 'none' : 'block' }}
        />

        {/* Connecting overlay */}
        {online === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="h-7 w-7 animate-pulse" />
            <span className="text-xs">Conectando...</span>
          </div>
        )}

        {/* Offline overlay */}
        {online === false && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <WifiOff className="h-7 w-7 text-destructive/60" />
            <span className="text-xs text-destructive/80">Sem sinal</span>
            <span className="text-xs text-muted-foreground">Reconectando...</span>
          </div>
        )}

        {/* Live badge */}
        {online === true && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm pointer-events-none">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            AO VIVO
          </div>
        )}
      </div>
    </div>
  );
}

export function DoorbellWidget() {
  const [devices, setDevices] = useState<DoorbellDevice[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/doorbell/devices`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(data => setDevices(data.devices ?? []))
      .catch(() => setDevices([]))
      .finally(() => setReady(true));
  }, []);

  if (!ready || devices.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Camera className="h-4 w-4 text-muted-foreground" />
          Videoporteiro
        </CardTitle>
        <span className="text-xs text-muted-foreground">Transmissão ao vivo</span>
      </CardHeader>
      <CardContent className={devices.length > 1 ? 'grid grid-cols-2 gap-4' : ''}>
        {devices.map(device => (
          <DoorbellCamera key={device.id} device={device} />
        ))}
      </CardContent>
    </Card>
  );
}
