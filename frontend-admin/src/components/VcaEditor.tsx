import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Plus, Trash2, Save, Loader2, Camera, AlertCircle } from 'lucide-react';
import {
  getVcaConfig, saveVcaConfig, getCameraSnapshot,
  type VcaConfig, type VcaRule, type VcaRuleType,
} from '@/services/api';

/**
 * Editor visual de VCA (detecção inteligente por software): desenha zonas de
 * movimento, linhas de cruzamento e áreas de intrusão sobre um frame ao vivo da
 * câmera. As coordenadas são salvas NORMALIZADAS (0–1), valendo para qualquer
 * resolução do stream.
 */

const CLASS_OPTIONS = [
  { id: 'person', label: 'Pessoa' },
  { id: 'car', label: 'Carro' },
  { id: 'motorcycle', label: 'Moto' },
  { id: 'truck', label: 'Caminhão' },
  { id: 'bus', label: 'Ônibus' },
  { id: 'bicycle', label: 'Bicicleta' },
];
const ACTION_OPTIONS = [
  { id: 'record', label: 'Gravar' },
  { id: 'alert', label: 'Alertar no painel' },
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'notify', label: 'Notificar (e-mail)' },
];
const TYPE_LABEL: Record<VcaRuleType, string> = {
  motion_zone: 'Zona de movimento',
  intrusion: 'Intrusão de área',
  line_cross: 'Cruzamento de linha',
};
const RULE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];

type Pt = [number, number];

const emptyCfg: VcaConfig = { enabled: false, classes: ['person'], maxFps: 4, minScore: 0.4, cooldownSec: 15, rules: [] };

