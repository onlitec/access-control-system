/**
 * NetworkDiscoverySection.tsx
 * Seção de descoberta automática de dispositivos de rede (CFTV/Acesso) — OnliAcesso.
 * Conecta-se ao SSE /api/discovery/stream para receber dispositivos em tempo real.
 * Exibe os resultados com filtros por tipo/protocolo e modal de cadastro.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Wifi, WifiOff, Search, RefreshCw, Plus, Loader2, CheckCircle,
  AlertTriangle, X, Camera, Cpu, Mic, Network, Fingerprint, Eye, EyeOff,
  ChevronDown,
} from 'lucide-react';
import { apiFetch } from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscoveredDevice {
  tempId:          string;
  ipAddress:       string;
  macAddress:      string | null;
  protocolType:    'onvif' | 'sadp' | 'mdns' | 'arp' | 'manual';
  manufacturer:    string | null;
  model:           string | null;
  serialNumber:    string | null;
  firmwareVersion: string | null;
  deviceType:      'camera' | 'nvr' | 'dvr' | 'facial' | 'intercom' | 'controller' | 'unknown';
  httpPort:        number;
  sdkPort:         number;
  subnetMask:      string | null;
  gateway:         string | null;
  dhcpEnabled:     boolean;
  isActivated:     boolean;
  isAdded:         boolean;
  friendlyName?:   string | null;
}

interface Area { id: string; name: string; }
interface Category { id: string; code: string; name: string; }

type ScanStatus = 'idle' | 'scanning' | 'fast-done' | 'complete' | 'error';

// ── Device type metadata ──────────────────────────────────────────────────────

const DEVICE_TYPE_META: Record<string, { label: string; icon: React.FC<any>; color: string }> = {
  camera:     { label: 'Câmera IP',    icon: Camera,      color: '#38bdf8' },
  nvr:        { label: 'NVR',          icon: Cpu,         color: '#a78bfa' },
  dvr:        { label: 'DVR',          icon: Cpu,         color: '#c084fc' },
  facial:     { label: 'Leitor Facial',icon: Fingerprint, color: '#34d399' },
  intercom:   { label: 'Interfone',    icon: Mic,         color: '#fb923c' },
  controller: { label: 'Controladora', icon: Network,     color: '#f472b6' },
  unknown:    { label: 'Dispositivo',  icon: Wifi,        color: '#94a3b8' },
};

const PROTOCOL_LABELS: Record<string, string> = {
  onvif: 'ONVIF', sadp: 'SADP', mdns: 'mDNS', arp: 'ARP', manual: 'Manual',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function NetworkDiscoverySection() {
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [search, setSearch] = useState('');
  const [filterProtocol, setFilterProtocol] = useState('');
  const [filterType, setFilterType] = useState('');
  const [hideAdded, setHideAdded] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [registerModal, setRegisterModal] = useState<DiscoveredDevice | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Form de cadastro
  const [regForm, setRegForm] = useState({ friendlyName: '', username: 'admin', password: '', categoryId: '', areaId: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState(false);

  useEffect(() => {
    apiFetch('/access-areas').then((r: any) => setAreas(r?.data ?? [])).catch(() => {});
    apiFetch('/devices/categories').then((r: any) => setCategories(r?.data ?? [])).catch(() => {});
    return () => { sseRef.current?.close(); };
  }, []);

  const startScan = useCallback(async () => {
    sseRef.current?.close();
    setDevices([]);
    setScanError(null);
    setScanStatus('scanning');

    // 1. Solicitar início do scan
    try {
      await apiFetch('/discovery/scan', { method: 'POST', body: JSON.stringify({ arpEnabled: true }) });
    } catch (e: any) {
      setScanError(e.message ?? 'Erro ao iniciar varredura.');
      setScanStatus('error');
      return;
    }

    // 2. Conectar ao SSE para receber resultados
    const token = localStorage.getItem('auth_token') ?? '';
    const sse = new EventSource(`/api/discovery/stream?token=${token}`);
    sseRef.current = sse;

    sse.addEventListener('device-found', (e) => {
      try {
        const device: DiscoveredDevice = JSON.parse(e.data);
        setDevices((prev) => {
          if (prev.some((d) => d.tempId === device.tempId || d.ipAddress === device.ipAddress)) return prev;
          return [...prev, device];
        });
      } catch {}
    });

    sse.addEventListener('fast-scan-complete', () => setScanStatus('fast-done'));

    sse.addEventListener('scan-complete', () => {
      setScanStatus('complete');
      sse.close();
    });

    sse.addEventListener('scan-error', (e) => {
      try { setScanError(JSON.parse(e.data).message); } catch {}
      setScanStatus('error');
      sse.close();
    });

    sse.onerror = () => {
      if (scanStatus === 'scanning' || scanStatus === 'fast-done') {
        setScanStatus('complete');
      }
      sse.close();
    };
  }, []);

  // ── Filtros ───────────────────────────────────────────────────────────────────
  const filtered = devices.filter((d) => {
    if (hideAdded && d.isAdded) return false;
    if (filterProtocol && d.protocolType !== filterProtocol) return false;
    if (filterType && d.deviceType !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.ipAddress.includes(q) ||
        d.macAddress?.toLowerCase().includes(q) ||
        d.manufacturer?.toLowerCase().includes(q) ||
        d.model?.toLowerCase().includes(q) ||
        d.serialNumber?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Register device ───────────────────────────────────────────────────────────
  const openRegister = (device: DiscoveredDevice) => {
    setRegisterModal(device);
    setRegForm({ friendlyName: device.friendlyName ?? `${device.manufacturer ?? 'Dispositivo'} ${device.ipAddress}`, username: 'admin', password: '', categoryId: '', areaId: '' });
    setRegError(null);
    setRegSuccess(false);
    setShowPassword(false);
  };

  const submitRegister = async () => {
    if (!registerModal) return;
    setRegLoading(true);
    setRegError(null);
    try {
      await apiFetch('/discovery/register', {
        method: 'POST',
        body: JSON.stringify({
          tempId:       registerModal.tempId,
          friendlyName: regForm.friendlyName,
          username:     regForm.username,
          password:     regForm.password,
          categoryId:   regForm.categoryId || null,
          areaId:       regForm.areaId || null,
        }),
      });
      setRegSuccess(true);
      setDevices((prev) => prev.map((d) => d.tempId === registerModal.tempId ? { ...d, isAdded: true } : d));
      setTimeout(() => setRegisterModal(null), 1500);
    } catch (e: any) {
      setRegError(e.message ?? 'Erro ao cadastrar dispositivo.');
    } finally {
      setRegLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <section style={{ marginTop: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Descoberta de Dispositivos na Rede
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
            Varre ONVIF, SADP, mDNS e ARP para encontrar câmeras, NVRs, leitores faciais e interfones na rede local.
          </p>
        </div>
        <button
          onClick={startScan}
          disabled={scanStatus === 'scanning'}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: '8px', padding: '10px 18px', cursor: scanStatus === 'scanning' ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: '14px', opacity: scanStatus === 'scanning' ? 0.7 : 1,
          }}
        >
          {scanStatus === 'scanning' ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
          {scanStatus === 'scanning' ? 'Varrendo...' : 'Buscar na rede'}
        </button>
      </div>

      {/* Status bar */}
      {scanStatus !== 'idle' && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px',
          display: 'flex', alignItems: 'center', gap: '8px',
          background: scanStatus === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(56,189,248,0.1)',
          color: scanStatus === 'error' ? '#f87171' : '#38bdf8',
          border: `1px solid ${scanStatus === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(56,189,248,0.3)'}`,
        }}>
          {scanStatus === 'scanning' && <Loader2 className="animate-spin" size={14} />}
          {scanStatus === 'fast-done' && <Wifi size={14} />}
          {scanStatus === 'complete' && <CheckCircle size={14} />}
          {scanStatus === 'error' && <AlertTriangle size={14} />}
          {scanStatus === 'scanning' && `Varrendo a rede... ${devices.length} dispositivos encontrados até agora.`}
          {scanStatus === 'fast-done' && `Varredura rápida concluída. ${devices.length} dispositivos. ARP scan em andamento...`}
          {scanStatus === 'complete' && `Varredura completa. ${devices.length} dispositivo(s) encontrado(s).`}
          {scanStatus === 'error' && (scanError ?? 'Erro durante a varredura.')}
        </div>
      )}

      {/* Filters */}
      {devices.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por IP, MAC, fabricante..."
              style={{ width: '100%', paddingLeft: '32px', padding: '8px 12px 8px 32px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px' }}
            />
          </div>
          <select value={filterProtocol} onChange={(e) => setFilterProtocol(e.target.value)}
            style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px' }}>
            <option value="">Todos os protocolos</option>
            {['onvif','sadp','mdns','arp'].map((p) => <option key={p} value={p}>{PROTOCOL_LABELS[p]}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px' }}>
            <option value="">Todos os tipos</option>
            {Object.entries(DEVICE_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={hideAdded} onChange={(e) => setHideAdded(e.target.checked)} />
            Ocultar já cadastrados
          </label>
        </div>
      )}

      {/* Device list */}
      {filtered.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map((device) => {
            const meta = DEVICE_TYPE_META[device.deviceType] ?? DEVICE_TYPE_META.unknown;
            const Icon = meta.icon;
            return (
              <div key={device.tempId} style={{
                background: 'var(--card-bg)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: '14px',
                opacity: device.isAdded ? 0.65 : 1,
              }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${meta.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={18} color={meta.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                      {device.ipAddress}
                    </span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: `${meta.color}22`, color: meta.color, fontWeight: 600 }}>
                      {meta.label}
                    </span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)' }}>
                      {PROTOCOL_LABELS[device.protocolType]}
                    </span>
                    {!device.isActivated && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(251,146,60,0.15)', color: '#fb923c' }}>
                        Não ativado
                      </span>
                    )}
                    {device.isAdded && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                        ✓ Cadastrado
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {device.manufacturer && <span>{device.manufacturer}</span>}
                    {device.model && <span>{device.model}</span>}
                    {device.macAddress && <span style={{ fontFamily: 'monospace' }}>{device.macAddress}</span>}
                    {device.serialNumber && <span>S/N: {device.serialNumber}</span>}
                  </div>
                </div>
                {!device.isAdded && (
                  <button
                    onClick={() => openRegister(device)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      background: 'var(--accent)', color: '#fff',
                      border: 'none', borderRadius: '6px', padding: '7px 14px',
                      cursor: 'pointer', fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap',
                    }}
                  >
                    <Plus size={14} /> Cadastrar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : scanStatus === 'idle' ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--card-bg)', borderRadius: '10px', border: '1px dashed var(--border)' }}>
          <Wifi size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '14px' }}>
            Clique em <strong>"Buscar na rede"</strong> para descobrir câmeras, NVRs, leitores faciais e interfones.
          </p>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 0', fontSize: '12px' }}>
            Certifique-se de que o servidor está na mesma VLAN/sub-rede dos dispositivos. Portas usadas: UDP 3702, 37020, 5353.
          </p>
        </div>
      ) : devices.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--card-bg)', borderRadius: '10px', border: '1px dashed var(--border)' }}>
          <WifiOff size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '14px' }}>
            Nenhum dispositivo encontrado até o momento.
          </p>
          <p style={{ color: 'var(--text-muted)', margin: '8px 0 0', fontSize: '12px' }}>
            Verifique se os dispositivos estão ligados e na mesma rede/VLAN que o servidor OnliAcesso.
          </p>
        </div>
      )}

      {/* Register Modal */}
      {registerModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        }}>
          <div style={{
            background: 'var(--modal-bg, var(--card-bg))', borderRadius: '12px',
            border: '1px solid var(--border)', padding: '24px', width: '100%', maxWidth: '440px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Cadastrar Dispositivo
              </h3>
              <button onClick={() => setRegisterModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', background: 'rgba(56,189,248,0.07)', padding: '10px 12px', borderRadius: '8px' }}>
              <strong style={{ color: 'var(--text-primary)' }}>{registerModal.ipAddress}</strong>
              {registerModal.manufacturer && ` — ${registerModal.manufacturer}`}
              {registerModal.model && ` ${registerModal.model}`}
            </div>

            {regSuccess ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#22c55e' }}>
                <CheckCircle size={40} style={{ marginBottom: '8px' }} />
                <p style={{ margin: 0, fontWeight: 600 }}>Dispositivo cadastrado com sucesso!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  Nome do dispositivo *
                  <input value={regForm.friendlyName} onChange={(e) => setRegForm((f) => ({ ...f, friendlyName: e.target.value }))}
                    style={{ display: 'block', width: '100%', marginTop: '4px', padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px' }} />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                    Usuário *
                    <input value={regForm.username} onChange={(e) => setRegForm((f) => ({ ...f, username: e.target.value }))}
                      style={{ display: 'block', width: '100%', marginTop: '4px', padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px' }} />
                  </label>
                  <label style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                    Senha *
                    <div style={{ position: 'relative', marginTop: '4px' }}>
                      <input type={showPassword ? 'text' : 'password'} value={regForm.password}
                        onChange={(e) => setRegForm((f) => ({ ...f, password: e.target.value }))}
                        style={{ width: '100%', padding: '8px 36px 8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px' }} />
                      <button onClick={() => setShowPassword((s) => !s)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </label>
                </div>

                <label style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  Categoria
                  <select value={regForm.categoryId} onChange={(e) => setRegForm((f) => ({ ...f, categoryId: e.target.value }))}
                    style={{ display: 'block', width: '100%', marginTop: '4px', padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px' }}>
                    <option value="">Selecionar categoria...</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>

                <label style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  Área / Localização
                  <select value={regForm.areaId} onChange={(e) => setRegForm((f) => ({ ...f, areaId: e.target.value }))}
                    style={{ display: 'block', width: '100%', marginTop: '4px', padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px' }}>
                    <option value="">Sem área definida</option>
                    {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>

                {regError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontSize: '13px', background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '6px' }}>
                    <AlertTriangle size={14} /> {regError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button onClick={() => setRegisterModal(null)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>
                    Cancelar
                  </button>
                  <button onClick={submitRegister} disabled={regLoading || !regForm.friendlyName || !regForm.username || !regForm.password}
                    style={{ flex: 1, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: regLoading ? 0.7 : 1 }}>
                    {regLoading ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
                    Cadastrar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
