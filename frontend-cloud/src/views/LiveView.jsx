import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, ChevronDown, ChevronRight, Maximize2, Minimize2, X,
  Eraser, Video, HardDrive, RotateCw, Grid2x2, LayoutGrid, Check,
  Scan, Crop, PanelLeftClose, PanelLeftOpen, Circle, Square,
} from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import { authFetch, getToken } from '../auth';
import { apiUrl, tenantKey } from '../tenant';

/** Divisões fixas do mosaico, como num NVR (o "2" é útil para comparar duas câmeras). */
const LAYOUTS = [
  { size: 1, cols: 1, label: '1' },
  { size: 2, cols: 2, label: '2' },
  { size: 4, cols: 2, label: '4' },
  { size: 9, cols: 3, label: '9' },
  { size: 16, cols: 4, label: '16' },
];

const MAX_COLS = 6;
const MAX_ROWS = 6;

function StatusDot({ status }) {
  if (!status) return <span className="dot offline" title="Sem informação" />;
  if (status.recording) return <span className="dot rec" title="Gravando" />;
  if (status.ready) return <span className="dot online" title="Ao vivo" />;
  return <span className="dot offline" title="Câmera offline" />;
}

/**
 * Exibição ao vivo — mosaico estilo NVR.
 *
 * A câmera entra no quadro selecionado (clique na lista) ou arrastando-a até
 * ele. Duplo clique amplia. O layout escolhido fica salvo no dispositivo, então
 * ao reabrir o app o operador encontra o mesmo mosaico.
 */
