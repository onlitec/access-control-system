import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/services/api';
import {
  Settings2, Plus, Trash2, Wifi, WifiOff, DoorOpen, Camera, Save,
  Loader2, CheckCircle, AlertTriangle, X, Eye, EyeOff,
  CheckCircle2, RefreshCw, Search, Signal, SignalZero, Clock,
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
  sdkConfig?: Record<string, unknown> | null;
  _pingStatus?: 'checking' | 'online' | 'offline';
  _deviceCount?: number | null;
}

interface PassbackState {
  personId: string;
  personName: string;
  unit: string | null;
  tower: string | null;
  serial: string;
  occurredAt: string;
}

interface DiscoveredGuarita {
  ip: string;
  deviceCount: number | null;
  clock: string | null;
}

interface HikConfig {
  apiUrl: string;
  appKey: string;
  appSecret: string;
  syncEnabled: boolean;
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

  // Guarita
  const [guaritaDevices, setGuaritaDevices] = useState<GuaritaDevice[]>([]);
  const [guaritaLoading, setGuaritaLoading] = useState(true);
  const [newGuarita, setNewGuarita] = useState({ name: '', ip: '', port: '9000', location: '' });
  const [showGuaritaForm, setShowGuaritaForm] = useState(false);
  const [guaritaSaving, setGuaritaSaving] = useState(false);
  const [guaritaTesting, setGuaritaTesting] = useState(false);
  const [guaritaSyncing, setGuaritaSyncing] = useState<string | null>(null);
  const [guaritaTestResult, setGuaritaTestResult] = useState<{ online: boolean; deviceCount?: number | null; clock?: string | null } | null>(null);

  // Anti-Passback
  const [apbEnabled, setApbEnabled] = useState(false);
  const [apbSaving, setApbSaving] = useState(false);
  const [apbStates, setApbStates] = useState<PassbackState[]>([]);
  const [apbStatesLoading, setApbStatesLoading] = useState(false);
  const [showApbStates, setShowApbStates] = useState(false);

  // Discovery
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [discoverSubnet, setDiscoverSubnet] = useState('');
  const [discoverPort, setDiscoverPort] = useState('9000');
  const [discovering, setDiscovering] = useState(false);
  const [discoveryResults, setDiscoveryResults] = useState<DiscoveredGuarita[]>([]);
  const [discoveryDone, setDiscoveryDone] = useState(false);

  useEffect(() => {
    loadHikConfig();
    loadDoorbells();
    loadGuarita();
    loadApbSettings();
    detectSubnet();
  }, []);

  async function detectSubnet() {
    try {
      const data = await apiFetch<any>('/guarita/status');
      if (data.serverIp) {
        const parts = data.serverIp.split('.').slice(0, 3).join('.');
        setDiscoverSubnet(parts);
      }
    } catch { /* ignore */ }
  }

  // ── HikCentral ────────────────────────────────────────────────────────────

  async function loadHikConfig() {
    try {
      const data = await apiFetch<any>('/hik-config');
      setHikConfig({
        apiUrl: data.apiUrl ?? data.api_url ?? '',
        appKey: data.appKey ?? data.app_key ?? '',
        appSecret: data.appSecret ?? data.app_secret ?? '',
        syncEnabled: data.syncEnabled ?? data.sync_enabled ?? true,
      });
    } catch { /* no config yet */ }
    finally { setHikLoading(false); }
  }

