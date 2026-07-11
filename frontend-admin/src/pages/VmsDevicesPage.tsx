import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/services/api';
import {
  Video, Plus, Trash2, X, Loader2, CheckCircle2, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, Search, Save, Camera,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface RecordingConfig {
  id: string;
  mode: string;
  schedule: Array<{ dow: number[]; start: string; end: string }> | null;
  eventTypes: string[] | null;
  postEventSec: number;
  retentionDays: number;
  useSubStream: boolean;
}

interface VmsChannel {
  id: string;
  channelNo: number;
  name: string;
  streamPath: string;
  rtspUrlMain: string | null;
  rtspUrlSub: string | null;
  enabled: boolean;
  recording: RecordingConfig | null;
}

interface VmsDevice {
  id: string;
  name: string;
  kind: string;
  protocol: string;
  ip: string;
  httpPort: number;
  rtspPort: number;
  username: string;
  location: string | null;
  enabled: boolean;
  channels: VmsChannel[];
  _pingStatus?: 'checking' | 'online' | 'offline';
}

const KIND_LABEL: Record<string, string> = { nvr: 'NVR', dvr: 'DVR', ip_camera: 'Câmera IP' };
const MODE_LABEL: Record<string, string> = { off: 'Desligada', continuous: 'Contínua', scheduled: 'Agendada', motion: 'Por evento' };
const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Eventos que podem disparar a gravação (mode=motion). VMD é a detecção de
// movimento básica (ativada automaticamente na câmera ao salvar); os VCA
// exigem desenhar linhas/áreas na interface web da própria câmera.
const EVENT_TYPE_OPTIONS: Array<{ value: string; label: string; vca: boolean }> = [
  { value: 'vmd', label: 'Movimento', vca: false },
  { value: 'linedetection', label: 'Cruzamento de linha', vca: true },
  { value: 'fielddetection', label: 'Intrusão em área', vca: true },
  { value: 'regionentrance', label: 'Entrada em região', vca: true },
  { value: 'regionexiting', label: 'Saída de região', vca: true },
  { value: 'scenechangedetection', label: 'Câmera deslocada/coberta', vca: true },
];

const emptyDevice = {
  name: '', kind: 'ip_camera', protocol: 'hikvision_isapi', ip: '',
  httpPort: '80', rtspPort: '554', username: 'admin', password: '', location: '',
  rtspUrlMain: '', rtspUrlSub: '',
};

// ── Main Component ──────────────────────────────────────────────────────────

export default function VmsDevicesPage() {
  const [devices, setDevices] = useState<VmsDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newDevice, setNewDevice] = useState(emptyDevice);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState<string | null>(null);
  const [newChannel, setNewChannel] = useState({ channelNo: '', name: '', rtspUrlMain: '', rtspUrlSub: '' });
  const [recForm, setRecForm] = useState<Record<string, { mode: string; retentionDays: string; postEventSec: string; useSubStream: boolean; dow: number[]; start: string; end: string; eventTypes: string[] }>>({});
  const [recSaving, setRecSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ devices: VmsDevice[] }>('/vms/devices');
      const list = data.devices ?? [];
      setDevices(list);
      // preenche os formulários de gravação com o estado atual de cada canal
      const forms: typeof recForm = {};
      for (const device of list) {
        for (const ch of device.channels) {
          const window0 = ch.recording?.schedule?.[0];
          forms[ch.id] = {
            mode: ch.recording?.mode ?? 'off',
            retentionDays: String(ch.recording?.retentionDays ?? 7),
            postEventSec: String(ch.recording?.postEventSec ?? 30),
            useSubStream: ch.recording?.useSubStream ?? false,
            dow: window0?.dow ?? [1, 2, 3, 4, 5],
            start: window0?.start ?? '22:00',
            end: window0?.end ?? '06:00',
            eventTypes: Array.isArray(ch.recording?.eventTypes) && ch.recording.eventTypes.length > 0
              ? ch.recording.eventTypes
              : ['vmd'],
          };
        }
      }
      setRecForm(forms);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dispositivos');
    } finally { setLoading(false); }
  }

  async function testConnection() {
    setTesting(true); setTestResult(null);
    try {
      const data = await apiFetch<{ reachable: boolean }>('/vms/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocol: newDevice.protocol, ip: newDevice.ip,
          httpPort: parseInt(newDevice.httpPort) || 80,
          rtspPort: parseInt(newDevice.rtspPort) || 554,
          username: newDevice.username, password: newDevice.password,
        }),
      });
      setTestResult(data.reachable);
    } catch { setTestResult(false); }
    finally { setTesting(false); }
  }

  async function addDevice() {
    setSaving(true); setError('');
    try {
      await apiFetch('/vms/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDevice.name, kind: newDevice.kind, protocol: newDevice.protocol,
          ip: newDevice.ip,
          httpPort: parseInt(newDevice.httpPort) || 80,
          rtspPort: parseInt(newDevice.rtspPort) || 554,
          username: newDevice.username, password: newDevice.password,
          location: newDevice.location || null,
          rtspUrlMain: newDevice.rtspUrlMain || null,
          rtspUrlSub: newDevice.rtspUrlSub || null,
        }),
      });
      setNewDevice(emptyDevice); setShowForm(false); setTestResult(null);
      await load();
    } catch (err: any) { setError(err.message || 'Erro ao salvar dispositivo'); }
    finally { setSaving(false); }
  }

  async function toggleDevice(device: VmsDevice) {
    await apiFetch(`/vms/devices/${device.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !device.enabled }),
    });
    await load();
  }

  async function removeDevice(id: string) {
    if (!confirm('Remover este dispositivo e todos os seus canais? As gravações antigas continuam no disco.')) return;
    await apiFetch(`/vms/devices/${id}`, { method: 'DELETE' });
    await load();
  }

  async function pingDevice(device: VmsDevice) {
    setDevices((list) => list.map((d) => (d.id === device.id ? { ...d, _pingStatus: 'checking' } : d)));
    try {
      const data = await apiFetch<{ online: boolean }>(`/vms/devices/${device.id}/ping`);
      setDevices((list) => list.map((d) => (d.id === device.id ? { ...d, _pingStatus: data.online ? 'online' : 'offline' } : d)));
    } catch {
      setDevices((list) => list.map((d) => (d.id === device.id ? { ...d, _pingStatus: 'offline' } : d)));
    }
  }

  async function discoverChannels(deviceId: string) {
    setDiscovering(deviceId); setError('');
    try {
      const data = await apiFetch<{ discovered: number; created: number }>(`/vms/devices/${deviceId}/discover`, { method: 'POST' });
      alert(`${data.discovered} canal(is) encontrado(s), ${data.created} novo(s) cadastrado(s).`);
      await load();
    } catch (err: any) { setError(err.message || 'Erro na descoberta de canais'); }
    finally { setDiscovering(null); }
  }

  async function addChannel(deviceId: string) {
    if (!newChannel.channelNo || !newChannel.name) return;
    const device = devices.find((d) => d.id === deviceId);
    const channelNo = parseInt(newChannel.channelNo);
    if (device?.channels.some((c) => c.channelNo === channelNo)) {
      setError(`O canal ${channelNo} já existe em "${device.name}"${device.kind === 'ip_camera' ? ' (câmeras IP têm o canal 1 criado automaticamente no cadastro)' : ''}. Use outro número ou edite/exclua o canal existente.`);
      return;
    }
    setError('');
    try {
      await apiFetch(`/vms/devices/${deviceId}/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelNo: parseInt(newChannel.channelNo),
          name: newChannel.name,
          rtspUrlMain: newChannel.rtspUrlMain || null,
          rtspUrlSub: newChannel.rtspUrlSub || null,
        }),
      });
      setNewChannel({ channelNo: '', name: '', rtspUrlMain: '', rtspUrlSub: '' });
      await load();
    } catch (err: any) { setError(err.message || 'Erro ao adicionar canal'); }
  }

  async function toggleChannel(ch: VmsChannel) {
    await apiFetch(`/vms/channels/${ch.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !ch.enabled }),
    });
    await load();
  }

  async function removeChannel(id: string) {
    if (!confirm('Remover este canal?')) return;
    await apiFetch(`/vms/channels/${id}`, { method: 'DELETE' });
    await load();
  }

  async function saveRecording(channelId: string) {
    const form = recForm[channelId];
    if (!form) return;
    setRecSaving(channelId); setError('');
    try {
      const result = await apiFetch<{ motionDetection: boolean | null }>(`/vms/channels/${channelId}/recording`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: form.mode,
          retentionDays: parseInt(form.retentionDays) || 7,
          postEventSec: parseInt(form.postEventSec) || 30,
          useSubStream: form.useSubStream,
          schedule: form.mode === 'scheduled' ? [{ dow: form.dow, start: form.start, end: form.end }] : null,
          eventTypes: form.mode === 'motion' ? form.eventTypes : null,
        }),
      });
      if (form.mode === 'motion' && form.eventTypes.includes('vmd') && result.motionDetection === false) {
        alert('Não consegui ativar a detecção de movimento na câmera — ative manualmente na interface web dela (Evento > Detecção de Movimento).');
      }
      if (form.mode === 'motion' && form.eventTypes.some((t) => t !== 'vmd')) {
        alert('Eventos VCA (linha/intrusão/região) exigem que as linhas e áreas estejam desenhadas na interface web da câmera (Evento > Evento Inteligente).');
      }
      await load();
    } catch (err: any) { setError(err.message || 'Erro ao salvar gravação'); }
    finally { setRecSaving(null); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1><Video size={24} /> Gerenciador de Imagens (VMS)</h1>
          <p>Cadastre NVRs, DVRs e câmeras IP, e configure a gravação de cada câmera</p>
        </div>
        <button
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => { setShowForm(!showForm); setTestResult(null); }}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cancelar' : 'Adicionar dispositivo'}
        </button>
      </div>

      {error && (
        <div style={alertStyle('error')}><AlertTriangle size={16} /><span>{error}</span></div>
      )}

      {showForm && (
        <div style={formBoxStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
            <Field label="Nome identificador"><input value={newDevice.name} onChange={(e) => setNewDevice((d) => ({ ...d, name: e.target.value }))} placeholder="Ex: NVR Portaria" style={inputStyle} /></Field>
            <Field label="Tipo">
              <select value={newDevice.kind} onChange={(e) => setNewDevice((d) => ({ ...d, kind: e.target.value }))} style={inputStyle}>
                <option value="ip_camera">Câmera IP</option>
                <option value="nvr">NVR</option>
                <option value="dvr">DVR</option>
              </select>
            </Field>
            <Field label="Protocolo">
              <select value={newDevice.protocol} onChange={(e) => setNewDevice((d) => ({ ...d, protocol: e.target.value }))} style={inputStyle}>
                <option value="hikvision_isapi">Hikvision (ISAPI)</option>
                <option value="onvif">ONVIF</option>
                <option value="rtsp">RTSP genérico</option>
              </select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
            <Field label="Endereço IP"><input value={newDevice.ip} onChange={(e) => setNewDevice((d) => ({ ...d, ip: e.target.value }))} placeholder="192.168.1.100" style={inputStyle} /></Field>
            <Field label="Porta HTTP"><input value={newDevice.httpPort} onChange={(e) => setNewDevice((d) => ({ ...d, httpPort: e.target.value }))} placeholder="80" style={inputStyle} /></Field>
            <Field label="Porta RTSP"><input value={newDevice.rtspPort} onChange={(e) => setNewDevice((d) => ({ ...d, rtspPort: e.target.value }))} placeholder="554" style={inputStyle} /></Field>
            <Field label="Usuário"><input value={newDevice.username} onChange={(e) => setNewDevice((d) => ({ ...d, username: e.target.value }))} placeholder="admin" style={inputStyle} /></Field>
            <Field label="Senha"><input type="password" value={newDevice.password} onChange={(e) => setNewDevice((d) => ({ ...d, password: e.target.value }))} placeholder="••••••••" style={inputStyle} /></Field>
            <Field label="Localização"><input value={newDevice.location} onChange={(e) => setNewDevice((d) => ({ ...d, location: e.target.value }))} placeholder="Ex: Guarita" style={inputStyle} /></Field>
          </div>
          {newDevice.protocol !== 'hikvision_isapi' && newDevice.kind === 'ip_camera' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <Field label="URL RTSP (stream principal)"><input value={newDevice.rtspUrlMain} onChange={(e) => setNewDevice((d) => ({ ...d, rtspUrlMain: e.target.value }))} placeholder="rtsp://user:senha@192.168.1.100:554/stream1" style={inputStyle} /></Field>
              <Field label="URL RTSP (sub-stream, opcional)"><input value={newDevice.rtspUrlSub} onChange={(e) => setNewDevice((d) => ({ ...d, rtspUrlSub: e.target.value }))} placeholder="rtsp://user:senha@192.168.1.100:554/stream2" style={inputStyle} /></Field>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button onClick={testConnection} disabled={testing || !newDevice.ip} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {testing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                Testar Conectividade
              </button>
              {testResult !== null && (
                <span style={{ fontSize: '0.85rem', fontWeight: 500, color: testResult ? 'var(--green-400)' : 'var(--red-400)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {testResult ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  {testResult ? 'Dispositivo alcançável!' : 'Falha na conexão.'}
                </span>
              )}
            </div>
            <button onClick={addDevice} disabled={saving || !newDevice.name || !newDevice.ip || !newDevice.username || !newDevice.password} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {saving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
              Salvar dispositivo
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
        {loading ? (
          <Loading label="Carregando dispositivos..." />
        ) : devices.length === 0 ? (
          <EmptyState label="Nenhum NVR/DVR/câmera cadastrado ainda." />
        ) : (
          devices.map((device) => (
            <div key={device.id} className="settings-card" style={{ margin: 0, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--blue-400)', display: 'inline-flex' }}>
                    <Camera size={18} />
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.95rem' }}>{device.name}</strong>
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                      {KIND_LABEL[device.kind] ?? device.kind} · {device.ip}:{device.httpPort} · {device.channels.length} canal(is)
                      {device.location ? ` — ${device.location}` : ''}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {device._pingStatus === 'checking' ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : device._pingStatus ? (
                    <StatusBadge enabled={device._pingStatus === 'online'} enabledLabel="Online" disabledLabel="Offline" />
                  ) : null}
                  <button onClick={() => pingDevice(device)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto' }}>Ping</button>
                  {device.protocol === 'hikvision_isapi' && device.kind !== 'ip_camera' && (
                    <button onClick={() => discoverChannels(device.id)} disabled={discovering === device.id} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {discovering === device.id ? <Loader2 className="animate-spin" size={12} /> : <Search size={12} />}
                      Descobrir canais
                    </button>
                  )}
                  <StatusBadge enabled={device.enabled} enabledLabel="Ativo" disabledLabel="Pausado" />
                  <button onClick={() => toggleDevice(device)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto' }}>{device.enabled ? 'Pausar' : 'Ativar'}</button>
                  <button onClick={() => removeDevice(device.id)} className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto', color: 'var(--red-400)', borderColor: 'rgba(239, 68, 68, 0.2)' }}><Trash2 size={14} /></button>
                  <button onClick={() => setExpandedId(expandedId === device.id ? null : device.id)} className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto' }}>
                    {expandedId === device.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>

              {expandedId === device.id && (
                <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {device.channels.map((ch) => {
                    const form = recForm[ch.id];
                    return (
                      <div key={ch.id} style={{ ...deviceRowStyle, flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong style={{ fontSize: '0.9rem' }}>Canal {ch.channelNo} — {ch.name}</strong>
                            <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block' }}>
                              path: {ch.streamPath} · gravação: {MODE_LABEL[ch.recording?.mode ?? 'off']}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <StatusBadge enabled={ch.enabled} enabledLabel="Habilitado" disabledLabel="Desabilitado" />
                            <button onClick={() => toggleChannel(ch)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto' }}>{ch.enabled ? 'Desabilitar' : 'Habilitar'}</button>
                            <button onClick={() => removeChannel(ch.id)} className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto', color: 'var(--red-400)', borderColor: 'rgba(239, 68, 68, 0.2)' }}><Trash2 size={14} /></button>
                          </div>
                        </div>

                        {form && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', paddingTop: '8px', borderTop: '1px dashed var(--border-primary)' }}>
                            <Field label="Modo de gravação">
                              <select value={form.mode} onChange={(e) => setRecForm((f) => ({ ...f, [ch.id]: { ...form, mode: e.target.value } }))} style={{ ...inputStyle, width: '170px' }}>
                                <option value="off">Desligada</option>
                                <option value="continuous">Contínua (24/7)</option>
                                <option value="scheduled">Agendada</option>
                                <option value="motion">Por evento (movimento/VCA)</option>
                              </select>
                            </Field>
                            <Field label="Retenção (dias)">
                              <input value={form.retentionDays} onChange={(e) => setRecForm((f) => ({ ...f, [ch.id]: { ...form, retentionDays: e.target.value } }))} style={{ ...inputStyle, width: '90px' }} />
                            </Field>
                            {form.mode === 'motion' && (
                              <>
                                <Field label="Pós-evento (s)">
                                  <input value={form.postEventSec} onChange={(e) => setRecForm((f) => ({ ...f, [ch.id]: { ...form, postEventSec: e.target.value } }))} style={{ ...inputStyle, width: '90px' }} />
                                </Field>
                                <Field label="Eventos que disparam a gravação">
                                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', minHeight: '36px' }}>
                                    {EVENT_TYPE_OPTIONS.map((opt) => (
                                      <label key={opt.value} title={opt.vca ? 'Evento VCA: configure linhas/áreas na interface web da câmera' : 'Ativado automaticamente na câmera ao salvar'} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                        <input
                                          type="checkbox"
                                          checked={form.eventTypes.includes(opt.value)}
                                          onChange={(e) => setRecForm((f) => ({
                                            ...f,
                                            [ch.id]: {
                                              ...form,
                                              eventTypes: e.target.checked
                                                ? [...form.eventTypes, opt.value]
                                                : form.eventTypes.filter((t) => t !== opt.value),
                                            },
                                          }))}
                                        />
                                        {opt.label}{opt.vca ? ' (VCA)' : ''}
                                      </label>
                                    ))}
                                  </div>
                                </Field>
                              </>
                            )}
                            {form.mode === 'scheduled' && (
                              <>
                                <Field label="Dias">
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    {DOW_LABELS.map((label, dow) => (
                                      <button
                                        key={dow}
                                        type="button"
                                        onClick={() => setRecForm((f) => ({
                                          ...f,
                                          [ch.id]: {
                                            ...form,
                                            dow: form.dow.includes(dow) ? form.dow.filter((d) => d !== dow) : [...form.dow, dow].sort(),
                                          },
                                        }))}
                                        className="btn btn-secondary"
                                        style={{
                                          padding: '4px 8px', fontSize: '0.7rem', minWidth: 'auto',
                                          ...(form.dow.includes(dow) ? { background: 'rgba(59, 130, 246, 0.2)', color: 'var(--blue-400)', borderColor: 'rgba(59, 130, 246, 0.4)' } : {}),
                                        }}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                </Field>
                                <Field label="Início"><input type="time" value={form.start} onChange={(e) => setRecForm((f) => ({ ...f, [ch.id]: { ...form, start: e.target.value } }))} style={{ ...inputStyle, width: '110px' }} /></Field>
                                <Field label="Fim"><input type="time" value={form.end} onChange={(e) => setRecForm((f) => ({ ...f, [ch.id]: { ...form, end: e.target.value } }))} style={{ ...inputStyle, width: '110px' }} /></Field>
                              </>
                            )}
                            {form.mode !== 'off' && (
                              <Field label="Fonte">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', height: '36px' }}>
                                  <input type="checkbox" checked={form.useSubStream} onChange={(e) => setRecForm((f) => ({ ...f, [ch.id]: { ...form, useSubStream: e.target.checked } }))} />
                                  Gravar sub-stream (menos disco)
                                </label>
                              </Field>
                            )}
                            <button onClick={() => saveRecording(ch.id)} disabled={recSaving === ch.id} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.8rem' }}>
                              {recSaving === ch.id ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                              Salvar gravação
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <Field label="Nº do canal"><input value={newChannel.channelNo} onChange={(e) => setNewChannel((c) => ({ ...c, channelNo: e.target.value }))} placeholder="1" style={{ ...inputStyle, width: '80px' }} /></Field>
                    <Field label="Nome do canal"><input value={newChannel.name} onChange={(e) => setNewChannel((c) => ({ ...c, name: e.target.value }))} placeholder="Ex: Garagem" style={{ ...inputStyle, width: '180px' }} /></Field>
                    {device.protocol !== 'hikvision_isapi' && (
                      <>
                        <Field label="URL RTSP main"><input value={newChannel.rtspUrlMain} onChange={(e) => setNewChannel((c) => ({ ...c, rtspUrlMain: e.target.value }))} placeholder="rtsp://..." style={{ ...inputStyle, width: '220px' }} /></Field>
                        <Field label="URL RTSP sub (opcional)"><input value={newChannel.rtspUrlSub} onChange={(e) => setNewChannel((c) => ({ ...c, rtspUrlSub: e.target.value }))} placeholder="rtsp://..." style={{ ...inputStyle, width: '220px' }} /></Field>
                      </>
                    )}
                    <button onClick={() => addChannel(device.id)} disabled={!newChannel.channelNo || !newChannel.name} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.8rem' }}>
                      <Plus size={14} /> Adicionar canal
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Small helpers (mesmo padrão da IntegrationsPage) ────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  width: '100%',
  boxSizing: 'border-box',
};

const formBoxStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  padding: '20px',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border-primary)',
  display: 'flex',
  flexDirection: 'column',
  gap: '15px',
  marginTop: '15px',
};

const deviceRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 18px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-sm)',
};

function alertStyle(variant: 'success' | 'error'): React.CSSProperties {
  const color = variant === 'success' ? '34, 197, 94' : '239, 68, 68';
  return {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px 15px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem',
    background: `rgba(${color}, 0.12)`,
    color: variant === 'success' ? 'var(--green-400)' : 'var(--red-400)',
    border: `1px solid rgba(${color}, 0.3)`,
    marginTop: '15px',
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label className="text-muted" style={{ fontSize: '0.8rem' }}>{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ enabled, enabledLabel, disabledLabel }: { enabled: boolean; enabledLabel: string; disabledLabel: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, borderRadius: '4px',
      background: enabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
      color: enabled ? 'var(--green-400)' : 'var(--text-muted)',
      border: `1px solid ${enabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(100, 116, 139, 0.3)'}`,
    }}>
      {enabled ? enabledLabel : disabledLabel}
    </span>
  );
}

function Loading({ label }: { label: string }) {
  return <div style={{ color: 'var(--text-muted)', display: 'flex', gap: '10px', alignItems: 'center' }}><Loader2 className="animate-spin" size={16} /> {label}</div>;
}

function EmptyState({ label }: { label: string }) {
  return <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', margin: 0 }}>{label}</p>;
}