export default function LiveView({ cameras, statusMap, token, onStatusChange }) {
  const wallRef = useRef(null);
  const playerRefs = useRef({});   // channelId -> ref do player (para o print)
  const [busyRec, setBusyRec] = useState(null);
  const [flash, setFlash] = useState(null);     // feedback visual do print
  const [pressing, setPressing] = useState(null); // câmera sob toque longo (gravar)
  const [poster, setPoster] = useState(null);     // frame de transição ao ampliar
  const pressTimer = useRef(null);

  const [layoutSize, setLayoutSize] = useState(() => Number(localStorage.getItem('onlitec_layout')) || 4);
  /** grade personalizada (colunas × linhas); null = usa uma das divisões fixas */
  const [custom, setCustom] = useState(() => {
    try { return JSON.parse(localStorage.getItem('onlitec_custom') || 'null'); } catch { return null; }
  });
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState(() => custom ?? { cols: 3, rows: 2 });

  const [slots, setSlots] = useState(() => {
    try { return JSON.parse(localStorage.getItem(tenantKey('onlitec_slots')) || 'null') || []; } catch { return []; }
  });
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(null);
  // lista de câmeras: no desktop começa aberta (painel fixo); no celular é uma
  // gaveta e começa fechada. O mesmo botão recolhe/expande nos dois casos.
  const [treeOpen, setTreeOpen] = useState(() => window.innerWidth > 768);
  const [collapsed, setCollapsed] = useState({});
  const [fullscreen, setFullscreen] = useState(false);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);

  /**
   * Como a imagem ocupa o quadro:
   *   "contain" (padrão) — mostra o quadro INTEIRO da câmera, com faixas pretas
   *                        se a proporção não bater. Nada é cortado (o OSD, o
   *                        relógio e as bordas continuam visíveis).
   *   "cover"            — preenche o quadro todo, mas corta as laterais.
   */
  const [fitMode, setFitMode] = useState(() => localStorage.getItem('onlitec_fit') || 'contain');

  // no celular em pé, 2 câmeras ficam melhor empilhadas do que lado a lado
  useEffect(() => {
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  /**
   * Preenche os quadros: na primeira vez, com as câmeras disponíveis; depois,
   * apenas com as câmeras NOVAS (cadastradas após a última visita), nos quadros
   * que estiverem livres. Sem isto, uma câmera recém-cadastrada nunca aparecia
   * — o mosaico salvo no aparelho não a conhecia e ninguém a colocava lá.
   *
   * Só ocupa quadros vazios: se o operador removeu uma câmera de propósito, ela
   * não volta sozinha (guardamos quais câmeras o aparelho já "conhece").
   */
  useEffect(() => {
    if (cameras.length === 0) return;

    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(tenantKey('onlitec_seen_cams')) || '[]'); } catch { seen = []; }

    setSlots((prev) => {
      const base = Array.from({ length: layoutSize }, (_, i) => prev[i] ?? null);

      // primeira vez neste aparelho: monta o mosaico com o que houver
      if (seen.length === 0 && !base.some(Boolean)) {
        return Array.from({ length: layoutSize }, (_, i) => cameras[i]?.id ?? null);
      }

      // câmeras novas entram nos quadros livres
      const novas = cameras.filter((c) => !seen.includes(c.id) && !base.includes(c.id));
      for (const cam of novas) {
        const free = base.indexOf(null);
        if (free === -1) break; // mosaico cheio — o operador escolhe onde pôr
        base[free] = cam.id;
      }
      return base;
    });

    localStorage.setItem(tenantKey('onlitec_seen_cams'), JSON.stringify(cameras.map((c) => c.id)));
  }, [cameras, layoutSize]);

  // o mosaico montado é preferência do operador — persiste no dispositivo
  useEffect(() => {
    localStorage.setItem('onlitec_layout', String(layoutSize));
    localStorage.setItem(tenantKey('onlitec_slots'), JSON.stringify(slots));
    if (custom) localStorage.setItem('onlitec_custom', JSON.stringify(custom));
    else localStorage.removeItem('onlitec_custom');
    localStorage.setItem('onlitec_fit', fitMode);
  }, [layoutSize, slots, custom, fitMode]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const byId = useMemo(() => Object.fromEntries(cameras.map((c) => [c.id, c])), [cameras]);

  // agrupa por dispositivo (NVR/câmera), como a árvore do NVR
  const groups = useMemo(() => {
    const map = new Map();
    for (const cam of cameras) {
      if (!map.has(cam.deviceId)) map.set(cam.deviceId, { name: cam.deviceName, cams: [] });
      map.get(cam.deviceId).cams.push(cam);
    }
    return [...map.entries()].map(([id, g]) => ({ id, ...g }));
  }, [cameras]);

  const changeLayout = (size) => {
    setCustom(null);
    setSlots((prev) => Array.from({ length: size }, (_, i) => prev[i] ?? null));
    setLayoutSize(size);
    setSelected((s) => Math.min(s, size - 1));
    setCustomOpen(false);
  };

  /** Aplica a grade personalizada (colunas × linhas escolhidas pelo usuário). */
  const applyCustom = () => {
    const cols = Math.min(Math.max(1, Number(draft.cols) || 1), MAX_COLS);
    const rows = Math.min(Math.max(1, Number(draft.rows) || 1), MAX_ROWS);
    const size = cols * rows;
    setCustom({ cols, rows });
    setLayoutSize(size);
    setSlots((prev) => Array.from({ length: size }, (_, i) => prev[i] ?? null));
    setSelected((s) => Math.min(s, size - 1));
    setCustomOpen(false);
  };

  const putInCell = (camId, cell) => {
    setSlots((prev) => {
      const next = Array.from({ length: layoutSize }, (_, i) => prev[i] ?? null);
      next[cell] = camId;
      return next;
    });
  };

  /** clique na lista: entra no quadro selecionado e avança (fluxo do NVR) */
  const assign = (camId) => {
    putInCell(camId, selected);
    setSelected((s) => (s + 1) % layoutSize);
    // no celular a gaveta cobre o vídeo: fecha ao escolher a câmera
    if (window.innerWidth <= 768) setTreeOpen(false);
  };

  const clearCell = (cell) => putInCell(null, cell);
  const clearAll = () => setSlots(Array(layoutSize).fill(null));

  /** Print da imagem (ícone de foto dos NVRs): baixa o frame atual em JPG. */
  const snapshot = (cam) => {
    const ok = playerRefs.current[cam.id]?.snapshot(cam.name);
    if (!ok) {
      alert('A imagem ainda não carregou — aguarde o vídeo aparecer.');
      return;
    }
    setFlash(cam.id);
    setTimeout(() => setFlash(null), 220);
  };

  /**
   * Botão REC: liga/desliga a gravação manual no servidor.
   * Ao PARAR, o servidor devolve o clipe gravado e ele é baixado na hora para o
   * aparelho — o operador grava a ocorrência e já sai com o arquivo em mãos.
   */
  const toggleRecord = async (cam) => {
    const active = !statusMap[cam.id]?.manual;
    setBusyRec(cam.id);
    try {
      const res = await authFetch(`/api/vms/channels/${cam.id}/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ${res.status}`);
      }

      const data = await res.json().catch(() => ({}));
      if (!active) {
        const segments = data.segments || [];
        if (segments.length > 0) {
          // baixa o clipe (ou os clipes, se a gravação gerou mais de um arquivo)
          segments.forEach((seg, i) => {
            setTimeout(() => downloadSegment(seg.id), i * 800);
          });
        } else if (data.clip) {
          // canal em gravação contínua: o arquivo segue aberto no servidor —
          // baixa a janela exata da gravação manual pela linha do tempo
          downloadClip(cam, data.clip);
        } else {
          alert('Gravação encerrada, mas nenhum trecho foi gerado (a câmera pode ter perdido o sinal).');
        }
      }
      onStatusChange?.(); // atualiza a bolinha/botão imediatamente
    } catch (err) {
      alert(err.message || 'Não foi possível acionar a gravação');
    } finally {
      setBusyRec(null);
    }
  };

  /**
   * Atalho de gravação: segurar o dedo (ou o mouse) 2 segundos sobre a câmera
   * inicia a gravação; segurar de novo durante a gravação encerra e baixa o
   * clipe. É o gesto mais rápido para registrar uma ocorrência em andamento —
   * sem precisar mirar num botão pequeno.
   */
  const HOLD_MS = 2000;

  const startPress = (cam) => {
    if (busyRec) return;
    setPressing(cam.id);
    pressTimer.current = setTimeout(() => {
      setPressing(null);
      navigator.vibrate?.(60); // confirmação tátil no celular
      void toggleRecord(cam);
    }, HOLD_MS);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    setPressing(null);
  };

  useEffect(() => () => { if (pressTimer.current) clearTimeout(pressTimer.current); }, []);

  /** Baixa um trecho gravado para o dispositivo do usuário. */
  const downloadSegment = (segmentId) => {
    const a = document.createElement('a');
    a.href = apiUrl(`/api/vms/recordings/${segmentId}/file?token=${encodeURIComponent(getToken())}&download=1`);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /** Baixa a janela exata da gravação manual pela linha do tempo (playback). */
  const downloadClip = (cam, clip) => {
    const q = new URLSearchParams({
      channelId: cam.id,
      start: clip.start,
      duration: String(clip.duration),
      token: getToken(),
      download: '1',
    });
    const a = document.createElement('a');
    a.href = apiUrl(`/api/vms/playback/stream?${q.toString()}`);
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /**
   * Duplo clique numa câmera: abre em tela cheia e, no celular, deita a tela.
   * É o gesto esperado de um NVR — a câmera ocupa a tela inteira na horizontal.
   */
  const openFullscreen = async (cell) => {
    // guarda o frame que já está na tela: ele serve de fundo enquanto a
    // conexão em HD sobe, em vez de a imagem sumir e deixar tudo preto
    const cam = byId[slots[cell]];
    if (cam) setPoster(playerRefs.current[cam.id]?.frame?.() ?? null);

    setExpanded(cell);
    try {
      await document.documentElement.requestFullscreen?.();
      await screen.orientation?.lock?.('landscape');
    } catch { /* desktop ou navegador sem permissão: fica só o fullscreen */ }
  };

  const closeExpanded = async () => {
    setExpanded(null);
    try {
      screen.orientation?.unlock?.();
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch { /* ignora */ }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wallRef.current?.requestFullscreen?.().catch(() => { /* bloqueado */ });
  };

  /**
   * Botão de girar (celular): trava a orientação em paisagem, que é como o
   * mosaico realmente fica útil. Só funciona com o app instalado (standalone).
   */
  const rotate = async () => {
    try {
      const type = screen.orientation?.type || '';
      if (!document.fullscreenElement) {
        await wallRef.current?.requestFullscreen?.();
      }
      if (type.startsWith('landscape')) {
        await screen.orientation.lock('portrait');
      } else {
        await screen.orientation.lock('landscape');
      }
    } catch {
      alert('Para girar a tela, instale o app (botão Instalar) — o navegador não permite travar a orientação.');
    }
  };

  // colunas efetivas: a grade personalizada manda; senão, a divisão fixa
  // (com 2 câmeras em tela retrato, empilha em vez de espremer lado a lado)
  const cols = custom
    ? custom.cols
    : layoutSize === 2 && portrait
      ? 1
      : (LAYOUTS.find((l) => l.size === layoutSize)?.cols ?? Math.ceil(Math.sqrt(layoutSize)));

  const gridStyle = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${Math.ceil(layoutSize / cols)}, minmax(0, 1fr))`,
  };

  const expandedCam = expanded !== null ? byId[slots[expanded]] : null;

  return (
    <>
      {/* ── barra de controles ── */}
      <div className="top-bar">
        <div className="top-bar-left">
          <button
            className={`icon-btn ${treeOpen ? 'active' : ''}`}
            onClick={() => setTreeOpen((v) => !v)}
            title={treeOpen ? 'Recolher lista de câmeras' : 'Mostrar lista de câmeras'}
          >
            {treeOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <span className="top-title">Ao vivo</span>
          <span className="cam-count">
            {cameras.filter((c) => statusMap[c.id]?.ready).length}/{cameras.length} online
          </span>
        </div>

        <div className="top-bar-right">
          <div className="layout-group">
            {LAYOUTS.map((l) => (
              <button
                key={l.size}
                className={`layout-btn ${!custom && layoutSize === l.size ? 'active' : ''}`}
                onClick={() => changeLayout(l.size)}
                title={`${l.label} câmera(s)`}
              >
                {l.label}
              </button>
            ))}
            <button
              className={`layout-btn ${custom ? 'active' : ''}`}
              onClick={() => { setDraft(custom ?? { cols: 3, rows: 2 }); setCustomOpen((v) => !v); }}
              title="Mosaico personalizado"
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <LayoutGrid size={13} />
              {custom ? `${custom.cols}×${custom.rows}` : ''}
            </button>
          </div>

          {/* seletor da grade personalizada */}
          {customOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 70 }}
                onClick={() => setCustomOpen(false)}
              />
              <div className="custom-popover">
                <div className="custom-title">Mosaico personalizado</div>

                {/* prévia clicável: escolhe colunas × linhas tocando na grade */}
                <div className="custom-grid">
                  {Array.from({ length: MAX_ROWS }, (_, r) => (
                    <div key={r} style={{ display: 'flex', gap: '3px' }}>
                      {Array.from({ length: MAX_COLS }, (_, c) => {
                        const on = c < draft.cols && r < draft.rows;
                        return (
                          <button
                            key={c}
                            className={`custom-cell ${on ? 'on' : ''}`}
                            onClick={() => setDraft({ cols: c + 1, rows: r + 1 })}
                            title={`${c + 1} × ${r + 1} = ${(c + 1) * (r + 1)} câmeras`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="custom-row">
                  <label>
                    Colunas
                    <input
                      className="field"
                      type="number"
                      min="1"
                      max={MAX_COLS}
                      value={draft.cols}
                      onChange={(e) => setDraft((d) => ({ ...d, cols: e.target.value }))}
                    />
                  </label>
                  <label>
                    Linhas
                    <input
                      className="field"
                      type="number"
                      min="1"
                      max={MAX_ROWS}
                      value={draft.rows}
                      onChange={(e) => setDraft((d) => ({ ...d, rows: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="custom-foot">
                  <span>
                    {Math.min(Math.max(1, Number(draft.cols) || 1), MAX_COLS) *
                      Math.min(Math.max(1, Number(draft.rows) || 1), MAX_ROWS)} câmeras
                  </span>
                  <button className="login-btn" style={{ padding: '7px 14px', fontSize: '0.8rem' }} onClick={applyCustom}>
                    <Check size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                    Aplicar
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            className="icon-btn"
            onClick={() => setFitMode((m) => (m === 'contain' ? 'cover' : 'contain'))}
            title={fitMode === 'contain'
              ? 'Imagem inteira (sem corte) — clique para preencher o quadro'
              : 'Preenchendo o quadro (corta as bordas) — clique para ver a imagem inteira'}
          >
            {fitMode === 'contain' ? <Scan size={17} /> : <Crop size={17} />}
          </button>

          <button className="icon-btn" onClick={clearAll} title="Limpar quadros">
            <Eraser size={17} />
          </button>
          <button className="icon-btn" onClick={rotate} title="Girar tela (paisagem/retrato)">
            <RotateCw size={17} />
          </button>
          <button className="icon-btn" onClick={toggleFullscreen} title="Tela cheia">
            {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </div>

      <div className="content">
        {/* ── árvore de câmeras ── */}
        {treeOpen && window.innerWidth <= 768 && (
          <div className="drawer-backdrop" onClick={() => setTreeOpen(false)} />
        )}
        <aside className={`tree-panel ${treeOpen ? 'open' : ''}`}>
          <div className="tree-head">
            <span>Câmeras</span>
            <button className="icon-btn" onClick={() => setTreeOpen(false)} title="Recolher lista">
              <X size={15} />
            </button>
          </div>
          <div className="tree-body">
            {groups.length === 0 && (
              <p style={{ padding: '16px', fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                Nenhuma câmera disponível.
              </p>
            )}
            {groups.map((g) => {
              const isCollapsed = collapsed[g.id];
              return (
                <div key={g.id}>
                  <div className="tree-group" onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !isCollapsed }))}>
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    <HardDrive size={14} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-faint)' }}>{g.cams.length}</span>
                  </div>
                  {!isCollapsed && g.cams.map((cam, i) => (
                    <div
                      key={cam.id}
                      className={`tree-cam ${slots.includes(cam.id) ? 'on-wall' : ''}`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/cam-id', cam.id)}
                      onClick={() => assign(cam.id)}
                      title={`Exibir no quadro ${selected + 1}`}
                    >
                      <Video size={14} color={statusMap[cam.id]?.ready ? 'var(--ok)' : 'var(--text-faint)'} />
                      <span className="name">
                        <span className="idx">[D{i + 1}]</span> {cam.name}
                      </span>
                      {statusMap[cam.id]?.recording && <span className="dot rec" />}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ── mosaico ── */}
        <div className="wall" style={gridStyle} ref={wallRef}>
          {Array.from({ length: layoutSize }, (_, cell) => {
            const cam = byId[slots[cell]];
            return (
              <div
                key={cell}
                className={`cell ${selected === cell ? 'selected' : ''}`}
                onClick={() => setSelected(cell)}
                onDoubleClick={() => { if (cam) void openFullscreen(cell); }}
                // toque longo (2s) = iniciar/parar gravação
                onPointerDown={() => { if (cam) startPress(cam); }}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
                onContextMenu={(e) => e.preventDefault()} // não abre menu ao segurar
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/cam-id');
                  if (id) putInCell(id, cell);
                }}
              >
                {cam ? (
                  <>
                    <VideoPlayer
                      ref={(r) => { playerRefs.current[cam.id] = r; }}
                      path={cam.subPath}
                      fit={fitMode}
                    />
                    {flash === cam.id && <span className="snap-flash" />}

                    {/* toque longo em andamento: barra enche em 2s */}
                    {pressing === cam.id && (
                      <>
                        <span className="press-bar" />
                        <span className="press-hint">
                          {statusMap[cam.id]?.manual ? 'Solte para encerrar…' : 'Segure para gravar…'}
                        </span>
                      </>
                    )}

                    <span className="cell-status"><StatusDot status={statusMap[cam.id]} /></span>
                    <span className="cell-label">{cam.name}</span>
                    <span className="cell-tools">
                      <button onClick={(e) => { e.stopPropagation(); void openFullscreen(cell); }} title="Tela cheia">
                        <Maximize2 size={13} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); snapshot(cam); }} title="Print da imagem">
                        <Camera size={13} />
                      </button>
                      <button
                        className={statusMap[cam.id]?.manual ? 'rec-on' : ''}
                        disabled={busyRec === cam.id}
                        onClick={(e) => { e.stopPropagation(); void toggleRecord(cam); }}
                        title={statusMap[cam.id]?.manual ? 'Parar gravação' : 'Iniciar gravação'}
                      >
                        {statusMap[cam.id]?.manual ? <Square size={13} /> : <Circle size={13} />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); clearCell(cell); }} title="Remover do quadro">
                        <X size={13} />
                      </button>
                    </span>
                  </>
                ) : (
                  <div className="cell-empty">
                    <Camera size={20} />
                    <span className="num">{cell + 1}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── câmera ampliada (stream principal, em HD) ── */}
      {expandedCam && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#000', display: 'flex', flexDirection: 'column' }}
          onDoubleClick={() => void closeExpanded()}
        >
          <div className="top-bar">
            <div className="top-bar-left">
              <Grid2x2 size={16} color="var(--text-faint)" />
              <span className="top-title">{expandedCam.name}</span>
              <span className="cam-count">{expandedCam.deviceName}</span>
            </div>
            <div className="top-bar-right">
              <StatusDot status={statusMap[expandedCam.id]} />
              <button className="icon-btn" onClick={() => snapshot(expandedCam)} title="Print da imagem">
                <Camera size={18} />
              </button>
              <button
                className={`icon-btn ${statusMap[expandedCam.id]?.manual ? 'rec-on' : ''}`}
                disabled={busyRec === expandedCam.id}
                onClick={() => void toggleRecord(expandedCam)}
                title={statusMap[expandedCam.id]?.manual ? 'Parar gravação' : 'Iniciar gravação'}
              >
                {statusMap[expandedCam.id]?.manual ? <Square size={18} /> : <Circle size={18} />}
              </button>
              <button className="icon-btn" onClick={rotate} title="Girar tela">
                <RotateCw size={18} />
              </button>
              <button className="icon-btn" onClick={() => void closeExpanded()} title="Voltar ao mosaico">
                <X size={18} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <VideoPlayer
              ref={(r) => { playerRefs.current[expandedCam.id] = r; }}
              path={expandedCam.mainPath}
              fit="contain"
              poster={poster}
            />
            {flash === expandedCam.id && <span className="snap-flash" />}
          </div>
        </div>
      )}
    </>
  );
}
