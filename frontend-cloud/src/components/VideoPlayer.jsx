import React, { memo, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { getToken, ensureFreshToken } from '../auth';
import { apiUrl } from '../tenant';

/**
 * O hls.js (~400 KB, metade do bundle) só é usado quando o WebRTC falha — o que
 * quase nunca acontece. Carregá-lo junto do app atrasava a PRIMEIRA imagem de
 * todas as câmeras, à toa. Agora ele é baixado sob demanda, e apenas uma vez.
 */
let hlsModule = null;
async function loadHls() {
  if (!hlsModule) hlsModule = (await import('hls.js')).default;
  return hlsModule;
}

/** Frame atual como data URL — usado como "poster" para a tela não ficar preta. */
export function captureFrame(video) {
  if (!video || !video.videoWidth) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  }
}

/**
 * Captura o frame atual do vídeo e baixa como JPG (o "print" dos NVRs).
 * Funciona porque o vídeo é servido pela mesma origem — o canvas não fica
 * "tainted" e permite exportar a imagem.
 */
export function snapshotVideo(video, name = 'camera') {
  if (!video || !video.videoWidth) return false;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const slug = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '')
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

/**
 * Player ao vivo do acesso remoto.
 *
 * Tenta WebRTC (WHEP) primeiro: a mídia vai por UDP através do TURN do VPS, sem
 * o buffer de segmentos do HLS — a latência cai de vários segundos para menos
 * de 1s. Se o WebRTC não subir (rede corporativa bloqueando UDP, navegador
 * antigo), cai automaticamente para HLS, que atravessa qualquer rede.
 *
 * Autenticação: o MediaMTX exige o JWT em toda requisição (?jwt=). Se o token
 * expirar durante a transmissão, é renovado pelo refresh token e o vídeo
 * retoma — sem jogar o usuário para a tela de login.
 */

/** Lê os ICE servers (TURN) que o MediaMTX publica nos headers Link do WHEP. */
function parseIceServers(linkHeader) {
  if (!linkHeader) return [];
  const servers = [];
  // <turn:host:3478>; rel="ice-server"; username="..."; credential="..."
  const re = /<([^>]+)>;[^,]*rel="ice-server"[^,]*/g;
  let m;
  while ((m = re.exec(linkHeader)) !== null) {
    const chunk = m[0];
    const urls = m[1];
    const username = /username="([^"]*)"/.exec(chunk)?.[1];
    const credential = /credential="([^"]*)"/.exec(chunk)?.[1];
    servers.push(username ? { urls, username, credential } : { urls });
  }
  return servers;
}

/**
 * Espera candidatos ICE "suficientes" — não o gathering completo.
 *
 * O candidato que realmente conecta (srflx, o IP público) chega em poucas
 * centenas de ms; o relay do TURN é só o plano B e demora bem mais. Esperar o
 * ICE "completo" custava mais de um segundo de tela preta por câmera, à toa.
 */
function waitIceReady(pc, { minMs = 150, maxMs = 1000 } = {}) {
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

    const maybeFinish = () => {
      if (!usable) return;
      const elapsed = Date.now() - started;
      setTimeout(finish, Math.max(0, minMs - elapsed)); // deixa entrar mais um ou dois
    };

    const onCand = (e) => {
      if (!e.candidate) return finish(); // gathering acabou
      const c = e.candidate.candidate || '';
      // srflx/relay = rota que funciona fora da LAN; host = rota local
      if (c.includes('typ srflx') || c.includes('typ relay') || c.includes('typ host')) {
        usable = true;
        maybeFinish();
      }
    };
    const onState = () => { if (pc.iceGatheringState === 'complete') finish(); };

    pc.addEventListener('icecandidate', onCand);
    pc.addEventListener('icegatheringstatechange', onState);
    const hardTimer = setTimeout(finish, maxMs);
  });
}

