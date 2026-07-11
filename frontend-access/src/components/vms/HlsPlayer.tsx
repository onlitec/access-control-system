import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera } from 'lucide-react';

function getToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
}

/** Anexa o JWT como query (?jwt=) — o MediaMTX valida via stream-auth no backend. */
function withJwt(url: string): string {
  const u = new URL(url, window.location.origin);
  if (!u.searchParams.has('jwt')) u.searchParams.set('jwt', getToken());
  return u.toString();
}

interface HlsPlayerProps {
  /** URL do playlist HLS (ex.: /streams/cam-portaria/index.m3u8) */
  src: string;
  className?: string;
  muted?: boolean;
  /** rótulo exibido na tarja inferior */
  label?: string;
  /** "cover" preenche a célula como um NVR; "contain" mostra o quadro inteiro */
  fit?: 'cover' | 'contain';
  /** posição do rótulo — NVR usa o canto inferior direito */
  labelPosition?: 'left' | 'right';
}

/**
 * Player HLS (MediaMTX low-latency) com reconexão automática. Cada requisição
 * (playlist e segmentos) recebe o JWT via query, pois <video>/hls.js não
 * enviam header Authorization.
 */
export function HlsPlayer({ src, className, muted = true, label, fit = 'contain', labelPosition = 'left' }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const start = () => {
      if (disposed || !videoRef.current) return;
      setFailed(false);

      if (Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: true,
          liveDurationInfinity: true,
          xhrSetup: (xhr, url) => {
            xhr.open('GET', withJwt(url), true);
          },
        });
        hls.loadSource(withJwt(src));
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play().catch(() => { /* autoplay bloqueado */ });
        });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          hls?.destroy();
          hls = null;
          setFailed(true);
          retryTimer = setTimeout(start, 5000); // câmera pode estar religando
        });
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari: HLS nativo
        videoRef.current.src = withJwt(src);
        videoRef.current.play().catch(() => { /* autoplay bloqueado */ });
      } else {
        setFailed(true);
      }
    };

    start();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      hls?.destroy();
    };
  }, [src]);

  return (
    <div className={`relative bg-black overflow-hidden ${className ?? ''}`}>
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
      />
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-500">
          <Camera className="h-8 w-8" />
          <span className="text-xs">Sem sinal — reconectando…</span>
        </div>
      )}
      {label && (
        // estilo NVR: texto solto sobre o vídeo, com sombra para legibilidade
        <span
          className={`absolute bottom-1 ${labelPosition === 'right' ? 'right-2' : 'left-2'} max-w-[90%] truncate text-white text-[11px] font-medium tracking-wide pointer-events-none`}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
