import React, { useCallback, useEffect, useState } from 'react';
import { Camera, Video, Film, X, Maximize2, Minimize2, Loader2 } from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import { authFetch, getToken } from '../auth';
import { apiUrl } from '../tenant';

/**
 * Detalhe de um evento de câmera (VCA) no cloud: duas janelas — FOTO do momento
 * e VÍDEO AO VIVO da câmera do evento — e um botão para ver a GRAVAÇÃO. Reusa o
 * VideoPlayer da PWA (WebRTC→HLS, com o token do tenant). Redimensionável.
 */
export default function EventDetail({ event, onClose }) {
  const meta = (event && event.metadata) || {};
  const streamPath = meta.streamPath;
  const channelName = meta.videoChannelName || meta.channelName;
  const videoChannelId = meta.videoChannelId || meta.channelId;
  const snapshot = meta.snapshotUrl
    ? apiUrl(`${meta.snapshotUrl}?token=${encodeURIComponent(getToken())}`)
    : (event && event.photoUrl) || null;

  const [clip, setClip] = useState(null);
  const [clipState, setClipState] = useState('idle'); // idle | loading | pending | none
  const [max, setMax] = useState(false);

  useEffect(() => { setClip(null); setClipState('idle'); }, [event && event.id]);

  const loadClip = useCallback(async () => {
    if (!videoChannelId || !event) return;
    setClipState('loading');
    try {
      const t = new Date(event.occurredAt).getTime();
      const from = new Date(t - 20 * 60_000).toISOString();
      const to = new Date(t + 2 * 60_000).toISOString();
      const res = await authFetch(`/api/vms/recordings?channelId=${videoChannelId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const data = res.ok ? await res.json() : { recordings: [] };
      const recs = data.recordings || [];
      const hit = recs.find((r) => {
        const s = new Date(r.startedAt).getTime();
        const e = r.endedAt ? new Date(r.endedAt).getTime() : Date.now();
        return t >= s - 10_000 && t <= e + 10_000;
      });
      if (hit) { setClip(hit); setClipState('idle'); }
      else setClipState('pending');
    } catch { setClipState('none'); }
  }, [videoChannelId, event]);

  if (!event) return null;
  const clipUrl = clip ? apiUrl(`/api/vms/recordings/${clip.id}/file?token=${encodeURIComponent(getToken())}`) : null;
  const when = new Date(event.occurredAt).toLocaleString('pt-BR');

  const box = { flex: 1, minHeight: 0, background: '#000', borderRadius: 8, overflow: 'hidden' };
  const boxFixed = { aspectRatio: '16 / 9', background: '#000', borderRadius: 8, overflow: 'hidden' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: max ? 8 : 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#14161a', color: '#e5e7eb', borderRadius: 12, border: '1px solid #262b33',
        width: max ? '98vw' : 'min(1000px, 94vw)', height: max ? '96vh' : 'auto', maxHeight: '96vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #262b33' }}>
          <strong style={{ color: '#f87171', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.personName}</strong>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button onClick={() => setMax((m) => !m)} title={max ? 'Restaurar' : 'Maximizar'} style={iconBtn}>{max ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
            <button onClick={onClose} title="Fechar" style={iconBtn}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: '6px 16px 2px', fontSize: '0.72rem', color: '#9ca3af' }}>
          {channelName ? <>Câmera: <strong>{channelName}</strong> · </> : null}{when}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: 14, flex: max ? 1 : 'none', minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ ...capLabel }}><Camera size={13} /> Foto do momento</div>
            <div style={max ? box : boxFixed}>
              {snapshot ? <img src={snapshot} alt="Snapshot" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                : <div style={emptyBox}>sem foto</div>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ ...capLabel }}>{clip ? <Film size={13} /> : <Video size={13} />} {clip ? 'Gravação do evento' : 'Ao vivo'}</div>
            <div style={max ? box : boxFixed}>
              {clip && clipUrl ? <video src={clipUrl} controls autoPlay style={{ width: '100%', height: '100%' }} />
                : streamPath ? <VideoPlayer path={streamPath} fit="contain" />
                : <div style={emptyBox}>sem vídeo desta câmera</div>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderTop: '1px solid #262b33' }}>
          {clip
            ? <button onClick={() => setClip(null)} style={btn}><Video size={14} /> Voltar ao vivo</button>
            : <button onClick={loadClip} disabled={clipState === 'loading' || !videoChannelId} style={btn}>
                {clipState === 'loading' ? <Loader2 size={14} className="spinning" /> : <Film size={14} />} Ver gravação do evento
              </button>}
          {clipState === 'pending' && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>A gravação ainda está sendo processada — tente em alguns segundos.</span>}
          {clipState === 'none' && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Nenhuma gravação encontrada.</span>}
        </div>
      </div>
    </div>
  );
}

const iconBtn = { background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' };
const capLabel = { display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', marginBottom: 6 };
const emptyBox = { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: '0.8rem' };
const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer' };