/**
 * Os ICE servers (TURN) valem para TODAS as câmeras — buscar uma vez e
 * reaproveitar economiza um ida-e-volta ao servidor por câmera (no acesso
 * remoto, cada um custa centenas de ms).
 */
let iceServersCache = null;
let iceServersAt = 0;
const ICE_TTL_MS = 10 * 60 * 1000;

async function getIceServers(whepUrl) {
  if (iceServersCache && Date.now() - iceServersAt < ICE_TTL_MS) return iceServersCache;
  try {
    const probe = await fetch(whepUrl, { method: 'OPTIONS' });
    iceServersCache = parseIceServers(probe.headers.get('Link'));
    iceServersAt = Date.now();
  } catch {
    iceServersCache = [];
    iceServersAt = Date.now();
  }
  return iceServersCache;
}

// fit="contain" por padrão: mostra o quadro inteiro da câmera. Com "cover" a
// imagem preenche a célula mas as bordas são CORTADAS (some parte do OSD).
const VideoPlayer = forwardRef(function VideoPlayer(
  { path, autoPlay = true, fit = 'contain', poster = null },
  ref,
) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [transport, setTransport] = useState(null);
  const [live, setLive] = useState(false); // primeiro frame já chegou?

  // expõe o <video> para o print e para capturar o frame de transição
  useImperativeHandle(ref, () => ({
    element: () => videoRef.current,
    snapshot: (name) => snapshotVideo(videoRef.current, name),
    frame: () => captureFrame(videoRef.current),
  }), []);

  /**
   * Navegadores móveis pausam o vídeo ao girar a tela, entrar em tela cheia ou
   * quando o app vai para segundo plano — e não retomam sozinhos. Sem isto, a
   * imagem "some" a cada interação e só volta se o usuário mexer no player.
   * A conexão (WebRTC/HLS) continua viva; basta mandar tocar de novo.
   */
  useEffect(() => {
    const resume = () => {
      const v = videoRef.current;
      if (!v || document.hidden) return;
      if (v.paused && (v.srcObject || v.src || v.currentSrc)) {
        v.play().catch(() => { /* autoplay bloqueado */ });
      }
    };
    const events = ['visibilitychange', 'orientationchange', 'fullscreenchange', 'resize', 'pageshow'];
    events.forEach((e) => window.addEventListener(e, resume));
    document.addEventListener('visibilitychange', resume);
    const v = videoRef.current;
    v?.addEventListener('pause', resume); // pausa involuntária do navegador

    return () => {
      events.forEach((e) => window.removeEventListener(e, resume));
      document.removeEventListener('visibilitychange', resume);
      v?.removeEventListener('pause', resume);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !path) return;

    let pc = null;
    let hls = null;
    let retryTimer = null;
    let disposed = false;

    // o token é lido AGORA, a cada requisição — por isso ele não entra nas
    // dependências do efeito: renovar a sessão não pode derrubar o vídeo
    const withJwt = (url) => {
      const u = new URL(url, window.location.origin);
      u.searchParams.set('jwt', getToken());
      return u.toString();
    };

    const cleanup = () => {
      if (pc) { pc.close(); pc = null; }
      if (hls) { hls.destroy(); hls = null; }
      if (video.srcObject) video.srcObject = null;
    };

    // ── HLS (fallback: atravessa qualquer rede, mas com mais atraso) ──
    const startHls = async () => {
      if (disposed) return;
      setTransport('hls');

      const Hls = await loadHls().catch(() => null); // baixado só agora
      if (disposed) return;
      if (!Hls) { setError('Não foi possível carregar o player'); return; }

      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 0,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 4,
          maxLiveSyncPlaybackRate: 2,
          maxBufferLength: 4,
          xhrSetup: (xhr, url) => { xhr.open('GET', withJwt(url), true); },
        });
        hls.loadSource(withJwt(apiUrl(`/hls/${path}/index.m3u8`)));
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setError(null);
          if (autoPlay) video.play().catch(() => { /* autoplay bloqueado */ });
        });
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return;
          cleanup();
          if (data.response?.code === 401) {
            setError('Renovando sessão…');
            void ensureFreshToken().then((fresh) => {
              if (disposed) return;
              if (fresh) start();
              else setError('Sessão expirada — entre novamente');
            });
            return;
          }
          setError('Sem sinal — reconectando…');
          retryTimer = setTimeout(start, 5000);
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = withJwt(apiUrl(`/hls/${path}/index.m3u8`)); // Safari
        if (autoPlay) video.play().catch(() => { /* autoplay bloqueado */ });
      } else {
        setError('Navegador sem suporte a vídeo ao vivo');
      }
    };

    // ── WebRTC/WHEP com TURN (caminho principal: latência < 1s) ──
    const startWebRtc = async () => {
      if (disposed) return;
      const whep = withJwt(apiUrl(`/webrtc/${path}/whep`));

      try {
        // ICE servers (TURN) vêm do cache — não custa um round-trip por câmera
        const iceServers = await getIceServers(whep);

        pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: 'all' });
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });

        pc.ontrack = (e) => {
          if (video && e.streams[0]) {
            video.srcObject = e.streams[0];
            setError(null);
            if (autoPlay) video.play().catch(() => { /* autoplay bloqueado */ });
          }
        };
        pc.onconnectionstatechange = () => {
          if (disposed || !pc) return;
          if (pc.connectionState === 'failed') {
            cleanup();
            void startHls(); // UDP bloqueado nesta rede → HLS
          } else if (pc.connectionState === 'disconnected') {
            cleanup();
            retryTimer = setTimeout(start, 3000);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitIceReady(pc); // não espera o ICE completo — só o que conecta

        const res = await fetch(whep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: pc.localDescription?.sdp ?? '',
        });

        if (res.status === 401) {
          const fresh = await ensureFreshToken();
          cleanup();
          if (disposed) return;
          if (fresh) { start(); return; }
          setError('Sessão expirada — entre novamente');
          return;
        }
        if (!res.ok) throw new Error(`WHEP HTTP ${res.status}`);

        const answer = await res.text();
        if (disposed || !pc) return;
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });
        setTransport('webrtc');
      } catch {
        cleanup();
        if (!disposed) void startHls();
      }
    };

    const start = () => {
      if (disposed) return;
      cleanup();
      setError(null);
      if (typeof RTCPeerConnection !== 'undefined') {
        void startWebRtc();
      } else {
        void startHls();
      }
    };

    start();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]); // só o path recria a conexão — token/fit/poster não

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <video
        ref={videoRef}
        // poster = último frame da mesma câmera (vindo do mosaico): a tela não
        // fica preta enquanto a conexão em HD é estabelecida
        poster={poster || undefined}
        style={{ width: '100%', height: '100%', objectFit: fit, backgroundColor: '#000' }}
        muted
        playsInline
        autoPlay={autoPlay}
        onLoadedData={() => setLive(true)}
        onPlaying={() => setLive(true)}
        onEmptied={() => setLive(false)}
      />
      {error && (
        <div className="video-overlay">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {/* enquanto o primeiro frame não chega, mostra que está conectando (em
          vez de um retângulo preto que parece travado) */}
      {!error && !live && !poster && (
        <div className="video-overlay">
          <span className="connecting-dot" />
          <span>Conectando…</span>
        </div>
      )}
      {/* HLS = plano B; avisa que essa câmera está com mais atraso */}
      {transport === 'hls' && !error && (
        <span className="badge-hls" title="Transmitindo por HLS (mais atraso) — o WebRTC não pôde ser usado nesta rede">
          HLS
        </span>
      )}
    </div>
  );
});

/**
 * memo: o mosaico re-renderiza a cada atualização de status (a cada 30s), a
 * cada seleção de quadro, toque longo, etc. Sem isto o player refazia trabalho
 * à toa a cada uma dessas interações.
 */
export default memo(VideoPlayer);
