import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2, Save, Loader2, ScanEye } from 'lucide-react';
import { authFetch } from '../auth';

/**
 * Editor visual de VCA no cloud (admin): desenha zonas de movimento, áreas de
 * intrusão e linhas de cruzamento sobre um frame ao vivo da câmera, e configura
 * classes, ações, câmera de vídeo vinculada, popup e segundos de gravação.
 * Salva no servidor do tenant (mesmos endpoints do painel admin).
 */

const CLASS_OPTIONS = [
  { id: 'person', label: 'Pessoa' }, { id: 'car', label: 'Carro' }, { id: 'motorcycle', label: 'Moto' },
  { id: 'truck', label: 'Caminhão' }, { id: 'bus', label: 'Ônibus' }, { id: 'bicycle', label: 'Bicicleta' },
];
const ACTION_OPTIONS = [
  { id: 'record', label: 'Gravar' }, { id: 'alert', label: 'Alertar' },
  { id: 'snapshot', label: 'Snapshot' }, { id: 'notify', label: 'Notificar (e-mail)' },
];
const TYPE_LABEL = { motion_zone: 'Zona de movimento', intrusion: 'Intrusão de área', line_cross: 'Cruzamento de linha' };
const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4'];
const empty = { enabled: false, classes: ['person'], maxFps: 4, minScore: 0.4, cooldownSec: 15, recordSeconds: 20, linkedCameraId: null, popupOnOperator: false, rules: [] };

