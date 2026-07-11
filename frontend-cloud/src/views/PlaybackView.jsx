import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Film, RefreshCw, Download, Play, SkipBack, SkipForward } from 'lucide-react';
import { authFetch, getToken } from '../auth';

const TRIGGER_LABEL = {
  continuous: 'Contínua',
  schedule: 'Agendada',
  motion: 'Evento',
};

function fmtSize(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function fmtDuration(a, b) {
  if (!b) return '—';
  const s = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Reprodução — player das gravações do servidor.
 *
 * Os segmentos são servidos com suporte a Range (206), então o player permite
 * avançar/retroceder dentro do trecho. "Anterior/Próximo" pulam para o segmento
 * vizinho, que é como se navega numa linha do tempo de NVR.
 */
export default function PlaybackView({ cameras }) {
  const videoRef = useRef(null);

  const [channelId, setChannelId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recordings, setRecordings] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!channelId && cameras.length > 0) setChannelId(cameras[0].id);
  }, [cameras, channelId]);

  const load = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ channelId });
      if (date) {
        params.set('from', new Date(`${date}T00:00:00`).toISOString());
        params.set('to', new Date(`${date}T23:59:59.999`).toISOString());
      }
      const res = await authFetch(`/api/vms/recordings?${params.toString()}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = await res.json();
      // Mais RECENTE no topo: quem abre a reprodução quase sempre quer ver o que
      // acabou de acontecer. (A API já devolve em ordem decrescente.)
      const list = data.recordings || [];
      setRecordings(list);
      setCurrent(list[0] ?? null);
    } catch (err) {
      setError(err.message || 'Falha ao carregar gravações');
      setRecordings([]);
      setCurrent(null);
    } finally {
      setLoading(false);
    }
  }, [channelId, date]);

  useEffect(() => { void load(); }, [load]);

  const fileUrl = (rec, download = false) =>
    `/api/vms/recordings/${rec.id}/file?token=${encodeURIComponent(getToken())}${download ? '&download=1' : ''}`;

  const index = current ? recordings.findIndex((r) => r.id === current.id) : -1;

  /**
   * Navega no TEMPO, não na lista: como a lista está do mais recente para o mais
   * antigo, "avançar no tempo" (+1) é subir um item, e "voltar" (-1) é descer.
   */
  const stepTime = (dir) => {
    const next = recordings[index - dir];
    if (next) setCurrent(next);
  };

  const hasOlder = index >= 0 && index < recordings.length - 1;
  const hasNewer = index > 0;

  // ao terminar um trecho, emenda o seguinte no tempo (reprodução contínua)
  const onEnded = () => stepTime(1);

  return (
    <>
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="top-title">Reprodução</span>
          <span className="cam-count">{recordings.length} trecho(s)</span>
        </div>
        <div className="top-bar-right">
          <button
            className="icon-btn"
            onClick={() => stepTime(-1)}
            disabled={!hasOlder}
            title="Trecho anterior (mais antigo)"
          >
            <SkipBack size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={() => stepTime(1)}
            disabled={!hasNewer}
            title="Trecho seguinte (mais recente)"
          >
            <SkipForward size={17} />
          </button>
          {current && (
            <a className="icon-btn" href={fileUrl(current, true)} download title="Baixar trecho">
              <Download size={17} />
            </a>
          )}
        </div>
      </div>

      <div className="playback">
        <div className="playback-filters">
          <select className="field" value={channelId} onChange={(e) => setChannelId(e.target.value)} style={{ flex: 1 }}>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>{c.deviceName} — {c.name}</option>
            ))}
          </select>
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="icon-btn" onClick={load} disabled={loading} title="Atualizar">
            <RefreshCw size={17} className={loading ? 'spinning' : ''} />
          </button>
        </div>

        <div className="playback-body">
          <div className="playback-player">
            {current ? (
              <video
                ref={videoRef}
                key={current.id}
                src={fileUrl(current)}
                controls
                autoPlay
                playsInline
                onEnded={onEnded}
              />
            ) : (
              <div className="empty">
                <Film size={36} />
                <p>{loading ? 'Carregando…' : error || 'Nenhuma gravação neste dia'}</p>
                {!loading && !error && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
                    Ative a gravação da câmera no painel administrativo.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="playback-list">
            {recordings.length > 1 && (
              <div className="list-head">Mais recentes primeiro</div>
            )}
            {recordings.map((rec) => {
              const gone = rec.status === 'deleted_local';
              return (
                <div
                  key={rec.id}
                  className={`rec-item ${current?.id === rec.id ? 'active' : ''}`}
                  onClick={() => { if (!gone) setCurrent(rec); }}
                  style={gone ? { opacity: 0.45, cursor: 'default' } : undefined}
                >
                  <Play size={14} color="var(--text-faint)" />
                  <div className="info">
                    <div className="time">{fmtTime(rec.startedAt)}</div>
                    <div className="meta">
                      {fmtDuration(rec.startedAt, rec.endedAt)} · {fmtSize(rec.sizeBytes)}
                    </div>
                  </div>
                  <span className="tag">{gone ? 'só remoto' : (TRIGGER_LABEL[rec.trigger] ?? rec.trigger)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
