import { forwardRef, memo, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera } from 'lucide-react';

export interface LivePlayerHandle {
  /** Baixa o frame atual como JPG (o "print" dos NVRs). */
  snapshot: (name?: string) => boolean;
  /** Frame atual como data URL — usado de fundo enquanto outro stream conecta. */
  frame: () => string | null;
}

/** Captura o frame atual como data URL (para o "poster" de transição). */
function captureFrame(video: HTMLVideoElement | null): string | null {
  if (!video || !video.videoWidth) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  }
}

/**
 * Captura o frame atual do <video> num canvas e baixa como JPG. Funciona porque
 * o vídeo vem da mesma origem (o canvas não fica "tainted").
 */
function snapshotVideo(video: HTMLVideoElement | null, name = 'camera'): boolean {
  if (!video || !video.videoWidth) return false;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'camera';

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}_${stamp}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/jpeg', 0.92);

  return true;
}

function getToken() {
  return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
}

/** Anexa o JWT como query (?jwt=) — o MediaMTX valida via stream-auth no backend. */
function withJwt(url: string): string {
  const u = new URL(url, window.location.origin);
  if (!u.searchParams.has('jwt')) u.searchParams.set('jwt', getToken());
  return u.toString();
}

/** Espera o ICE terminar de coletar os candidatos (WHEP non-trickle). */
/**
 * Espera candidatos ICE "suficientes" — não o gathering completo.
 * Na LAN o candidato "host" (que é o que conecta) sai em milissegundos;
 * aguardar o ICE terminar só atrasava a primeira imagem.
 */
function waitIceReady(pc: RTCPeerConnection, { minMs = 100, maxMs = 700 } = {}): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();

  return new Promise((resolve) => {
    let usable = false;
    const started = Date.now();

    const finish = () => {
      pc.removeEventListener('icegatheringstatechange', onState);
      pc.removeEventListener('icecandidate', onCand);
      clearTimeout(hardTimer);
      resolve();
    };

    const onCand = (e: RTCPeerConnectionIceEvent) => {
      if (!e.candidate) return finish(); // gathering acabou
      const c = e.candidate.candidate || '';
      if (c.includes('typ host') || c.includes('typ srflx') || c.includes('typ relay')) {
        usable = true;
        const elapsed = Date.now() - started;
        setTimeout(finish, Math.max(0, minMs - elapsed));
      }
    };
    const onState = () => { if (pc.iceGatheringState === 'complete') finish(); };

    pc.addEventListener('icecandidate', onCand);
    pc.addEventListener('icegatheringstatechange', onState);
    const hardTimer = setTimeout(() => { if (!usable) finish(); else finish(); }, maxMs);
  });
}

interface LivePlayerProps {
  /** path do stream no MediaMTX (ex.: "camera" ou "camera-sub") */
  streamPath: string;
  className?: string;
  muted?: boolean;
  label?: string;
  /** "cover" preenche a célula como um NVR; "contain" mostra o quadro inteiro */
  fit?: 'cover' | 'contain';
  labelPosition?: 'left' | 'right';
  /** último frame da mesma câmera: evita a tela preta enquanto o HD conecta */
  poster?: string | null;
}

type Transport = 'webrtc' | 'hls' | null;

/**
 * Player de vídeo ao vivo. Tenta WebRTC (WHEP) primeiro — latência abaixo de
 * 1s, contra 2-4s do HLS — e cai para HLS automaticamente se o WebRTC falhar
 * (navegador antigo, UDP bloqueado na rede). Reconecta sozinho.
 */
/**
 * memo: o videowall re-renderiza a cada atualização de status (30s), seleção de
 * quadro, toque longo etc. Sem isto o player refazia trabalho a cada interação.
 */
