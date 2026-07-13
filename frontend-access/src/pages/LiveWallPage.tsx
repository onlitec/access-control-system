import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, ChevronLeft, ChevronRight, ChevronDown, Maximize2, Minimize2,
  PictureInPicture2, X, Video, FolderClosed, FolderOpen, HardDrive,
  Save, Trash2, Star, PanelLeftClose, PanelLeftOpen, Eraser, LayoutGrid,
  Scan, Crop, Circle, Square,
} from 'lucide-react';
import { authRequest } from '@/services/authApi';
import { LivePlayer, type LivePlayerHandle } from '@/components/vms/LivePlayer';

interface VmsChannel {
  id: string;
  name: string;
  streamPath: string;
  rtspUrlSub: string | null;
  enabled: boolean;
  groupId: string | null;
}

interface VmsDevice {
  id: string;
  name: string;
  kind: string;
  protocol: string;
  location: string | null;
  enabled: boolean;
  channels: VmsChannel[];
}

interface CameraGroup { id: string; name: string; sortOrder: number }

interface VideoLayout {
  id: string;
  name: string;
  size: number;
  slots: (string | null)[];
  isDefault: boolean;
}

interface LiveChannel {
  id: string;
  name: string;
  deviceId: string;
  deviceName: string;
  groupId: string | null;
  pathMain: string;
  pathGrid: string; // sub-stream quando existe (menos banda no mosaico)
}

export interface ChannelStatus {
  channelId: string;
  mode: string;
  ready: boolean;
  recordArmed: boolean;
  recording: boolean;
  manual?: boolean; // gravação iniciada pelo botão REC do operador
}

/** Layouts do videowall, como num NVR: 1, 4, 9, 16 e 25 divisões. */
const LAYOUTS = [
  { size: 1, cols: 1, label: '1' },
  { size: 4, cols: 2, label: '4' },
  { size: 9, cols: 3, label: '9' },
  { size: 16, cols: 4, label: '16' },
  { size: 25, cols: 5, label: '25' },
];

/** Bolinha de status de gravação (convenção CFTV): vermelho pulsando = GRAVANDO
 *  (REC), verde = câmera ok, sem gravação. */
