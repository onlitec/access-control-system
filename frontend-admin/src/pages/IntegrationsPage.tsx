import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/services/api';
import {
  Settings2, Plus, Trash2, Wifi, WifiOff, DoorOpen, Camera, Save,
  Loader2, CheckCircle, AlertTriangle, X, Eye, EyeOff, RefreshCw
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface DoorbellDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  location?: string;
  enabled: boolean;
}

interface GuaritaDevice {
  id: string;
  name: string;
  ip: string;
  port: number;
  location?: string;
  enabled: boolean;
}

interface HikConfig {
  apiUrl: string;
  appKey: string;
  appSecret: string;
  syncEnabled: boolean;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-9 w-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300">
        <Icon className="h-4 w-4" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      {badge}
    </div>
  );
}

function PendingBadge() {
  return (
    <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-700/50 px-2 py-0.5 rounded-full flex items-center gap-1">
      <AlertTriangle className="h-3 w-3" /> SDK Pendente
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  // HikCentral
  const [hikConfig, setHikConfig] = useState<HikConfig>({ apiUrl: '', appKey: '', appSecret: '', syncEnabled: true });
  const [hikLoading, setHikLoading] = useState(true);
  const [hikSaving, setHikSaving] = useState(false);
  const [hikStatus, setHikStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [hikMsg, setHikMsg] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // Doorbell
  const [doorbells, setDoorbells] = useState<DoorbellDevice[]>([]);
  const [doorbellLoading, setDoorbellLoading] = useState(true);
  const [newDoorbell, setNewDoorbell] = useState({ name: '', ip: '', port: '80', username: '', password: '', location: '' });
  const [showDoorbellForm, setShowDoorbellForm] = useState(false);
  const [doorbellSaving, setDoorbellSaving] = useState(false);
  const [doorbellTesting, setDoorbellTesting] = useState(false);
  const [doorbellTestResult, setDoorbellTestResult] = useState<boolean | null>(null);
  const [showDoorbellPassword, setShowDoorbellPassword] = useState(false);

  // Guarita
  const [guaritaDevices, setGuaritaDevices] = useState<GuaritaDevice[]>([]);
  const [guaritaLoading, setGuaritaLoading] = useState(true);
  const [guaritaSdkAvailable, setGuaritaSdkAvailable] = useState(false);
  const [newGuarita, setNewGuarita] = useState({ name: '', ip: '', port: '80', location: '' });
  const [showGuaritaForm, setShowGuaritaForm] = useState(false);
  const [guaritaSaving, setGuaritaSaving] = useState(false);

  useEffect(() => {
    loadHikConfig();
    loadDoorbells();
    loadGuarita();
  }, []);

  // ── HikCentral ────────────────────────────────────────────────────────────

  async function loadHikConfig() {
    try {
      const data = await apiFetch<any>('/admin/settings');
      setHikConfig({
        apiUrl: data.apiUrl ?? '',
        appKey: data.appKey ?? '',
        appSecret: data.appSecret ?? '',
        syncEnabled: data.syncEnabled ?? true,
      });
    } catch { /* no config yet */ }
    finally { setHikLoading(false); }
  }

  async function saveHikConfig() {
    setHikSaving(true);
    setHikStatus('idle');
    setHikMsg('');
    try {
      await apiFetch('/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hikConfig),
      });
      setHikStatus('ok');
      setHikMsg('Configuração HikCentral salva.');
    } catch (err: any) {
      setHikStatus('error');
      setHikMsg(err.message);
    } finally {
      setHikSaving(false);
    }
  }

  // ── Doorbells ─────────────────────────────────────────────────────────────

  async function loadDoorbells() {
    try {
      const data = await apiFetch<any>('/doorbell/devices');
      setDoorbells(data.devices ?? []);
    } catch { setDoorbells([]); }
    finally { setDoorbellLoading(false); }
  }

  async function testDoorbellConnection() {
    setDoorbellTesting(true);
    setDoorbellTestResult(null);
    try {
      const data = await apiFetch<any>('/doorbell/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: newDoorbell.ip,
          port: parseInt(newDoorbell.port) || 80,
          username: newDoorbell.username,
          password: newDoorbell.password,
        }),
      });
      setDoorbellTestResult(data.reachable ?? false);
    } catch {
      setDoorbellTestResult(false);
    } finally {
      setDoorbellTesting(false);
    }
  }

  async function addDoorbell() {
    if (!newDoorbell.name || !newDoorbell.ip || !newDoorbell.username || !newDoorbell.password) return;
    setDoorbellSaving(true);
    try {
      await apiFetch('/doorbell/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDoorbell.name,
          ip: newDoorbell.ip,
          port: parseInt(newDoorbell.port) || 80,
          username: newDoorbell.username,
          password: newDoorbell.password,
          location: newDoorbell.location || undefined,
        }),
      });
      setNewDoorbell({ name: '', ip: '', port: '80', username: '', password: '', location: '' });
      setShowDoorbellForm(false);
      setDoorbellTestResult(null);
      await loadDoorbells();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDoorbellSaving(false);
    }
  }

  async function removeDoorbell(id: string) {
    if (!confirm('Remover este videoporteiro?')) return;
    await apiFetch(`/doorbell/devices/${id}`, { method: 'DELETE' });
    await loadDoorbells();
  }

  async function toggleDoorbell(device: DoorbellDevice) {
    await apiFetch(`/doorbell/devices/${device.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !device.enabled }),
    });
    await loadDoorbells();
  }

  // ── Guarita ───────────────────────────────────────────────────────────────

  async function loadGuarita() {
    try {
      const data = await apiFetch<any>('/guarita/devices');
      setGuaritaDevices(data.devices ?? []);
      setGuaritaSdkAvailable(data.sdkAvailable ?? false);
    } catch { setGuaritaDevices([]); }
    finally { setGuaritaLoading(false); }
  }

  async function addGuarita() {
    if (!newGuarita.name || !newGuarita.ip) return;
    setGuaritaSaving(true);
    try {
      await apiFetch('/guarita/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGuarita.name,
          ip: newGuarita.ip,
          port: parseInt(newGuarita.port) || 80,
          location: newGuarita.location || undefined,
        }),
      });
      setNewGuarita({ name: '', ip: '', port: '80', location: '' });
      setShowGuaritaForm(false);
      await loadGuarita();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGuaritaSaving(false);
    }
  }

  async function removeGuarita(id: string) {
    if (!confirm('Remover este dispositivo Guarita?')) return;
    await apiFetch(`/guarita/devices/${id}`, { method: 'DELETE' });
    await loadGuarita();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <Settings2 className="h-6 w-6 text-zinc-400" />
        <h1 className="text-2xl font-bold">Integrações</h1>
      </div>

      {/* ── HikCentral ────────────────────────────────────────────────────── */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <SectionHeader icon={Wifi} title="HikCentral Professional (ACS)" />
        {hikLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">URL da API (ex: https://192.168.1.100)</label>
                <input
                  value={hikConfig.apiUrl}
                  onChange={(e) => setHikConfig((c) => ({ ...c, apiUrl: e.target.value }))}
                  placeholder="https://10.0.0.1"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">App Key</label>
                <input
                  value={hikConfig.appKey}
                  onChange={(e) => setHikConfig((c) => ({ ...c, appKey: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">App Secret</label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={hikConfig.appSecret}
                  onChange={(e) => setHikConfig((c) => ({ ...c, appSecret: e.target.value }))}
                  className="w-full px-3 py-2 pr-10 rounded-lg bg-zinc-950 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hikConfig.syncEnabled}
                  onChange={(e) => setHikConfig((c) => ({ ...c, syncEnabled: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm">Sincronização automática habilitada</span>
              </label>
            </div>
            {hikMsg && (
              <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${hikStatus === 'ok' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50' : 'bg-red-950/40 text-red-400 border-red-800/50'}`}>
                {hikStatus === 'ok' ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {hikMsg}
              </div>
            )}
            <button
              onClick={saveHikConfig}
              disabled={hikSaving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {hikSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar HikCentral
            </button>
          </div>
        )}
      </section>

      {/* ── Videoporteiros ─────────────────────────────────────────────────── */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <SectionHeader icon={Camera} title="Videoporteiros Hikvision (ISAPI)" />
          <button
            onClick={() => { setShowDoorbellForm(!showDoorbellForm); setDoorbellTestResult(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs font-medium"
          >
            {showDoorbellForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showDoorbellForm ? 'Cancelar' : 'Adicionar'}
          </button>
        </div>

        {showDoorbellForm && (
          <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-4 space-y-3">
            <p className="text-xs text-zinc-400 font-medium">Novo Videoporteiro</p>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Nome *</label>
                <input value={newDoorbell.name} onChange={(e) => setNewDoorbell((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Portão Principal"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">IP *</label>
                <input value={newDoorbell.ip} onChange={(e) => setNewDoorbell((d) => ({ ...d, ip: e.target.value }))}
                  placeholder="192.168.1.10"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Porta</label>
                <input value={newDoorbell.port} onChange={(e) => setNewDoorbell((d) => ({ ...d, port: e.target.value }))}
                  placeholder="80"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Usuário *</label>
                <input value={newDoorbell.username} onChange={(e) => setNewDoorbell((d) => ({ ...d, username: e.target.value }))}
                  placeholder="admin"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Senha *</label>
                <div className="relative">
                  <input type={showDoorbellPassword ? 'text' : 'password'} value={newDoorbell.password}
                    onChange={(e) => setNewDoorbell((d) => ({ ...d, password: e.target.value }))}
                    className="w-full px-3 py-2 pr-8 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
                  <button type="button" onClick={() => setShowDoorbellPassword(!showDoorbellPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500">
                    {showDoorbellPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Localização</label>
                <input value={newDoorbell.location} onChange={(e) => setNewDoorbell((d) => ({ ...d, location: e.target.value }))}
                  placeholder="Portão de Entrada"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={testDoorbellConnection} disabled={doorbellTesting || !newDoorbell.ip}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs disabled:opacity-50">
                {doorbellTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Testar Conexão
              </button>
              {doorbellTestResult !== null && (
                <span className={`text-xs flex items-center gap-1 ${doorbellTestResult ? 'text-emerald-400' : 'text-red-400'}`}>
                  {doorbellTestResult ? <><CheckCircle className="h-3.5 w-3.5" /> Alcançável</> : <><AlertTriangle className="h-3.5 w-3.5" /> Inalcançável</>}
                </span>
              )}
              <button onClick={addDoorbell} disabled={doorbellSaving || !newDoorbell.name || !newDoorbell.ip || !newDoorbell.username || !newDoorbell.password}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-xs font-medium disabled:opacity-50">
                {doorbellSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Salvar
              </button>
            </div>
          </div>
        )}

        {doorbellLoading ? (
          <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
        ) : doorbells.length === 0 ? (
          <div className="text-sm text-zinc-600 py-4 text-center">Nenhum videoporteiro cadastrado</div>
        ) : (
          <div className="space-y-2">
            {doorbells.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-zinc-500">{d.ip}:{d.port}{d.location ? ` — ${d.location}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${d.enabled ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                    {d.enabled ? 'Ativo' : 'Inativo'}
                  </span>
                  <button onClick={() => toggleDoorbell(d)} className="text-zinc-500 hover:text-zinc-300 text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors">
                    {d.enabled ? 'Desativar' : 'Ativar'}
                  </button>
                  <button onClick={() => removeDoorbell(d.id)} className="text-red-500 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Nice Guarita IP ─────────────────────────────────────────────────── */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between">
          <SectionHeader icon={DoorOpen} title="Nice Guarita IP (Controle de Portão)" badge={!guaritaSdkAvailable ? <PendingBadge /> : undefined} />
          <button
            onClick={() => setShowGuaritaForm(!showGuaritaForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs font-medium"
          >
            {showGuaritaForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showGuaritaForm ? 'Cancelar' : 'Adicionar'}
          </button>
        </div>

        {!guaritaSdkAvailable && (
          <div className="flex items-start gap-2 bg-amber-950/20 border border-amber-800/30 rounded-xl px-4 py-3 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">SDK Nice Guarita IP em implantação</p>
              <p className="text-xs text-amber-500/80 mt-0.5">
                Você pode cadastrar os dispositivos agora. O controle de portão será habilitado automaticamente quando o SDK estiver integrado.
              </p>
            </div>
          </div>
        )}

        {showGuaritaForm && (
          <div className="bg-zinc-950 border border-zinc-700 rounded-xl p-4 space-y-3">
            <p className="text-xs text-zinc-400 font-medium">Novo Dispositivo Guarita</p>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Nome *</label>
                <input value={newGuarita.name} onChange={(e) => setNewGuarita((g) => ({ ...g, name: e.target.value }))}
                  placeholder="Guarita Principal"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">IP *</label>
                <input value={newGuarita.ip} onChange={(e) => setNewGuarita((g) => ({ ...g, ip: e.target.value }))}
                  placeholder="192.168.1.20"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">Porta</label>
                <input value={newGuarita.port} onChange={(e) => setNewGuarita((g) => ({ ...g, port: e.target.value }))}
                  placeholder="80"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div className="md:col-span-3 space-y-1">
                <label className="text-xs text-zinc-500">Localização</label>
                <input value={newGuarita.location} onChange={(e) => setNewGuarita((g) => ({ ...g, location: e.target.value }))}
                  placeholder="Portão Veicular"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
            </div>
            <button onClick={addGuarita} disabled={guaritaSaving || !newGuarita.name || !newGuarita.ip}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-xs font-medium disabled:opacity-50">
              {guaritaSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Salvar Dispositivo
            </button>
          </div>
        )}

        {guaritaLoading ? (
          <div className="text-sm text-zinc-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
        ) : guaritaDevices.length === 0 ? (
          <div className="text-sm text-zinc-600 py-4 text-center">Nenhum dispositivo Guarita cadastrado</div>
        ) : (
          <div className="space-y-2">
            {guaritaDevices.map((g) => (
              <div key={g.id} className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{g.name}</p>
                  <p className="text-xs text-zinc-500">{g.ip}:{g.port}{g.location ? ` — ${g.location}` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${g.enabled ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>
                    {g.enabled ? 'Ativo' : 'Inativo'}
                  </span>
                  <button onClick={() => removeGuarita(g.id)} className="text-red-500 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