const LivePlayerBase = forwardRef<LivePlayerHandle, LivePlayerProps>(function LivePlayer({
  streamPath, className, muted = true, label, fit = 'contain', labelPosition = 'left', poster = null,
}, ref) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [transport, setTransport] = useState<Transport>(null);

  // expõe a captura de frame para o print e para a transição ao ampliar
  useImperativeHandle(ref, () => ({
    snapshot: (name?: string) => snapshotVideo(videoRef.current, name ?? label ?? 'camera'),
    frame: () => captureFrame(videoRef.current),
  }), [label]);

  /**
   * Navegadores pausam o vídeo ao entrar em tela cheia, girar a tela ou quando
   * a aba vai para segundo plano — e não retomam sozinhos. Sem isto a imagem
   * "some" a cada interação. A conexão continua viva; basta mandar tocar.
   */
  useEffect(() => {
    const resume = () => {
      const v = videoRef.current;
      if (!v || document.hidden) return;
      if (v.paused && (v.srcObject || v.src || v.currentSrc)) {
        v.play().catch(() => { /* autoplay bloqueado */ });
      }
    };
    const events = ['orientationchange', 'fullscreenchange', 'resize', 'pageshow'];
    events.forEach((e) => window.addEventListener(e, resume));
    document.addEventListener('visibilitychange', resume);
    const v = videoRef.current;
    v?.addEventListener('pause', resume);

    return () => {
      events.forEach((e) => window.removeEventListener(e, resume));
      document.removeEventListener('visibilitychange', resume);
      v?.removeEventListener('pause', resume);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let pc: RTCPeerConnection | null = null;
    let hls: Hls | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const cleanup = () => {
      pc?.close();
      pc = null;
      hls?.destroy();
      hls = null;
      if (video.srcObject) video.srcObject = null;
    };

    const retry = (delay = 5000) => {
      if (disposed) return;
      setFailed(true);
      retryTimer = setTimeout(() => { void start(); }, delay);
    };

    /** HLS — fallback (latência maior, mas atravessa qualquer rede). */
    const startHls = () => {
      if (disposed || !videoRef.current) return;
      setTransport('hls');
      const src = `/streams/${streamPath}/index.m3u8`;

      if (Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: true,
          liveDurationInfinity: true,
          backBufferLength: 0,
          maxLiveSyncPlaybackRate: 1.5, // acelera de leve para colar na borda do live
          xhrSetup: (xhr, url) => { xhr.open('GET', withJwt(url), true); },
        });
        hls.loadSource(withJwt(src));
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setFailed(false);
          videoRef.current?.play().catch(() => { /* autoplay bloqueado */ });
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          cleanup();
          retry();
        });
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = withJwt(src); // Safari: HLS nativo
        videoRef.current.play().catch(() => { /* autoplay bloqueado */ });
        setFailed(false);
      } else {
        retry(10_000);
      }
    };

    /** WebRTC/WHEP — caminho principal, latência sub-segundo. */
    const startWebRtc = async () => {
      if (disposed || !videoRef.current) return;
      try {
        pc = new RTCPeerConnection({ iceServers: [] }); // LAN: só host candidates
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (e) => {
          if (videoRef.current && e.streams[0]) {
            videoRef.current.srcObject = e.streams[0];
            videoRef.current.play().catch(() => { /* autoplay bloqueado */ });
            setFailed(false);
          }
        };
        pc.onconnectionstatechange = () => {
          if (disposed || !pc) return;
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            cleanup();
            retry();
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitIceReady(pc); // não espera o ICE completo — só o que conecta

        const res = await fetch(withJwt(`/webrtc/${streamPath}/whep`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp ?? '',
        });
        if (!res.ok) throw new Error(`WHEP HTTP ${res.status}`);

        const answer = await res.text();
        if (disposed || !pc) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
        setTransport('webrtc');
      } catch {
        // WebRTC indisponível (UDP bloqueado, navegador sem suporte...) → HLS
        cleanup();
        if (!disposed) startHls();
      }
    };

    const start = async () => {
      if (disposed) return;
      cleanup();
      if (typeof RTCPeerConnection !== 'undefined') {
        await startWebRtc();
      } else {
        startHls();
      }
    };

    void start();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      cleanup();
    };
  }, [streamPath]);

  return (
    <div className={`relative bg-black overflow-hidden ${className ?? ''}`}>
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        autoPlay
        poster={poster || undefined}
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
      {/* HLS = fallback: avisa que essa câmera está com latência maior */}
      {transport === 'hls' && !failed && (
        <span
          title="Transmitindo por HLS (latência maior) — o WebRTC não pôde ser usado nesta rede"
          className="absolute bottom-1 left-2 text-[9px] font-mono text-amber-400/70 pointer-events-none"
        >
          HLS
        </span>
      )}
    </div>
  );
});

export const LivePlayer = memo(LivePlayerBase);