export function RecordingDot({ status }: { status?: ChannelStatus }) {
  const recording = status?.recording ?? false;
  const title = recording
    ? 'Gravando'
    : status?.recordArmed
      ? 'Gravação ligada — aguardando sinal da câmera'
      : 'Sem gravação';
  return (
    <span
      title={title}
      className={`inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/50 ${recording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}
    />
  );
}

/** Abre a câmera numa janela destacada (popup sem barras do navegador). */
export function detachCamera(channelId: string) {
  window.open(
    `${window.location.origin}/painel/camera-view/${channelId}`,
    `onli-cam-${channelId}`,
    'popup=yes,width=960,height=560,menubar=no,toolbar=no,location=no,status=no,resizable=yes',
  );
}

/** Relógio do videowall — mesmo formato do OSD do NVR. */
function WallClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][now.getDay()];
  return (
    <span className="font-mono text-xs text-zinc-300 tabular-nums hidden lg:inline">
      {pad(now.getDate())}-{pad(now.getMonth() + 1)}-{now.getFullYear()} {dow} {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
    </span>
  );
}

export default function LiveWallPage() {
  const playerRefs = useRef<Record<string, LivePlayerHandle | null>>({});
  const [busyRec, setBusyRec] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pressing, setPressing] = useState<string | null>(null); // toque longo p/ gravar
  const [poster, setPoster] = useState<string | null>(null);     // frame de transição
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [devices, setDevices] = useState<VmsDevice[]>([]);
  const [groups, setGroups] = useState<CameraGroup[]>([]);
  const [layouts, setLayouts] = useState<VideoLayout[]>([]);
  const [loading, setLoading] = useState(true);

  const [layoutSize, setLayoutSize] = useState(4);
  /** slots[i] = channelId exibido no quadro i (null = vazio) */
  const [slots, setSlots] = useState<(string | null)[]>(Array(4).fill(null));
  const [activeLayoutName, setActiveLayoutName] = useState('');
  const [selectedCell, setSelectedCell] = useState(0);
  const [expandedCell, setExpandedCell] = useState<number | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, ChannelStatus>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  /**
   * "contain" mostra o quadro INTEIRO da câmera (nada é cortado — o OSD e as
   * bordas continuam visíveis); "cover" preenche a célula, mas corta as
   * laterais quando a proporção não bate com a do quadro.
   */
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>(
    () => (localStorage.getItem('vms_fit') as 'contain' | 'cover') || 'contain',
  );

  useEffect(() => { localStorage.setItem('vms_fit', fitMode); }, [fitMode]);

  // ── carga inicial: dispositivos, grupos e layouts salvos ──
  // Os dispositivos vêm em cache do último acesso, para os players começarem a
  // conectar de imediato em vez de esperar a resposta do servidor.
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('vms_devices') || 'null');
      if (Array.isArray(cached) && cached.length > 0) {
        setDevices(cached);
        setLoading(false);
      }
    } catch { /* cache inválido — segue com a carga normal */ }
  }, []);

  useEffect(() => {
    Promise.all([
      authRequest<{ devices: VmsDevice[] }>('/vms/devices').catch(() => ({ devices: [] })),
      authRequest<{ groups: CameraGroup[] }>('/vms/groups').catch(() => ({ groups: [] })),
      authRequest<{ layouts: VideoLayout[] }>('/vms/layouts').catch(() => ({ layouts: [] })),
    ]).then(([d, g, l]) => {
      setDevices(d.devices || []);
      if ((d.devices || []).length > 0) {
        localStorage.setItem('vms_devices', JSON.stringify(d.devices));
      }
      setGroups(g.groups || []);
      setLayouts(l.layouts || []);

      // abre no mosaico padrão, se houver; senão preenche na ordem das câmeras
      const all = (d.devices || []).flatMap((dev) => (dev.enabled ? dev.channels.filter((c) => c.enabled) : []));
      const def = (l.layouts || []).find((x) => x.isDefault);

      if (def) {
        setLayoutSize(def.size);
        // câmeras cadastradas DEPOIS do mosaico ser salvo entram nos quadros
        // livres — senão uma câmera nova simplesmente nunca apareceria
        const filled = Array.from({ length: def.size }, (_, i) => def.slots[i] ?? null);
        for (const ch of all) {
          if (filled.includes(ch.id)) continue;
          const free = filled.indexOf(null);
          if (free === -1) break;
          filled[free] = ch.id;
        }
        setSlots(filled);
        setActiveLayoutName(def.name);
      } else {
        setSlots(Array.from({ length: 4 }, (_, i) => all[i]?.id ?? null));
      }
    }).finally(() => setLoading(false));
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const data = await authRequest<{ channels: ChannelStatus[] }>('/vms/live-status');
      const map: Record<string, ChannelStatus> = {};
      for (const s of data.channels || []) map[s.channelId] = s;
      setStatusMap(map);
    } catch { /* backend/MediaMTX indisponível — mantém último estado */ }
  }, []);

  useEffect(() => {
    void loadStatus();
    const timer = setInterval(() => { void loadStatus(); }, 10_000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  useEffect(() => {
    const onFsChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const channelsById = useMemo(() => {
    const map = new Map<string, LiveChannel>();
    for (const device of devices) {
      if (!device.enabled) continue;
      for (const ch of device.channels) {
        if (!ch.enabled) continue;
        // Hikvision sempre tem sub-stream (N02); genéricas só quando cadastrada
        const hasSub = device.protocol === 'hikvision_isapi' || Boolean(ch.rtspUrlSub);
        map.set(ch.id, {
          id: ch.id,
          name: ch.name,
          deviceId: device.id,
          deviceName: device.name,
          groupId: ch.groupId,
          pathMain: ch.streamPath,
          pathGrid: hasSub ? `${ch.streamPath}-sub` : ch.streamPath,
        });
      }
    }
    return map;
  }, [devices]);

  /**
   * Árvore lateral: quando há grupos, as câmeras aparecem sob suas pastas
   * (as sem grupo caem em "Sem grupo"); sem grupos, o agrupamento é por
   * dispositivo — igual ao NVR, que lista os canais sob o aparelho.
   */
  const tree = useMemo(() => {
    const nodes: Array<{ key: string; label: string; icon: 'device' | 'folder'; channels: LiveChannel[] }> = [];
    const all = [...channelsById.values()];

    if (groups.length > 0) {
      for (const g of groups) {
        nodes.push({ key: `g:${g.id}`, label: g.name, icon: 'folder', channels: all.filter((c) => c.groupId === g.id) });
      }
      const ungrouped = all.filter((c) => !c.groupId);
      if (ungrouped.length > 0) {
        nodes.push({ key: 'g:none', label: 'Sem grupo', icon: 'folder', channels: ungrouped });
      }
    } else {
      for (const device of devices) {
        if (!device.enabled) continue;
        const chs = all.filter((c) => c.deviceId === device.id);
        if (chs.length > 0) nodes.push({ key: `d:${device.id}`, label: device.name, icon: 'device', channels: chs });
      }
    }
    return nodes;
  }, [channelsById, groups, devices]);

  const current = LAYOUTS.find((l) => l.size === layoutSize) ?? LAYOUTS[1];

  const changeLayoutSize = (size: number) => {
    setSlots((prev) => Array.from({ length: size }, (_, i) => prev[i] ?? null));
    setLayoutSize(size);
    setSelectedCell((c) => Math.min(c, size - 1));
    setDirty(true);
  };

  /** Coloca a câmera no quadro selecionado e avança a seleção (fluxo do NVR). */
  const assignToSelected = (channelId: string) => {
    setSlots((prev) => {
      const next = [...prev];
      next[selectedCell] = channelId;
      return next;
    });
    setSelectedCell((c) => (c + 1) % layoutSize);
    setDirty(true);
  };

  const assignToCell = (channelId: string, cell: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[cell] = channelId;
      return next;
    });
    setSelectedCell(cell);
    setDirty(true);
  };

  const clearCell = (cell: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[cell] = null;
      return next;
    });
    setDirty(true);
  };

  const clearAll = () => {
    setSlots(Array(layoutSize).fill(null));
    setDirty(true);
  };

  /** Print da imagem (ícone de foto dos NVRs): baixa o frame atual em JPG. */
  const snapshot = (ch: LiveChannel) => {
    const ok = playerRefs.current[ch.id]?.snapshot(ch.name);
    if (!ok) {
      alert('A imagem ainda não carregou — aguarde o vídeo aparecer.');
      return;
    }
    setFlash(ch.id);
    setTimeout(() => setFlash(null), 220);
  };

  /**
   * Atalho de gravação: segurar 2 segundos sobre a câmera inicia a gravação;
   * segurar de novo durante a gravação encerra e baixa o clipe. É o gesto mais
   * rápido para registrar uma ocorrência em andamento.
   */
  const HOLD_MS = 2000;

  const startPress = (ch: LiveChannel) => {
    if (busyRec) return;
    setPressing(ch.id);
    pressTimer.current = setTimeout(() => {
      setPressing(null);
      navigator.vibrate?.(60);
      void toggleRecord(ch);
    }, HOLD_MS);
  };

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    setPressing(null);
  };

  useEffect(() => () => { if (pressTimer.current) clearTimeout(pressTimer.current); }, []);

  /** Baixa um trecho gravado para o computador do operador. */
  const downloadSegment = (segmentId: string) => {
    const token = localStorage.getItem('auth_token') || '';
    const a = document.createElement('a');
    a.href = `${window.location.origin}/api/vms/recordings/${segmentId}/file?token=${encodeURIComponent(token)}&download=1`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  /**
   * Botão REC: liga/desliga a gravação manual no servidor.
   * Ao PARAR, o servidor devolve o clipe gravado e ele é baixado na hora — o
   * operador registra a ocorrência e já fica com o arquivo em mãos.
   */
  const toggleRecord = async (ch: LiveChannel) => {
    const active = !statusMap[ch.id]?.manual;
    setBusyRec(ch.id);
    try {
      const data = await authRequest<{ segments?: Array<{ id: string }> }>(`/vms/channels/${ch.id}/record`, {
        method: 'POST',
        body: JSON.stringify({ active }),
      });

      if (!active) {
        const segments = data.segments ?? [];
        if (segments.length === 0) {
          alert('Gravação encerrada, mas nenhum trecho foi gerado (a câmera pode ter perdido o sinal).');
        } else {
          // baixa o clipe (ou os clipes, se a gravação passou de 1 minuto)
          segments.forEach((seg, i) => setTimeout(() => downloadSegment(seg.id), i * 800));
        }
      }
      await loadStatus();
    } catch (err: any) {
      alert(err.message || 'Não foi possível acionar a gravação');
    } finally {
      setBusyRec(null);
    }
  };

  /** Duplo clique: tela cheia (e, em telas móveis, deita a tela como num NVR). */
  const openFullscreen = async (cell: number) => {
    // guarda o frame já exibido: serve de fundo enquanto o stream HD conecta,
    // em vez de a imagem sumir e a tela ficar preta
    const channelId = slots[cell];
    if (channelId) setPoster(playerRefs.current[channelId]?.frame() ?? null);

    setExpandedCell(cell);
    try {
      await document.documentElement.requestFullscreen?.();
      await (screen.orientation as any)?.lock?.('landscape');
    } catch { /* desktop/sem permissão: só o fullscreen */ }
  };

  const closeExpanded = async () => {
    setExpandedCell(null);
    try {
      (screen.orientation as any)?.unlock?.();
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch { /* ignora */ }
  };

  // ── grupos ──
  const createGroup = async () => {
    const name = prompt('Nome do grupo (pasta):');
    if (!name?.trim()) return;
    try {
      await authRequest('/vms/groups', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
      const g = await authRequest<{ groups: CameraGroup[] }>('/vms/groups');
      setGroups(g.groups || []);
    } catch (err: any) { alert(err.message || 'Erro ao criar grupo'); }
  };

  const removeGroup = async (groupId: string) => {
    if (!confirm('Remover este grupo? As câmeras voltam para "Sem grupo".')) return;
    try {
      await authRequest(`/vms/groups/${groupId}`, { method: 'DELETE' });
      const [g, d] = await Promise.all([
        authRequest<{ groups: CameraGroup[] }>('/vms/groups'),
        authRequest<{ devices: VmsDevice[] }>('/vms/devices'),
      ]);
      setGroups(g.groups || []);
      setDevices(d.devices || []);
    } catch (err: any) { alert(err.message || 'Erro ao remover grupo'); }
  };

  const moveChannelToGroup = async (channelId: string, groupId: string | null) => {
    try {
      await authRequest(`/vms/channels/${channelId}/group`, {
        method: 'PUT',
        body: JSON.stringify({ groupId }),
      });
      const d = await authRequest<{ devices: VmsDevice[] }>('/vms/devices');
      setDevices(d.devices || []);
    } catch (err: any) { alert(err.message || 'Erro ao mover câmera'); }
  };

  // ── layouts salvos ──
  const saveLayout = async (asDefault: boolean) => {
    const name = activeLayoutName || prompt('Nome do mosaico (ex.: Portaria noturno):')?.trim() || '';
    if (!name) return;
    try {
      await authRequest('/vms/layouts', {
        method: 'POST',
        body: JSON.stringify({ name, size: layoutSize, slots, isDefault: asDefault }),
      });
      const l = await authRequest<{ layouts: VideoLayout[] }>('/vms/layouts');
      setLayouts(l.layouts || []);
      setActiveLayoutName(name);
      setDirty(false);
    } catch (err: any) { alert(err.message || 'Erro ao salvar mosaico'); }
  };

  const saveLayoutAs = async () => {
    const name = prompt('Salvar mosaico como:', activeLayoutName || '')?.trim();
    if (!name) return;
    try {
      await authRequest('/vms/layouts', {
        method: 'POST',
        body: JSON.stringify({ name, size: layoutSize, slots }),
      });
      const l = await authRequest<{ layouts: VideoLayout[] }>('/vms/layouts');
      setLayouts(l.layouts || []);
      setActiveLayoutName(name);
      setDirty(false);
    } catch (err: any) { alert(err.message || 'Erro ao salvar mosaico'); }
  };

  const applyLayout = (layout: VideoLayout) => {
    setLayoutSize(layout.size);
    setSlots(Array.from({ length: layout.size }, (_, i) => layout.slots[i] ?? null));
    setActiveLayoutName(layout.name);
    setSelectedCell(0);
    setDirty(false);
  };

  const setDefaultLayout = async (layout: VideoLayout) => {
    try {
      await authRequest(`/vms/layouts/${layout.id}/default`, { method: 'PUT' });
      const l = await authRequest<{ layouts: VideoLayout[] }>('/vms/layouts');
      setLayouts(l.layouts || []);
    } catch (err: any) { alert(err.message || 'Erro ao definir padrão'); }
  };

  const deleteLayout = async (layout: VideoLayout) => {
    if (!confirm(`Excluir o mosaico "${layout.name}"?`)) return;
    try {
      await authRequest(`/vms/layouts/${layout.id}`, { method: 'DELETE' });
      const l = await authRequest<{ layouts: VideoLayout[] }>('/vms/layouts');
      setLayouts(l.layouts || []);
      if (activeLayoutName === layout.name) setActiveLayoutName('');
    } catch (err: any) { alert(err.message || 'Erro ao excluir mosaico'); }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.getElementById('videowall')?.requestFullscreen().catch(() => { /* bloqueado */ });
    }
  };

  const gridStyle = {
    gridTemplateColumns: `repeat(${current.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${Math.ceil(layoutSize / current.cols)}, minmax(0, 1fr))`,
  };

  const expandedChannel = expandedCell !== null && slots[expandedCell]
    ? channelsById.get(slots[expandedCell]!)
    : null;

  return (
    <div
      id="videowall"
      className="relative flex bg-black rounded-lg overflow-hidden border border-zinc-800"
      style={{ height: fullscreen ? '100vh' : 'calc(100vh - 8rem)' }}
    >
      {/* ══ Árvore lateral de dispositivos/câmeras ══ */}
      {sidebarOpen && (
        <aside className="w-60 shrink-0 flex flex-col bg-zinc-900 border-r border-zinc-800">
          <div className="flex items-center justify-between px-2 py-2 border-b border-zinc-800">
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Câmeras</span>
            <button
              type="button"
              title="Criar grupo (pasta)"
              onClick={createGroup}
              className="p-1 rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <FolderClosed className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {tree.length === 0 ? (
              <p className="px-3 py-4 text-xs text-zinc-600">Nenhuma câmera cadastrada.</p>
            ) : (
              tree.map((node) => {
                const isCollapsed = collapsed[node.key];
                const isGroup = node.icon === 'folder';
                const groupId = isGroup && node.key !== 'g:none' ? node.key.slice(2) : null;
                return (
                  <div key={node.key}>
                    <div
                      className="flex items-center gap-1 px-2 py-1.5 text-zinc-300 hover:bg-zinc-800/60 cursor-pointer group/node"
                      onClick={() => setCollapsed((c) => ({ ...c, [node.key]: !isCollapsed }))}
                      onDragOver={(e) => { if (groupId || node.key === 'g:none') e.preventDefault(); }}
                      onDrop={(e) => {
                        const channelId = e.dataTransfer.getData('text/channel-id');
                        if (channelId && isGroup) void moveChannelToGroup(channelId, groupId);
                      }}
                    >
                      {isCollapsed
                        ? <ChevronRight className="h-3 w-3 text-zinc-500 shrink-0" />
                        : <ChevronDown className="h-3 w-3 text-zinc-500 shrink-0" />}
                      {isGroup
                        ? (isCollapsed ? <FolderClosed className="h-3.5 w-3.5 text-amber-500/80 shrink-0" /> : <FolderOpen className="h-3.5 w-3.5 text-amber-500/80 shrink-0" />)
                        : <HardDrive className="h-3.5 w-3.5 text-zinc-400 shrink-0" />}
                      <span className="text-xs font-medium truncate flex-1">{node.label}</span>
                      <span className="text-[10px] text-zinc-600">{node.channels.length}</span>
                      {groupId && (
                        <button
                          type="button"
                          title="Remover grupo"
                          className="opacity-0 group-hover/node:opacity-100 p-0.5 rounded text-zinc-500 hover:text-red-400"
                          onClick={(e) => { e.stopPropagation(); void removeGroup(groupId); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {!isCollapsed && node.channels.map((ch, idx) => {
                      const inWall = slots.includes(ch.id);
                      const st = statusMap[ch.id];
                      return (
                        <div
                          key={ch.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData('text/channel-id', ch.id)}
                          onClick={() => assignToSelected(ch.id)}
                          onDoubleClick={() => { assignToCell(ch.id, selectedCell); }}
                          title={`${ch.name} — clique para exibir no quadro ${selectedCell + 1}, ou arraste para um quadro`}
                          className={`flex items-center gap-1.5 pl-7 pr-2 py-1 cursor-pointer text-xs ${
                            inWall ? 'bg-zinc-800/80 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
                          }`}
                        >
                          <Video className={`h-3.5 w-3.5 shrink-0 ${st?.ready ? 'text-green-500' : 'text-zinc-600'}`} />
                          <span className="truncate flex-1">
                            <span className="text-zinc-600 font-mono">[D{idx + 1}]</span> {ch.name}
                          </span>
                          {st?.recording && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse shrink-0" title="Gravando" />}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* ── mosaicos salvos ── */}
          <div className="border-t border-zinc-800 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Mosaicos salvos</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  title="Salvar mosaico atual"
                  onClick={() => void saveLayout(false)}
                  className={`p-1 rounded hover:bg-zinc-800 ${dirty ? 'text-amber-400' : 'text-zinc-400'}`}
                >
                  <Save className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Salvar como..."
                  onClick={saveLayoutAs}
                  className="p-1 rounded text-zinc-400 hover:bg-zinc-800"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {layouts.length === 0 ? (
              <p className="text-[10px] text-zinc-600">Monte o mosaico e clique em salvar.</p>
            ) : (
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {layouts.map((l) => (
                  <div
                    key={l.id}
                    className={`flex items-center gap-1 px-1.5 py-1 rounded text-xs cursor-pointer group/l ${
                      activeLayoutName === l.name ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/60'
                    }`}
                    onClick={() => applyLayout(l)}
                  >
                    <span className="truncate flex-1">{l.name}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">{l.size}</span>
                    <button
                      type="button"
                      title={l.isDefault ? 'Mosaico padrão' : 'Definir como padrão'}
                      onClick={(e) => { e.stopPropagation(); void setDefaultLayout(l); }}
                      className={l.isDefault ? 'text-amber-400' : 'opacity-0 group-hover/l:opacity-100 text-zinc-500 hover:text-amber-400'}
                    >
                      <Star className={`h-3 w-3 ${l.isDefault ? 'fill-amber-400' : ''}`} />
                    </button>
                    <button
                      type="button"
                      title="Excluir mosaico"
                      onClick={(e) => { e.stopPropagation(); void deleteLayout(l); }}
                      className="opacity-0 group-hover/l:opacity-100 text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* ══ Área do videowall ══ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* barra de controles */}
        <div className="flex items-center justify-between gap-3 px-2 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              title={sidebarOpen ? 'Ocultar lista de câmeras' : 'Mostrar lista de câmeras'}
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>
            <span className="text-sm font-semibold text-zinc-200 truncate">
              {activeLayoutName || 'Câmeras ao Vivo'}
              {dirty && <span className="text-amber-400 ml-1" title="Alterações não salvas">•</span>}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded border border-zinc-700 overflow-hidden">
              {LAYOUTS.map((l) => (
                <button
                  key={l.size}
                  type="button"
                  title={`${l.label} divisões`}
                  onClick={() => changeLayoutSize(l.size)}
                  className={`px-2.5 py-1 text-xs font-mono transition-colors ${
                    layoutSize === l.size
                      ? 'bg-zinc-200 text-zinc-900 font-bold'
                      : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              title={fitMode === 'contain'
                ? 'Imagem inteira (sem corte) — clique para preencher o quadro'
                : 'Preenchendo o quadro (corta as bordas) — clique para ver a imagem inteira'}
              onClick={() => setFitMode((m) => (m === 'contain' ? 'cover' : 'contain'))}
              className="p-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {fitMode === 'contain' ? <Scan className="h-4 w-4" /> : <Crop className="h-4 w-4" />}
            </button>

            <button
              type="button"
              title="Limpar todos os quadros"
              onClick={clearAll}
              className="p-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <Eraser className="h-4 w-4" />
            </button>

            <button
              type="button"
              title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              onClick={toggleFullscreen}
              className="p-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            <WallClock />
          </div>
        </div>

        {/* mosaico edge-to-edge */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">Carregando câmeras…</div>
        ) : (
          <div className="flex-1 grid gap-px bg-zinc-800 min-h-0" style={gridStyle}>
            {Array.from({ length: layoutSize }, (_, cell) => {
              const channelId = slots[cell];
              const ch = channelId ? channelsById.get(channelId) : null;
              const selected = selectedCell === cell;

              return (
                <div
                  key={cell}
                  className={`relative bg-black overflow-hidden group select-none cursor-pointer ${
                    selected ? 'outline outline-2 -outline-offset-2 outline-yellow-400 z-[1]' : ''
                  }`}
                  onClick={() => setSelectedCell(cell)}
                  onDoubleClick={() => { if (ch) void openFullscreen(cell); }}
                  // toque/clique longo (2s) = iniciar/parar gravação
                  onPointerDown={() => { if (ch) startPress(ch); }}
                  onPointerUp={cancelPress}
                  onPointerLeave={cancelPress}
                  onPointerCancel={cancelPress}
                  onContextMenu={(e) => e.preventDefault()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const channelId = e.dataTransfer.getData('text/channel-id');
                    if (channelId) assignToCell(channelId, cell);
                  }}
                >
                  {ch ? (
                    <>
                      <LivePlayer
                        ref={(r) => { playerRefs.current[ch.id] = r; }}
                        streamPath={ch.pathGrid}
                        label={ch.name}
                        fit={fitMode}
                        labelPosition="right"
                        className="w-full h-full"
                      />
                      {flash === ch.id && (
                        <span className="absolute inset-0 z-20 bg-white pointer-events-none animate-[snapFlash_220ms_ease-out_forwards]" />
                      )}
                      {pressing === ch.id && (
                        <>
                          <span className="absolute top-0 left-0 h-[3px] bg-red-600 z-20 pointer-events-none animate-[pressGrow_2s_linear_forwards]" />
                          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-semibold text-white whitespace-nowrap">
                            {statusMap[ch.id]?.manual ? 'Solte para encerrar…' : 'Segure para gravar…'}
                          </span>
                        </>
                      )}
                      <span className="absolute top-1.5 right-1.5 z-10">
                        <RecordingDot status={statusMap[ch.id]} />
                      </span>
                      <span className="absolute top-1.5 left-1.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title="Tela cheia"
                          className="p-1 rounded bg-black/70 text-white hover:bg-black"
                          onClick={(e) => { e.stopPropagation(); void openFullscreen(cell); }}
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Print da imagem"
                          className="p-1 rounded bg-black/70 text-white hover:bg-black"
                          onClick={(e) => { e.stopPropagation(); snapshot(ch); }}
                        >
                          <Camera className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title={statusMap[ch.id]?.manual ? 'Parar gravação' : 'Iniciar gravação'}
                          disabled={busyRec === ch.id}
                          className={`p-1 rounded text-white disabled:opacity-50 ${
                            statusMap[ch.id]?.manual ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-black/70 hover:bg-black'
                          }`}
                          onClick={(e) => { e.stopPropagation(); void toggleRecord(ch); }}
                        >
                          {statusMap[ch.id]?.manual
                            ? <Square className="h-3.5 w-3.5" />
                            : <Circle className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          title="Destacar em janela"
                          className="p-1 rounded bg-black/70 text-white hover:bg-black"
                          onClick={(e) => { e.stopPropagation(); detachCamera(ch.id); }}
                        >
                          <PictureInPicture2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Remover do quadro"
                          className="p-1 rounded bg-black/70 text-white hover:bg-black"
                          onClick={(e) => { e.stopPropagation(); clearCell(cell); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </>
                  ) : (
                    // quadro vazio: mostra o número, como num NVR
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-zinc-700">
                      <Camera className="h-5 w-5" />
                      <span className="text-[10px] font-mono">{cell + 1}</span>
                      {selected && (
                        <span className="text-[10px] text-yellow-500/70 px-2 text-center">
                          clique numa câmera da lista
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ Câmera ampliada ══ */}
      {expandedChannel && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col" onDoubleClick={() => void closeExpanded()}>
          <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
            <span className="text-sm font-semibold text-zinc-200">
              {expandedChannel.name} <span className="text-zinc-500 font-normal">— {expandedChannel.deviceName}</span>
            </span>
            <div className="flex items-center gap-2">
              <RecordingDot status={statusMap[expandedChannel.id]} />
              <button
                type="button"
                title="Print da imagem"
                className="p-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={() => snapshot(expandedChannel)}
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={statusMap[expandedChannel.id]?.manual ? 'Parar gravação' : 'Iniciar gravação'}
                disabled={busyRec === expandedChannel.id}
                className={`p-1 rounded border disabled:opacity-50 ${
                  statusMap[expandedChannel.id]?.manual
                    ? 'bg-red-600 border-red-500 text-white animate-pulse'
                    : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                }`}
                onClick={() => void toggleRecord(expandedChannel)}
              >
                {statusMap[expandedChannel.id]?.manual
                  ? <Square className="h-4 w-4" />
                  : <Circle className="h-4 w-4" />}
              </button>
              <button
                type="button"
                title="Destacar em janela"
                className="p-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={() => { detachCamera(expandedChannel.id); void closeExpanded(); }}
              >
                <PictureInPicture2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Voltar ao mosaico"
                className="p-1 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                onClick={() => void closeExpanded()}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="relative flex-1 min-h-0">
            <LivePlayer
              ref={(r) => { playerRefs.current[expandedChannel.id] = r; }}
              streamPath={expandedChannel.pathMain}
              label={expandedChannel.name}
              fit="contain"
              labelPosition="right"
              poster={poster}
              className="w-full h-full"
            />
            {flash === expandedChannel.id && (
              <span className="absolute inset-0 z-20 bg-white pointer-events-none animate-[snapFlash_220ms_ease-out_forwards]" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