  async function saveHikConfig() {
    setHikSaving(true); setHikStatus('idle'); setHikMsg('');
    try {
      await apiFetch('/hik-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: hikConfig.apiUrl,
          appKey: hikConfig.appKey,
          appSecret: hikConfig.appSecret,
          syncEnabled: hikConfig.syncEnabled,
        }),
      });
      setHikStatus('ok');
      setHikMsg('Configuração HikCentral salva com sucesso.');
    } catch (err: any) {
      setHikStatus('error');
      setHikMsg(err.message || 'Erro ao salvar configuração.');
    } finally { setHikSaving(false); }
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
    setDoorbellTesting(true); setDoorbellTestResult(null);
    try {
      const data = await apiFetch<any>('/doorbell/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: newDoorbell.ip, port: parseInt(newDoorbell.port) || 80, username: newDoorbell.username, password: newDoorbell.password }),
      });
      setDoorbellTestResult(data.reachable ?? false);
    } catch { setDoorbellTestResult(false); }
    finally { setDoorbellTesting(false); }
  }

  async function addDoorbell() {
    if (!newDoorbell.name || !newDoorbell.ip || !newDoorbell.username || !newDoorbell.password) return;
    setDoorbellSaving(true);
    try {
      await apiFetch('/doorbell/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDoorbell.name, ip: newDoorbell.ip, port: parseInt(newDoorbell.port) || 80, username: newDoorbell.username, password: newDoorbell.password, location: newDoorbell.location || undefined }),
      });
      setNewDoorbell({ name: '', ip: '', port: '80', username: '', password: '', location: '' });
      setShowDoorbellForm(false); setDoorbellTestResult(null);
      await loadDoorbells();
    } catch (err: any) { alert(err.message || 'Erro ao adicionar videoporteiro.'); }
    finally { setDoorbellSaving(false); }
  }

  async function removeDoorbell(id: string) {
    if (!confirm('Deseja realmente remover este videoporteiro do sistema?')) return;
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
      const devices: GuaritaDevice[] = data.devices ?? [];
      setGuaritaDevices(devices.map(d => ({ ...d, _pingStatus: 'checking' })));
      setGuaritaLoading(false);
      // Ping all devices in background
      devices.forEach(device => pingDevice(device.id));
    } catch { setGuaritaDevices([]); setGuaritaLoading(false); }
  }

  async function pingDevice(id: string) {
    try {
      const data = await apiFetch<any>(`/guarita/devices/${id}/ping`);
      setGuaritaDevices(prev => prev.map(d =>
        d.id === id
          ? { ...d, _pingStatus: data.online ? 'online' : 'offline', _deviceCount: data.deviceCount ?? null }
          : d
      ));
    } catch {
      setGuaritaDevices(prev => prev.map(d => d.id === id ? { ...d, _pingStatus: 'offline' } : d));
    }
  }

  async function testGuaritaConnection() {
    if (!newGuarita.ip) return;
    setGuaritaTesting(true); setGuaritaTestResult(null);
    try {
      const data = await apiFetch<any>('/guarita/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: newGuarita.ip, port: parseInt(newGuarita.port) || 9000 }),
      });
      setGuaritaTestResult({
        online: data.online,
        deviceCount: data.deviceCount,
        clock: data.clock ? new Date(data.clock).toLocaleString('pt-BR') : null,
      });
    } catch { setGuaritaTestResult({ online: false }); }
    finally { setGuaritaTesting(false); }
  }

  async function addGuarita() {
    if (!newGuarita.name || !newGuarita.ip) return;
    setGuaritaSaving(true);
    try {
      await apiFetch('/guarita/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGuarita.name, ip: newGuarita.ip, port: parseInt(newGuarita.port) || 9000, location: newGuarita.location || undefined }),
      });
      setNewGuarita({ name: '', ip: '', port: '9000', location: '' });
      setShowGuaritaForm(false); setGuaritaTestResult(null);
      await loadGuarita();
    } catch (err: any) { alert(err.message || 'Erro ao adicionar dispositivo.'); }
    finally { setGuaritaSaving(false); }
  }

  async function syncGuaritaResidents(id: string) {
    if (!confirm('Deseja sincronizar moradores deste dispositivo agora? Cadastros locais não serão sobrescritos se já existirem, apenas tags serão atualizadas.')) return;
    setGuaritaSyncing(id);
    try {
      const data = await apiFetch<any>(`/guarita/devices/${id}/import-residents`, {
        method: 'POST'
      });
      alert(`Sincronização concluída!\n\n${data.imported} novos moradores criados/atualizados.\nTotal na memória: ${data.totalFound}`);
    } catch (err: any) {
      alert(`Erro ao sincronizar: ${err.message}`);
    } finally {
      setGuaritaSyncing(null);
    }
  }

  async function addGuaritaFromDiscovery(ip: string) {
    setNewGuarita(prev => ({ ...prev, ip, port: discoverPort }));
    setShowDiscovery(false);
    setShowGuaritaForm(true);
    // Auto-test the connection
    setTimeout(async () => {
      setGuaritaTesting(true);
      try {
        const data = await apiFetch<any>('/guarita/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, port: parseInt(discoverPort) || 9000 }),
        });
        setGuaritaTestResult({ online: data.online, deviceCount: data.deviceCount, clock: data.clock ? new Date(data.clock).toLocaleString('pt-BR') : null });
      } catch { setGuaritaTestResult({ online: false }); }
      finally { setGuaritaTesting(false); }
    }, 100);
  }

  async function removeGuarita(id: string) {
    if (!confirm('Deseja realmente remover este dispositivo Guarita?')) return;
    await apiFetch(`/guarita/devices/${id}`, { method: 'DELETE' });
    await loadGuarita();
  }

  async function toggleGuarita(device: GuaritaDevice) {
    await apiFetch(`/guarita/devices/${device.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !device.enabled }),
    });
    await loadGuarita();
  }

  async function setDeviceDirection(device: GuaritaDevice, direction: string) {
    const sdkConfig = { ...(device.sdkConfig ?? {}), direction };
    await apiFetch(`/guarita/devices/${device.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdkConfig }),
    });
    setGuaritaDevices(prev => prev.map(d => d.id === device.id ? { ...d, sdkConfig } : d));
  }

  // ── Anti-Passback ─────────────────────────────────────────────────────────

  async function loadApbSettings() {
    try {
      const data = await apiFetch<any>('/guarita/passback/settings');
      setApbEnabled(data.antiPassbackEnabled ?? false);
    } catch { /* ignora se não disponível */ }
  }

  async function saveApbEnabled(enabled: boolean) {
    setApbEnabled(enabled);
    setApbSaving(true);
    try {
      await apiFetch('/guarita/passback/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ antiPassbackEnabled: enabled }),
      });
    } finally { setApbSaving(false); }
  }

  async function loadApbStates() {
    setApbStatesLoading(true);
    try {
      const data = await apiFetch<any>('/guarita/passback/states');
      setApbStates(data.data ?? []);
    } finally { setApbStatesLoading(false); }
  }

  async function resetPassbackState(personId: string) {
    await apiFetch(`/guarita/passback/state/${personId}`, { method: 'DELETE' });
    setApbStates(prev => prev.filter(s => s.personId !== personId));
  }

  // ── Discovery ─────────────────────────────────────────────────────────────

  async function startDiscovery() {
    if (!discoverSubnet) return;
    setDiscovering(true); setDiscoveryResults([]); setDiscoveryDone(false);
    try {
      const data = await apiFetch<any>('/guarita/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subnet: discoverSubnet, port: parseInt(discoverPort) || 9000, timeoutMs: 1500 }),
      });
      setDiscoveryResults(data.found ?? []);
      setDiscoveryDone(true);
    } catch (err: any) { alert(err.message || 'Erro durante a busca.'); }
    finally { setDiscovering(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1><Settings2 size={24} /> Painel de Integrações</h1>
          <p>Gerencie conexões de hardware, portões automáticos Nice e servidores de autenticação facial HikCentral</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginTop: '20px' }}>

        {/* 1. HIKCENTRAL */}
        <div className="settings-card" style={{ margin: 0 }}>
          <div className="settings-card-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--blue-400)', display: 'inline-flex' }}>
              <Wifi size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Servidor HikCentral Professional (ACS)</h2>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>Mecanismo de sincronização facial para controle de acessos</span>
            </div>
          </div>

          {hikLoading ? (
            <div style={{ padding: '20px', display: 'flex', gap: '10px', alignItems: 'center', color: 'var(--text-muted)' }}>
              <Loader2 className="animate-spin" size={16} /> Carregando configurações...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '15px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="text-muted" style={{ fontSize: '0.85rem' }}>Endereço Host / URL da API</label>
                  <input value={hikConfig.apiUrl} onChange={(e) => setHikConfig((c) => ({ ...c, apiUrl: e.target.value }))} placeholder="https://172.20.120.20:443" style={inputStyle} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="text-muted" style={{ fontSize: '0.85rem' }}>App Key</label>
                  <input value={hikConfig.appKey} onChange={(e) => setHikConfig((c) => ({ ...c, appKey: e.target.value }))} placeholder="Chave do app" style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="text-muted" style={{ fontSize: '0.85rem' }}>App Secret</label>
                <div style={{ position: 'relative' }}>
                  <input type={showSecret ? 'text' : 'password'} value={hikConfig.appSecret} onChange={(e) => setHikConfig((c) => ({ ...c, appSecret: e.target.value }))} placeholder="Segredo do app" style={{ ...inputStyle, paddingRight: '40px', width: '100%' }} />
                  <button type="button" onClick={() => setShowSecret(!showSecret)} style={{ position: 'absolute', right: '12px', top: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ margin: '10px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={hikConfig.syncEnabled} onChange={(e) => setHikConfig((c) => ({ ...c, syncEnabled: e.target.checked }))} style={{ width: '16px', height: '16px', borderRadius: '4px', cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Sincronização de biometrias faciais em segundo plano habilitada</span>
                </label>
              </div>

              {hikMsg && (
                <div style={{ ...alertStyle(hikStatus === 'ok' ? 'success' : 'error') }}>
                  {hikStatus === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <span>{hikMsg}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button onClick={saveHikConfig} disabled={hikSaving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {hikSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  Salvar configurações do HikCentral
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 2. DOORBELLS */}
        <div className="settings-card" style={{ margin: 0 }}>
          <div className="settings-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.12)', color: 'var(--purple-400)', display: 'inline-flex' }}>
                <Camera size={20} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Videoporteiros IP Hikvision (ISAPI)</h2>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Mapeamento de leitores de biometria facial e portarias</span>
              </div>
            </div>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => { setShowDoorbellForm(!showDoorbellForm); setDoorbellTestResult(null); }}>
              {showDoorbellForm ? <X size={14} /> : <Plus size={14} />}
              {showDoorbellForm ? 'Cancelar' : 'Adicionar dispositivo'}
            </button>
          </div>

          {showDoorbellForm && (
            <div style={formBoxStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                <Field label="Nome identificador"><input value={newDoorbell.name} onChange={(e) => setNewDoorbell((d) => ({ ...d, name: e.target.value }))} placeholder="Ex: Portão A Pedestres" style={inputStyle} /></Field>
                <Field label="Endereço IP"><input value={newDoorbell.ip} onChange={(e) => setNewDoorbell((d) => ({ ...d, ip: e.target.value }))} placeholder="192.168.1.50" style={inputStyle} /></Field>
                <Field label="Porta"><input value={newDoorbell.port} onChange={(e) => setNewDoorbell((d) => ({ ...d, port: e.target.value }))} placeholder="80" style={inputStyle} /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                <Field label="Usuário ISAPI"><input value={newDoorbell.username} onChange={(e) => setNewDoorbell((d) => ({ ...d, username: e.target.value }))} placeholder="admin" style={inputStyle} /></Field>
                <Field label="Senha de acesso"><input type="password" value={newDoorbell.password} onChange={(e) => setNewDoorbell((d) => ({ ...d, password: e.target.value }))} placeholder="••••••••" style={inputStyle} /></Field>
                <Field label="Localização física"><input value={newDoorbell.location} onChange={(e) => setNewDoorbell((d) => ({ ...d, location: e.target.value }))} placeholder="Ex: Entrada Principal" style={inputStyle} /></Field>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button onClick={testDoorbellConnection} disabled={doorbellTesting || !newDoorbell.ip} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {doorbellTesting ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                    Testar Conectividade
                  </button>
                  {doorbellTestResult !== null && (
                    <span style={{ fontSize: '0.85rem', fontWeight: 500, color: doorbellTestResult ? 'var(--green-400)' : 'var(--red-400)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {doorbellTestResult ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                      {doorbellTestResult ? 'Aparelho online e credenciais corretas!' : 'Falha na conexão com o videoporteiro.'}
                    </span>
                  )}
                </div>
                <button onClick={addDoorbell} disabled={doorbellSaving || !newDoorbell.name || !newDoorbell.ip || !newDoorbell.username || !newDoorbell.password} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {doorbellSaving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                  Salvar videoporteiro
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '20px' }}>
            {doorbellLoading ? (
              <Loading label="Carregando dispositivos..." />
            ) : doorbells.length === 0 ? (
              <EmptyState label="Nenhum videoporteiro cadastrado para sincronização facial." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {doorbells.map((device) => (
                  <div key={device.id} style={deviceRowStyle}>
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.95rem' }}>{device.name}</strong>
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>{device.ip}:{device.port} {device.location ? `— ${device.location}` : ''}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <StatusBadge enabled={device.enabled} enabledLabel="Sincronizando" disabledLabel="Pausado" />
                      <button onClick={() => toggleDoorbell(device)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto' }}>{device.enabled ? 'Pausar' : 'Sincronizar'}</button>
                      <button onClick={() => removeDoorbell(device.id)} className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto', color: 'var(--red-400)', borderColor: 'rgba(239, 68, 68, 0.2)' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. NICE GUARITA IP */}
        <div className="settings-card" style={{ margin: 0 }}>
          <div className="settings-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(236, 72, 153, 0.12)', color: 'var(--pink-400)', display: 'inline-flex' }}>
                <DoorOpen size={20} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Receptores Nice Guarita IP (MG3000)</h2>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Protocolo TCP binário — porta padrão 9000</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => { setShowDiscovery(!showDiscovery); setDiscoveryResults([]); setDiscoveryDone(false); }}>
                <Search size={14} />
                {showDiscovery ? 'Fechar busca' : 'Buscar na rede'}
              </button>
              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => { setShowGuaritaForm(!showGuaritaForm); setGuaritaTestResult(null); }}>
                {showGuaritaForm ? <X size={14} /> : <Plus size={14} />}
                {showGuaritaForm ? 'Cancelar' : 'Adicionar manualmente'}
              </button>
            </div>
          </div>

          {/* Discovery Panel */}
          {showDiscovery && (
            <div style={{ ...formBoxStyle, background: 'rgba(236, 72, 153, 0.04)', borderColor: 'rgba(236, 72, 153, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '2 1 200px' }}>
                  <label className="text-muted" style={{ fontSize: '0.8rem' }}>Prefixo da sub-rede</label>
                  <input
                    value={discoverSubnet}
                    onChange={(e) => setDiscoverSubnet(e.target.value)}
                    placeholder="Ex: 192.168.1  ou  10.0.0"
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '0 0 100px' }}>
                  <label className="text-muted" style={{ fontSize: '0.8rem' }}>Porta TCP</label>
                  <input
                    value={discoverPort}
                    onChange={(e) => setDiscoverPort(e.target.value)}
                    placeholder="9000"
                    style={inputStyle}
                  />
                </div>
                <button
                  onClick={startDiscovery}
                  disabled={discovering || !discoverSubnet}
                  className="btn btn-primary"
                  style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                >
                  {discovering ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
                  {discovering ? 'Varrendo rede...' : 'Iniciar busca'}
                </button>
              </div>

              {discovering && (
                <div style={{ marginTop: '15px', color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 className="animate-spin" size={14} />
                  Verificando {discoverSubnet}.1 – {discoverSubnet}.254 na porta {discoverPort}…
                </div>
              )}

              {discoveryDone && discoveryResults.length === 0 && (
                <div style={{ marginTop: '15px', color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <WifiOff size={14} /> Nenhum módulo Nice MG3000 encontrado na sub-rede.
                </div>
              )}

              {discoveryResults.length > 0 && (
                <div style={{ marginTop: '15px' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                    {discoveryResults.length} módulo{discoveryResults.length > 1 ? 's' : ''} encontrado{discoveryResults.length > 1 ? 's' : ''}:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {discoveryResults.map((d) => (
                      <div key={d.ip} style={{ ...deviceRowStyle, borderColor: 'rgba(236, 72, 153, 0.25)' }}>
                        <div>
                          <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}>
                            <Signal size={14} style={{ color: 'var(--green-400)' }} />
                            {d.ip}:{discoverPort}
                          </strong>
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                            {d.deviceCount != null ? `${d.deviceCount} dispositivo(s) cadastrado(s)` : 'Módulo MG3000 detectado'}
                            {d.clock ? ` · Relógio: ${new Date(d.clock).toLocaleString('pt-BR')}` : ''}
                          </span>
                        </div>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '4px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => addGuaritaFromDiscovery(d.ip)}
                        >
                          <Plus size={13} /> Adicionar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Manual Add Form */}
          {showGuaritaForm && (
            <div style={formBoxStyle}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                <Field label="Nome da guarita"><input value={newGuarita.name} onChange={(e) => setNewGuarita((g) => ({ ...g, name: e.target.value }))} placeholder="Ex: Recepção Veículos" style={inputStyle} /></Field>
                <Field label="Endereço IP"><input value={newGuarita.ip} onChange={(e) => setNewGuarita((g) => ({ ...g, ip: e.target.value }))} placeholder="192.168.1.100" style={inputStyle} /></Field>
                <Field label="Porta TCP">
                  <input value={newGuarita.port} onChange={(e) => setNewGuarita((g) => ({ ...g, port: e.target.value }))} placeholder="9000" style={inputStyle} />
                </Field>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="text-muted" style={{ fontSize: '0.8rem' }}>Localização do leitor</label>
                <input value={newGuarita.location} onChange={(e) => setNewGuarita((g) => ({ ...g, location: e.target.value }))} placeholder="Ex: Portão de Entrada de Carros" style={inputStyle} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button onClick={testGuaritaConnection} disabled={guaritaTesting || !newGuarita.ip} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {guaritaTesting ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                    Testar Conexão
                  </button>
                  {guaritaTestResult !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 500, color: guaritaTestResult.online ? 'var(--green-400)' : 'var(--red-400)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {guaritaTestResult.online ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                        {guaritaTestResult.online ? 'Módulo MG3000 online!' : 'Sem resposta do módulo.'}
                      </span>
                      {guaritaTestResult.online && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '19px' }}>
                          {guaritaTestResult.deviceCount != null ? `${guaritaTestResult.deviceCount} disp. cadastrados` : ''}
                          {guaritaTestResult.clock ? ` · Relógio: ${guaritaTestResult.clock}` : ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary" onClick={() => { setShowGuaritaForm(false); setGuaritaTestResult(null); }}>Cancelar</button>
                  <button onClick={addGuarita} disabled={guaritaSaving || !newGuarita.name || !newGuarita.ip} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {guaritaSaving ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                    Salvar dispositivo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Device List */}
          <div style={{ marginTop: '20px' }}>
            {guaritaLoading ? (
              <Loading label="Carregando guaritas..." />
            ) : guaritaDevices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                <DoorOpen size={36} style={{ opacity: 0.2, marginBottom: '8px' }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Nenhum dispositivo Nice Guarita cadastrado.</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>Use "Buscar na rede" para descobrir módulos MG3000 automaticamente.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {guaritaDevices.map((device) => (
                  <div key={device.id} style={deviceRowStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Ping indicator */}
                      <div style={{ flexShrink: 0 }}>
                        {device._pingStatus === 'checking' && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
                        {device._pingStatus === 'online' && <Signal size={16} style={{ color: 'var(--green-400)' }} />}
                        {device._pingStatus === 'offline' && <SignalZero size={16} style={{ color: 'var(--red-400)' }} />}
                      </div>
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.95rem' }}>{device.name}</strong>
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                          {device.ip}:{device.port}
                          {device.location ? ` — ${device.location}` : ''}
                          {device._pingStatus === 'online' && device._deviceCount != null ? ` · ${device._deviceCount} disp. cadastrados` : ''}
                          {device._pingStatus === 'offline' ? ' · Sem resposta' : ''}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <select
                        value={(device.sdkConfig as any)?.direction ?? 'both'}
                        onChange={e => setDeviceDirection(device, e.target.value)}
                        title="Direção do dispositivo para Anti-Passagem Dupla"
                        style={{ fontSize: '0.75rem', padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border-primary)', background: 'var(--bg-input)', color: 'var(--text-primary)', cursor: 'pointer' }}
                      >
                        <option value="both">↕ Entrada/Saída</option>
                        <option value="entry">→ Apenas Entrada</option>
                        <option value="exit">← Apenas Saída</option>
                      </select>
                      <StatusBadge enabled={device.enabled} enabledLabel="Ativo" disabledLabel="Pausado" />
                      <button onClick={() => pingDevice(device.id)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <RefreshCw size={12} />
                      </button>
                      <button onClick={() => toggleGuarita(device)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto' }}>{device.enabled ? 'Pausar' : 'Ativar'}</button>
                      <button onClick={() => syncGuaritaResidents(device.id)} disabled={guaritaSyncing === device.id} className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.75rem', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {guaritaSyncing === device.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Sincronizar
                      </button>
                      <button onClick={() => removeGuarita(device.id)} className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto', color: 'var(--red-400)', borderColor: 'rgba(239, 68, 68, 0.2)' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Anti-Passagem Dupla */}
          <div style={{ marginTop: 24, padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🔄 Anti-Passagem Dupla
                  {apbSaving && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Impede que um morador entre novamente sem ter registrado a saída. Requer dispositivos configurados como "Entrada" e "Saída".
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={apbEnabled}
                  onChange={e => saveApbEnabled(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{apbEnabled ? 'Ativada' : 'Desativada'}</span>
              </label>
            </div>

            {apbEnabled && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border-primary)', paddingTop: 14 }}>
                <button
                  onClick={() => { setShowApbStates(v => !v); if (!showApbStates) loadApbStates(); }}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Search size={13} />
                  {showApbStates ? 'Ocultar moradores no interior' : 'Ver moradores no interior'}
                </button>

                {showApbStates && (
                  <div style={{ marginTop: 12 }}>
                    {apbStatesLoading ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Carregando…</p>
                    ) : apbStates.length === 0 ? (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nenhum morador com estado "Dentro" no momento.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {apbStates.map(s => (
                          <div key={s.personId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 8, gap: 10 }}>
                            <div>
                              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{s.personName}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                                {[s.tower, s.unit].filter(Boolean).join(' · ')}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                                Entrou às {new Date(s.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <button
                              onClick={() => resetPassbackState(s.personId)}
                              className="btn btn-secondary"
                              style={{ fontSize: '0.75rem', padding: '4px 10px', color: 'var(--red-400)', borderColor: 'rgba(239,68,68,0.2)', flexShrink: 0 }}
                            >
                              Resetar estado
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────

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