export default function VcaEditor({ channelId, channelName, onClose }: {
  channelId: string; channelName: string; onClose: () => void;
}) {
  const [cfg, setCfg] = useState<VcaConfig>(emptyCfg);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const [snapErr, setSnapErr] = useState(false);

  const [drawing, setDrawing] = useState<{ type: VcaRuleType; pts: Pt[] } | null>(null);
  const [selected, setSelected] = useState<number>(-1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // ── carga inicial: config + snapshot ──────────────────────────────────────
  useEffect(() => {
    let revoke: string | null = null;
    (async () => {
      try {
        const { vca } = await getVcaConfig(channelId);
        if (vca) setCfg({ ...emptyCfg, ...vca, classes: vca.classes ?? ['person'] });
      } catch (e: any) { setError(e.message || 'Falha ao carregar configuração'); }
      finally { setLoading(false); }
      try {
        const blob = await getCameraSnapshot(channelId);
        revoke = URL.createObjectURL(blob);
        setSnapUrl(revoke);
      } catch { setSnapErr(true); }
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [channelId]);

  // carrega a imagem de fundo
  useEffect(() => {
    if (!snapUrl) return;
    const img = new Image();
    img.onload = () => { imgRef.current = img; redraw(); };
    img.src = snapUrl;
  }, [snapUrl]);

  // ── desenho ────────────────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, W, H);
    else { ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 0, W, H); }

    const drawShape = (rule: VcaRule, color: string, active: boolean) => {
      const pts = rule.geometry.points;
      if (pts.length === 0) return;
      ctx.lineWidth = active ? 3 : 2;
      ctx.strokeStyle = color;
      ctx.fillStyle = color + (active ? '40' : '22');
      ctx.beginPath();
      pts.forEach(([x, y], i) => { const px = x * W, py = y * H; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      if (rule.type !== 'line_cross') { ctx.closePath(); ctx.fill(); }
      ctx.stroke();
      // vértices
      ctx.fillStyle = color;
      pts.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x * W, y * H, active ? 5 : 4, 0, 7); ctx.fill(); });
      // seta de direção da linha
      if (rule.type === 'line_cross' && pts.length >= 2) {
        const [a, b] = [pts[0], pts[1]];
        const mx = (a[0] + b[0]) / 2 * W, my = (a[1] + b[1]) / 2 * H;
        const ang = Math.atan2((b[1] - a[1]) * H, (b[0] - a[0]) * W) + Math.PI / 2;
        ctx.strokeStyle = color; ctx.beginPath();
        ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(ang) * 18, my + Math.sin(ang) * 18); ctx.stroke();
      }
    };

    cfg.rules.forEach((r, i) => drawShape(r, RULE_COLORS[i % RULE_COLORS.length], i === selected));
    if (drawing) drawShape({ name: '', type: drawing.type, geometry: { points: drawing.pts }, actions: [] }, '#ffffff', true);
  }, [cfg.rules, drawing, selected]);

  useEffect(() => { redraw(); }, [redraw]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const cv = canvasRef.current!; const rect = cv.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const pts = [...drawing.pts, [x, y] as Pt];
    if (drawing.type === 'line_cross' && pts.length === 2) { commitDrawing(pts); return; }
    setDrawing({ ...drawing, pts });
  };

  const commitDrawing = (pts: Pt[]) => {
    const type = drawing!.type;
    const min = type === 'line_cross' ? 2 : 3;
    if (pts.length < min) { setDrawing(null); return; }
    const rule: VcaRule = {
      name: `${TYPE_LABEL[type]} ${cfg.rules.length + 1}`,
      type, geometry: { points: pts },
      direction: type === 'line_cross' ? 'both' : undefined,
      actions: ['record', 'alert', 'snapshot'],
    };
    setCfg((c) => ({ ...c, rules: [...c.rules, rule] }));
    setSelected(cfg.rules.length);
    setDrawing(null);
  };

  // ── mutações de config ──────────────────────────────────────────────────────
  const toggleClass = (id: string) => setCfg((c) => {
    const set = new Set(c.classes || []);
    set.has(id) ? set.delete(id) : set.add(id);
    return { ...c, classes: Array.from(set) };
  });
  const updateRule = (i: number, patch: Partial<VcaRule>) =>
    setCfg((c) => ({ ...c, rules: c.rules.map((r, j) => j === i ? { ...r, ...patch } : r) }));
  const toggleRuleAction = (i: number, act: string) => setCfg((c) => ({
    ...c,
    rules: c.rules.map((r, j) => {
      if (j !== i) return r;
      const set = new Set(r.actions); set.has(act) ? set.delete(act) : set.add(act);
      return { ...r, actions: Array.from(set) };
    }),
  }));
  const deleteRule = (i: number) => { setCfg((c) => ({ ...c, rules: c.rules.filter((_, j) => j !== i) })); setSelected(-1); };

  const save = async () => {
    setSaving(true); setError('');
    try {
      await saveVcaConfig(channelId, {
        enabled: cfg.enabled,
        classes: cfg.classes && cfg.classes.length ? cfg.classes : ['person'],
        maxFps: cfg.maxFps, minScore: cfg.minScore, cooldownSec: cfg.cooldownSec,
        rules: cfg.rules,
      });
      onClose();
    } catch (e: any) { setError(e.message || 'Falha ao salvar'); }
    finally { setSaving(false); }
  };

  // ── estilos ─────────────────────────────────────────────────────────────────
  const label: React.CSSProperties = { fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 4 };
  const chip = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', cursor: 'pointer',
    border: `1px solid ${active ? 'var(--blue-500)' : 'var(--border-primary)'}`,
    background: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-primary)', color: 'var(--text-primary)',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius)', width: 'min(1100px, 96vw)', maxHeight: '94vh', overflow: 'auto', border: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border-primary)' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Camera size={18} /> Detecção inteligente — {channelName}
          </h2>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: 6 }}><X size={16} /></button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)', gap: 16, padding: 18 }}>
            {/* ── canvas ── */}
            <div>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <canvas
                  ref={canvasRef} width={960} height={540}
                  onClick={onCanvasClick}
                  style={{ width: '100%', height: '100%', cursor: drawing ? 'crosshair' : 'default', display: 'block' }}
                />
                {snapErr && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: 6 }}>
                    <AlertCircle size={22} /><span style={{ fontSize: '0.8rem' }}>Sem imagem da câmera (desenhe mesmo assim)</span>
                  </div>
                )}
              </div>
              {/* barra de desenho */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                {drawing ? (
                  <>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Clique para adicionar pontos ({drawing.pts.length}){drawing.type !== 'line_cross' ? ' — mín. 3' : ' — 2 pontos'}
                    </span>
                    {drawing.type !== 'line_cross' && (
                      <button className="btn btn-primary" style={{ padding: '4px 10px' }} onClick={() => commitDrawing(drawing.pts)}>Concluir</button>
                    )}
                    <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setDrawing(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <span style={{ ...label, margin: 0 }}>Adicionar:</span>
                    {(['motion_zone', 'intrusion', 'line_cross'] as VcaRuleType[]).map((t) => (
                      <button key={t} style={chip(false)} onClick={() => { setDrawing({ type: t, pts: [] }); setSelected(-1); }}>
                        <Plus size={12} style={{ marginRight: 4, verticalAlign: -1 }} />{TYPE_LABEL[t]}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* ── painel de config ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg((c) => ({ ...c, enabled: e.target.checked }))} />
                <strong>Ativar detecção nesta câmera</strong>
              </label>

              <div>
                <span style={label}>Detectar</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CLASS_OPTIONS.map((o) => (
                    <span key={o.id} style={chip((cfg.classes || []).includes(o.id))} onClick={() => toggleClass(o.id)}>{o.label}</span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <span style={label}>Sensibilidade (confiança): {cfg.minScore.toFixed(2)}</span>
                  <input type="range" min={0.2} max={0.8} step={0.05} value={cfg.minScore} onChange={(e) => setCfg((c) => ({ ...c, minScore: Number(e.target.value) }))} style={{ width: '100%' }} />
                </div>
                <div>
                  <span style={label}>Análises/seg (CPU): {cfg.maxFps}</span>
                  <input type="range" min={1} max={10} step={1} value={cfg.maxFps} onChange={(e) => setCfg((c) => ({ ...c, maxFps: Number(e.target.value) }))} style={{ width: '100%' }} />
                </div>
              </div>
              <div>
                <span style={label}>Intervalo entre alertas: {cfg.cooldownSec}s</span>
                <input type="range" min={1} max={120} step={1} value={cfg.cooldownSec} onChange={(e) => setCfg((c) => ({ ...c, cooldownSec: Number(e.target.value) }))} style={{ width: '100%' }} />
              </div>

              {/* regras */}
              <div>
                <span style={label}>Regras ({cfg.rules.length})</span>
                {cfg.rules.length === 0 && <p style={{ fontSize: '0.78rem', color: 'var(--text-faint)', margin: 0 }}>Desenhe uma zona, linha ou área na imagem.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cfg.rules.map((r, i) => (
                    <div key={i} onClick={() => setSelected(i)} style={{ border: `1px solid ${i === selected ? 'var(--blue-500)' : 'var(--border-primary)'}`, borderRadius: 'var(--radius-sm)', padding: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: RULE_COLORS[i % RULE_COLORS.length] }} />
                        <input value={r.name} onChange={(e) => updateRule(i, { name: e.target.value })}
                          style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600 }} />
                        <button onClick={(e) => { e.stopPropagation(); deleteRule(i); }} className="btn btn-secondary" style={{ padding: 4 }}><Trash2 size={13} /></button>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-faint)', margin: '2px 0 6px 16px' }}>{TYPE_LABEL[r.type]}</div>
                      {r.type === 'line_cross' && (
                        <div style={{ marginLeft: 16, marginBottom: 6 }}>
                          <span style={{ ...label, display: 'inline', marginRight: 6 }}>Direção:</span>
                          <select value={r.direction || 'both'} onChange={(e) => updateRule(i, { direction: e.target.value as any })}
                            style={{ fontSize: '0.75rem', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 4 }}>
                            <option value="both">Qualquer sentido</option>
                            <option value="in">Entrando</option>
                            <option value="out">Saindo</option>
                          </select>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 16 }}>
                        {ACTION_OPTIONS.map((a) => (
                          <span key={a.id} style={{ ...chip(r.actions.includes(a.id)), fontSize: '0.7rem', padding: '2px 7px' }}
                            onClick={(e) => { e.stopPropagation(); toggleRuleAction(i, a.id); }}>{a.label}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <div style={{ padding: '0 18px 8px', color: 'var(--red-400)', fontSize: '0.82rem', display: 'flex', gap: 6, alignItems: 'center' }}><AlertCircle size={14} />{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 18px', borderTop: '1px solid var(--border-primary)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