export default function VcaEditor({ channelId, channelName, cameras = [], onClose }) {
  const [cfg, setCfg] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [snapUrl, setSnapUrl] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const [selected, setSelected] = useState(-1);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  useEffect(() => {
    let revoke = null;
    (async () => {
      try {
        const res = await authFetch(`/api/vms/channels/${channelId}/vca`);
        const { vca } = res.ok ? await res.json() : { vca: null };
        if (vca) setCfg({ ...empty, ...vca, classes: vca.classes || ['person'] });
      } catch (e) { setError(e.message || 'Falha ao carregar'); }
      finally { setLoading(false); }
      try {
        const res = await authFetch(`/api/vms/channels/${channelId}/snapshot`);
        if (res.ok) { const b = await res.blob(); revoke = URL.createObjectURL(b); setSnapUrl(revoke); }
      } catch { /* sem imagem: desenha mesmo assim */ }
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [channelId]);

  useEffect(() => { if (!snapUrl) return; const img = new Image(); img.onload = () => { imgRef.current = img; redraw(); }; img.src = snapUrl; }, [snapUrl]);

  const redraw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, W, H); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
    const draw = (rule, color, active) => {
      const pts = rule.geometry.points; if (!pts.length) return;
      ctx.lineWidth = active ? 3 : 2; ctx.strokeStyle = color; ctx.fillStyle = color + (active ? '40' : '22');
      ctx.beginPath();
      pts.forEach(([x, y], i) => { const px = x * W, py = y * H; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      if (rule.type !== 'line_cross') { ctx.closePath(); ctx.fill(); }
      ctx.stroke(); ctx.fillStyle = color;
      pts.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x * W, y * H, active ? 5 : 4, 0, 7); ctx.fill(); });
    };
    cfg.rules.forEach((r, i) => draw(r, COLORS[i % COLORS.length], i === selected));
    if (drawing) draw({ type: drawing.type, geometry: { points: drawing.pts } }, '#fff', true);
  }, [cfg.rules, drawing, selected]);
  useEffect(() => { redraw(); }, [redraw]);

  const onClick = (e) => {
    if (!drawing) return;
    const cv = canvasRef.current; const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const pts = [...drawing.pts, [x, y]];
    if (drawing.type === 'line_cross' && pts.length === 2) return commit(pts);
    setDrawing({ ...drawing, pts });
  };
  const commit = (pts) => {
    const type = drawing.type, min = type === 'line_cross' ? 2 : 3;
    if (pts.length < min) return setDrawing(null);
    const rule = { name: `${TYPE_LABEL[type]} ${cfg.rules.length + 1}`, type, geometry: { points: pts }, direction: type === 'line_cross' ? 'both' : undefined, actions: ['record', 'alert', 'snapshot'] };
    setCfg((c) => ({ ...c, rules: [...c.rules, rule] })); setSelected(cfg.rules.length); setDrawing(null);
  };

  const toggleClass = (id) => setCfg((c) => { const s = new Set(c.classes || []); s.has(id) ? s.delete(id) : s.add(id); return { ...c, classes: [...s] }; });
  const updRule = (i, patch) => setCfg((c) => ({ ...c, rules: c.rules.map((r, j) => j === i ? { ...r, ...patch } : r) }));
  const toggleAct = (i, a) => setCfg((c) => ({ ...c, rules: c.rules.map((r, j) => { if (j !== i) return r; const s = new Set(r.actions); s.has(a) ? s.delete(a) : s.add(a); return { ...r, actions: [...s] }; }) }));
  const delRule = (i) => { setCfg((c) => ({ ...c, rules: c.rules.filter((_, j) => j !== i) })); setSelected(-1); };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const res = await authFetch(`/api/vms/channels/${channelId}/vca`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: cfg.enabled, classes: (cfg.classes && cfg.classes.length) ? cfg.classes : ['person'],
          maxFps: cfg.maxFps, minScore: cfg.minScore, cooldownSec: cfg.cooldownSec, recordSeconds: cfg.recordSeconds,
          linkedCameraId: cfg.linkedCameraId || '', popupOnOperator: cfg.popupOnOperator, rules: cfg.rules,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `Erro ${res.status}`); }
      onClose(true);
    } catch (e) { setError(e.message || 'Falha ao salvar'); if (/403|admin/i.test(String(e.message))) setError('Apenas administradores podem configurar a detecção.'); }
    finally { setSaving(false); }
  };

  const lbl = { fontSize: '0.72rem', color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: 4 };
  const chip = (a) => ({ padding: '4px 9px', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer', border: `1px solid ${a ? '#3b82f6' : '#374151'}`, background: a ? 'rgba(59,130,246,0.2)' : '#1f2937', color: '#e5e7eb' });
  const sel = { width: '100%', fontSize: '0.8rem', padding: '6px 8px', background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 6 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: '#14161a', color: '#e5e7eb', borderRadius: 12, border: '1px solid #262b33', width: 'min(1050px, 97vw)', maxHeight: '95vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #262b33' }}>
          <strong style={{ fontSize: '0.95rem', display: 'flex', gap: 8, alignItems: 'center' }}><ScanEye size={18} /> Detecção inteligente — {channelName}</strong>
          <button onClick={() => onClose(false)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="spinning" /></div> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(260px,1fr)', gap: 16, padding: 16 }}>
            <div>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
                <canvas ref={canvasRef} width={960} height={540} onClick={onClick} style={{ width: '100%', height: '100%', cursor: drawing ? 'crosshair' : 'default', display: 'block' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                {drawing ? (<>
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Clique para pontos ({drawing.pts.length}){drawing.type !== 'line_cross' ? ' — mín. 3' : ' — 2'}</span>
                  {drawing.type !== 'line_cross' && <button style={btn} onClick={() => commit(drawing.pts)}>Concluir</button>}
                  <button style={btn} onClick={() => setDrawing(null)}>Cancelar</button>
                </>) : (<>
                  <span style={{ ...lbl, margin: 0 }}>Adicionar:</span>
                  {['motion_zone', 'intrusion', 'line_cross'].map((t) => (
                    <button key={t} style={chip(false)} onClick={() => { setDrawing({ type: t, pts: [] }); setSelected(-1); }}><Plus size={12} /> {TYPE_LABEL[t]}</button>
                  ))}
                </>)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg((c) => ({ ...c, enabled: e.target.checked }))} /> <strong>Ativar detecção nesta câmera</strong>
              </label>

              <div>
                <span style={lbl}>Câmera do vídeo do evento</span>
                <select value={cfg.linkedCameraId || ''} onChange={(e) => setCfg((c) => ({ ...c, linkedCameraId: e.target.value || null }))} style={sel}>
                  <option value="">Esta câmera</option>
                  {cameras.filter((c) => c.id !== channelId).map((c) => <option key={c.id} value={c.id}>{c.deviceName} — {c.name}</option>)}
                </select>
              </div>

              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={cfg.popupOnOperator} onChange={(e) => setCfg((c) => ({ ...c, popupOnOperator: e.target.checked }))} /> Abrir popup (com som)
              </label>

              <div><span style={lbl}>Gravar por (s): {cfg.recordSeconds}</span><input type="range" min={5} max={120} step={5} value={cfg.recordSeconds} onChange={(e) => setCfg((c) => ({ ...c, recordSeconds: +e.target.value }))} style={{ width: '100%' }} /></div>

              <div>
                <span style={lbl}>Detectar</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CLASS_OPTIONS.map((o) => <span key={o.id} style={chip((cfg.classes || []).includes(o.id))} onClick={() => toggleClass(o.id)}>{o.label}</span>)}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><span style={lbl}>Sensib.: {cfg.minScore.toFixed(2)}</span><input type="range" min={0.2} max={0.8} step={0.05} value={cfg.minScore} onChange={(e) => setCfg((c) => ({ ...c, minScore: +e.target.value }))} style={{ width: '100%' }} /></div>
                <div><span style={lbl}>Análises/s: {cfg.maxFps}</span><input type="range" min={1} max={10} step={1} value={cfg.maxFps} onChange={(e) => setCfg((c) => ({ ...c, maxFps: +e.target.value }))} style={{ width: '100%' }} /></div>
              </div>

              <div>
                <span style={lbl}>Regras ({cfg.rules.length})</span>
                {cfg.rules.length === 0 && <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>Desenhe uma zona, linha ou área.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cfg.rules.map((r, i) => (
                    <div key={i} onClick={() => setSelected(i)} style={{ border: `1px solid ${i === selected ? '#3b82f6' : '#2a2f39'}`, borderRadius: 8, padding: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length] }} />
                        <input value={r.name} onChange={(e) => updRule(i, { name: e.target.value })} style={{ flex: 1, background: 'transparent', border: 'none', color: '#e5e7eb', fontSize: '0.82rem', fontWeight: 600 }} />
                        <button onClick={(e) => { e.stopPropagation(); delRule(i); }} style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}><Trash2 size={13} /></button>
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#6b7280', margin: '2px 0 6px 16px' }}>{TYPE_LABEL[r.type]}</div>
                      {r.type === 'line_cross' && (
                        <div style={{ marginLeft: 16, marginBottom: 6 }}>
                          <select value={r.direction || 'both'} onChange={(e) => updRule(i, { direction: e.target.value })} style={{ ...sel, width: 'auto', fontSize: '0.72rem' }}>
                            <option value="both">Qualquer sentido</option><option value="in">Entrando</option><option value="out">Saindo</option>
                          </select>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginLeft: 16 }}>
                        {ACTION_OPTIONS.map((a) => <span key={a.id} style={{ ...chip(r.actions.includes(a.id)), fontSize: '0.68rem', padding: '2px 6px' }} onClick={(e) => { e.stopPropagation(); toggleAct(i, a.id); }}>{a.label}</span>)}
                      </div>
                      {r.actions.includes('notify') && (
                        <input value={(r.notifyTargets?.emails || []).join(', ')} onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updRule(i, { notifyTargets: { ...r.notifyTargets, emails: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })}
                          placeholder="e-mails separados por vírgula" style={{ ...sel, marginTop: 6, marginLeft: 16, width: 'calc(100% - 16px)', fontSize: '0.72rem' }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {error && <div style={{ padding: '0 16px 8px', color: '#f87171', fontSize: '0.8rem' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', borderTop: '1px solid #262b33' }}>
          <button style={btn} onClick={() => onClose(false)}>Cancelar</button>
          <button style={{ ...btn, background: '#2563eb', borderColor: '#2563eb' }} onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="spinning" /> : <Save size={14} />} Salvar</button>
        </div>
      </div>
    </div>
  );
}

const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 8, padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer' };
