/**
 * NetworkDevicesPage.tsx
 * Tela de Gestão de Dispositivos de Rede — OnliAcesso.
 * Layout inspirado no HikCentral "Device > Device and Server":
 *  - Sidebar esquerda: Categorias + Áreas
 *  - Seção superior: Dispositivos adicionados (CRUD, sync, bulk)
 *  - Seção inferior: Dispositivos online na rede (discovery)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/services/api';
import {
  Network, Camera, Cpu, Fingerprint, Mic, Wifi, WifiOff,
  Plus, Trash2, RefreshCw, Settings2, Loader2, CheckCircle,
  AlertTriangle, X, Eye, EyeOff, Search, ChevronRight,
  MoreHorizontal, Key, Globe, Layers, ScanLine,
} from 'lucide-react';
import NetworkDiscoverySection from '@/components/NetworkDiscoverySection';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Category { id: string; code: string; name: string; }
interface Area { id: string; name: string; icon?: string; }

interface NetworkDevice {
  id: string;
  ipAddress: string;
  macAddress: string | null;
  protocolType: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  firmwareVersion: string | null;
  deviceType: string;
  isAdded: boolean;
  friendlyName: string | null;
  categoryId: string | null;
  areaId: string | null;
  credentialUsername: string | null;
  httpPort: number;
  sdkPort: number;
  status: string;
  lastSyncAt: string | null;
  category: { id: string; code: string; name: string } | null;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

const DEVICE_TYPE_META: Record<string, { label: string; icon: React.FC<any>; color: string }> = {
  camera:     { label: 'Câmera IP',    icon: Camera,      color: '#38bdf8' },
  nvr:        { label: 'NVR',          icon: Cpu,         color: '#a78bfa' },
  dvr:        { label: 'DVR',          icon: Cpu,         color: '#c084fc' },
  facial:     { label: 'Leitor Facial',icon: Fingerprint, color: '#34d399' },
  intercom:   { label: 'Interfone',    icon: Mic,         color: '#fb923c' },
  controller: { label: 'Controladora', icon: Network,     color: '#f472b6' },
  unknown:    { label: 'Dispositivo',  icon: Wifi,        color: '#94a3b8' },
};

const STATUS_META: Record<string, { color: string; label: string }> = {
  online:  { color: '#22c55e', label: 'Online' },
  offline: { color: '#ef4444', label: 'Offline' },
  error:   { color: '#f59e0b', label: 'Erro' },
  unknown: { color: '#64748b', label: 'Desconhecido' },
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function NetworkDevicesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [devices, setDevices] = useState<NetworkDevice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [activeAreaId, setActiveAreaId] = useState('');
  const [page, setPage] = useState(1);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals
  const [editDevice, setEditDevice] = useState<NetworkDevice | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [bulkAction, setBulkAction] = useState<'password' | 'timezone' | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({ friendlyName: '', username: '', password: '', categoryId: '', areaId: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Add form
  const [addForm, setAddForm] = useState({ friendlyName: '', ipAddress: '', username: 'admin', password: '', categoryId: '', areaId: '', deviceType: 'unknown', httpPort: '80', sdkPort: '8000' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Bulk
  const [bulkValue, setBulkValue] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  // Delete
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search)           params.set('search', search);
      if (activeCategoryId) params.set('categoryId', activeCategoryId);
      if (activeAreaId)     params.set('areaId', activeAreaId);

      const [devRes, catRes, areaRes] = await Promise.all([
        apiFetch(`/devices?${params}`) as Promise<any>,
        apiFetch('/devices/categories') as Promise<any>,
        apiFetch('/access-areas') as Promise<any>,
      ]);

      setDevices(devRes?.data ?? []);
      setTotal(devRes?.total ?? 0);
      setCategories(catRes?.data ?? []);
      setAreas(areaRes?.data ?? []);
    } catch (e: any) {
      console.error('[NetworkDevicesPage]', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, activeCategoryId, activeAreaId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const syncDevice = async (id: string) => {
    setSyncingId(id);
    try {
      const res: any = await apiFetch(`/devices/${id}/sync`, { method: 'POST' });
      setDevices((prev) => prev.map((d) => d.id === id ? res.data : d));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSyncingId(null);
    }
  };

  const syncAll = async () => {
    setSyncingAll(true);
    try {
      await apiFetch('/devices/sync-all', { method: 'POST' });
      setTimeout(() => { loadData(); setSyncingAll(false); }, 3000);
    } catch (e: any) {
      alert(e.message);
      setSyncingAll(false);
    }
  };

  const openEdit = (device: NetworkDevice) => {
    setEditDevice(device);
    setEditForm({ friendlyName: device.friendlyName ?? '', username: device.credentialUsername ?? '', password: '', categoryId: device.categoryId ?? '', areaId: device.areaId ?? '' });
    setEditError(null);
    setShowPassword(false);
  };

  const submitEdit = async () => {
    if (!editDevice) return;
    setEditLoading(true); setEditError(null);
    try {
      const body: any = { friendlyName: editForm.friendlyName, username: editForm.username, categoryId: editForm.categoryId || null, areaId: editForm.areaId || null };
      if (editForm.password) body.password = editForm.password;
      const res: any = await apiFetch(`/devices/${editDevice.id}`, { method: 'PUT', body: JSON.stringify(body) });
      setDevices((prev) => prev.map((d) => d.id === editDevice.id ? res.data : d));
      setEditDevice(null);
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setEditLoading(false);
    }
  };

  const submitAdd = async () => {
    setAddLoading(true); setAddError(null);
    try {
      await apiFetch('/devices', { method: 'POST', body: JSON.stringify({ ...addForm, httpPort: Number(addForm.httpPort), sdkPort: Number(addForm.sdkPort) }) });
      setAddModal(false);
      setAddForm({ friendlyName: '', ipAddress: '', username: 'admin', password: '', categoryId: '', areaId: '', deviceType: 'unknown', httpPort: '80', sdkPort: '8000' });
      loadData();
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAddLoading(false);
    }
  };

  const submitDelete = async () => {
    if (selected.size === 0) return;
    setDeleteLoading(true); setDeleteError(null);
    try {
      await apiFetch('/devices', { method: 'DELETE', body: JSON.stringify({ ids: [...selected] }) });
      setSelected(new Set());
      setDeleteConfirm(false);
      loadData();
    } catch (e: any) {
      setDeleteError(e.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const submitBulkPassword = async () => {
    if (!bulkValue) return;
    setBulkLoading(true); setBulkMsg(null);
    try {
      await apiFetch('/devices/bulk/password', { method: 'PUT', body: JSON.stringify({ ids: [...selected], password: bulkValue }) });
      setBulkMsg(`Senha atualizada em ${selected.size} dispositivos.`);
      setTimeout(() => { setBulkAction(null); setBulkValue(''); setBulkMsg(null); }, 2000);
    } catch (e: any) {
      setBulkMsg(e.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const submitBulkTimezone = async () => {
    if (!bulkValue) return;
    setBulkLoading(true); setBulkMsg(null);
    try {
      await apiFetch('/devices/bulk/timezone', { method: 'PUT', body: JSON.stringify({ ids: [...selected], timezone: bulkValue }) });
      setBulkMsg(`Timezone "${bulkValue}" aplicado em ${selected.size} dispositivos.`);
      setTimeout(() => { setBulkAction(null); setBulkValue(''); setBulkMsg(null); }, 2000);
    } catch (e: any) {
      setBulkMsg(e.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (selected.size === devices.length) { setSelected(new Set()); }
    else { setSelected(new Set(devices.map((d) => d.id))); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="page" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Page header */}
      <div className="page-header" style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Network size={22} /> Dispositivos e Servidores
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: '13px' }}>
            Gerencie câmeras, NVRs, leitores faciais, interfones e controladoras cadastradas na plataforma.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={syncAll} disabled={syncingAll}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            {syncingAll ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            Sincronizar tudo
          </button>
          <button onClick={() => setAddModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            <Plus size={14} /> Adicionar dispositivo
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: 'flex', flex: 1, gap: '0', marginTop: '20px', overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '0 0 20px', overflowY: 'auto' }}>
          <div style={{ padding: '4px 16px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Categorias
          </div>
          {[{ id: '', name: 'Todos os Dispositivos', code: 'all' }, ...categories].map((cat) => {
            const Icon = DEVICE_TYPE_META[cat.code]?.icon ?? Network;
            const color = DEVICE_TYPE_META[cat.code]?.color ?? '#94a3b8';
            return (
              <button key={cat.id} onClick={() => { setActiveCategoryId(cat.id); setPage(1); }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 16px', background: activeCategoryId === cat.id ? 'var(--accent-subtle, rgba(99,102,241,0.1))' : 'transparent', border: 'none', borderLeft: activeCategoryId === cat.id ? '3px solid var(--accent)' : '3px solid transparent', cursor: 'pointer', color: activeCategoryId === cat.id ? 'var(--accent)' : 'var(--text-primary)', fontSize: '13px', textAlign: 'left' }}>
                <Icon size={14} color={activeCategoryId === cat.id ? undefined : color} />
                {cat.name}
              </button>
            );
          })}

          <div style={{ padding: '16px 16px 8px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', borderTop: '1px solid var(--border)', marginTop: '8px' }}>
            Áreas
          </div>
          {[{ id: '', name: 'Todas as Áreas', icon: '🏠' }, ...areas].map((area) => (
            <button key={area.id} onClick={() => { setActiveAreaId(area.id); setPage(1); }}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 16px', background: activeAreaId === area.id ? 'var(--accent-subtle, rgba(99,102,241,0.1))' : 'transparent', border: 'none', borderLeft: activeAreaId === area.id ? '3px solid var(--accent)' : '3px solid transparent', cursor: 'pointer', color: activeAreaId === area.id ? 'var(--accent)' : 'var(--text-primary)', fontSize: '13px', textAlign: 'left' }}>
              <span>{area.icon ?? '📍'}</span> {area.name}
            </button>
          ))}
        </aside>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 28px 28px' }}>

          {/* ── Section: Dispositivos Adicionados ─────────────────────────── */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0 12px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ScanLine size={16} style={{ color: 'var(--accent)' }} />
                Dispositivos Adicionados
                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', background: 'var(--border)', padding: '1px 8px', borderRadius: '999px' }}>{total}</span>
              </h2>

              {/* Bulk actions */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {selected.size > 0 && (
                  <>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', alignSelf: 'center', marginRight: '4px' }}>{selected.size} selecionado(s)</span>
                    <button onClick={() => { setBulkAction('password'); setBulkValue(''); setBulkMsg(null); }}
                      style={bulkBtnStyle}><Key size={13} /> Senha</button>
                    <button onClick={() => { setBulkAction('timezone'); setBulkValue(''); setBulkMsg(null); }}
                      style={bulkBtnStyle}><Globe size={13} /> Timezone</button>
                    <button onClick={() => { setDeleteConfirm(true); setDeleteError(null); }}
                      style={{ ...bulkBtnStyle, color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}>
                      <Trash2 size={13} /> Excluir
                    </button>
                  </>
                )}
                {/* Search */}
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Buscar..."
                    style={{ paddingLeft: '28px', padding: '7px 10px 7px 28px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', width: '180px' }} />
                </div>
              </div>
            </div>

            {/* Device table */}
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <Loader2 className="animate-spin" size={18} /> Carregando dispositivos...
              </div>
            ) : devices.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Network size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                <p style={{ margin: 0 }}>Nenhum dispositivo cadastrado.</p>
                <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
                  Use "Adicionar dispositivo" ou a seção de descoberta automática abaixo.
                </p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '2px' }}>
                <thead>
                  <tr style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    <th style={thStyle}>
                      <input type="checkbox" checked={selected.size === devices.length && devices.length > 0} onChange={toggleAll} />
                    </th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Nome / IP</th>
                    <th style={thStyle}>Tipo</th>
                    <th style={thStyle}>Fabricante / Modelo</th>
                    <th style={thStyle}>Área</th>
                    <th style={thStyle}>Protocolo</th>
                    <th style={thStyle}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => {
                    const typeMeta = DEVICE_TYPE_META[device.deviceType] ?? DEVICE_TYPE_META.unknown;
                    const statusMeta = STATUS_META[device.status] ?? STATUS_META.unknown;
                    const Icon = typeMeta.icon;
                    const area = areas.find((a) => a.id === device.areaId);
                    return (
                      <tr key={device.id} style={{ borderBottom: '1px solid var(--border)', background: selected.has(device.id) ? 'rgba(99,102,241,0.05)' : 'transparent' }}>
                        <td style={tdStyle}>
                          <input type="checkbox" checked={selected.has(device.id)} onChange={() => toggleSelect(device.id)} />
                        </td>
                        <td style={tdStyle}>
                          <span title={statusMeta.label} style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: statusMeta.color, boxShadow: device.status === 'online' ? `0 0 6px ${statusMeta.color}` : 'none' }} />
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {device.friendlyName ?? device.ipAddress}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{device.ipAddress}:{device.httpPort}</div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                            <Icon size={13} color={typeMeta.color} />{typeMeta.label}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{device.manufacturer ?? '—'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{device.model ?? ''}</div>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {area?.icon ?? ''} {area?.name ?? '—'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '999px', background: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                            {device.protocolType}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => syncDevice(device.id)} disabled={syncingId === device.id} title="Sincronizar status"
                              style={{ padding: '5px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                              {syncingId === device.id ? <Loader2 className="animate-spin" size={13} /> : <RefreshCw size={13} />}
                            </button>
                            <button onClick={() => openEdit(device)} title="Configurar dispositivo"
                              style={{ padding: '5px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                              <Settings2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {total > 50 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtn}>← Anterior</button>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', alignSelf: 'center' }}>Página {page}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= total} style={pageBtn}>Próxima →</button>
              </div>
            )}
          </div>

          {/* ── Section: Dispositivos Online (Discovery) ─────────────────── */}
          <NetworkDiscoverySection />
        </div>
      </div>

      {/* ── Modal: Edit Device ──────────────────────────────────────────────── */}
      {editDevice && (
        <Modal title={`Configurar: ${editDevice.friendlyName ?? editDevice.ipAddress}`} onClose={() => setEditDevice(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <FormField label="Nome do dispositivo">
              <input value={editForm.friendlyName} onChange={(e) => setEditForm((f) => ({ ...f, friendlyName: e.target.value }))} style={inputS} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <FormField label="Usuário">
                <input value={editForm.username} onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))} style={inputS} />
              </FormField>
              <FormField label="Nova senha (opcional)">
                <div style={{ position: 'relative' }}>
                  <input type={showPassword ? 'text' : 'password'} value={editForm.password} placeholder="Deixar em branco para manter"
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} style={{ ...inputS, paddingRight: '36px' }} />
                  <button onClick={() => setShowPassword((s) => !s)} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </FormField>
            </div>
            <FormField label="Categoria">
              <select value={editForm.categoryId} onChange={(e) => setEditForm((f) => ({ ...f, categoryId: e.target.value }))} style={inputS}>
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Área / Localização">
              <select value={editForm.areaId} onChange={(e) => setEditForm((f) => ({ ...f, areaId: e.target.value }))} style={inputS}>
                <option value="">Sem área</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.icon ?? ''} {a.name}</option>)}
              </select>
            </FormField>
            {editError && <ErrorBanner msg={editError} />}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button onClick={() => setEditDevice(null)} style={cancelBtn}>Cancelar</button>
              <button onClick={submitEdit} disabled={editLoading} style={primaryBtn}>
                {editLoading ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />} Salvar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Add Device ───────────────────────────────────────────────── */}
      {addModal && (
        <Modal title="Adicionar Dispositivo Manualmente" onClose={() => setAddModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <FormField label="Nome do dispositivo *">
              <input value={addForm.friendlyName} onChange={(e) => setAddForm((f) => ({ ...f, friendlyName: e.target.value }))} style={inputS} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <FormField label="Endereço IP *">
                <input value={addForm.ipAddress} onChange={(e) => setAddForm((f) => ({ ...f, ipAddress: e.target.value }))} placeholder="192.168.1.100" style={inputS} />
              </FormField>
              <FormField label="Tipo de dispositivo">
                <select value={addForm.deviceType} onChange={(e) => setAddForm((f) => ({ ...f, deviceType: e.target.value }))} style={inputS}>
                  {Object.entries(DEVICE_TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <FormField label="Usuário *">
                <input value={addForm.username} onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))} style={inputS} />
              </FormField>
              <FormField label="Senha *">
                <input type="password" value={addForm.password} onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))} style={inputS} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <FormField label="Porta HTTP">
                <input type="number" value={addForm.httpPort} onChange={(e) => setAddForm((f) => ({ ...f, httpPort: e.target.value }))} style={inputS} />
              </FormField>
              <FormField label="Porta SDK">
                <input type="number" value={addForm.sdkPort} onChange={(e) => setAddForm((f) => ({ ...f, sdkPort: e.target.value }))} style={inputS} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <FormField label="Categoria">
                <select value={addForm.categoryId} onChange={(e) => setAddForm((f) => ({ ...f, categoryId: e.target.value }))} style={inputS}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FormField>
              <FormField label="Área">
                <select value={addForm.areaId} onChange={(e) => setAddForm((f) => ({ ...f, areaId: e.target.value }))} style={inputS}>
                  <option value="">Sem área</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.icon ?? ''} {a.name}</option>)}
                </select>
              </FormField>
            </div>
            {addError && <ErrorBanner msg={addError} />}
            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button onClick={() => setAddModal(false)} style={cancelBtn}>Cancelar</button>
              <button onClick={submitAdd} disabled={addLoading || !addForm.ipAddress || !addForm.friendlyName || !addForm.username || !addForm.password} style={primaryBtn}>
                {addLoading ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />} Adicionar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: Bulk Action ──────────────────────────────────────────────── */}
      {bulkAction && (
        <Modal title={bulkAction === 'password' ? 'Modificar Senha em Lote' : 'Definir Timezone em Lote'} onClose={() => setBulkAction(null)}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 14px' }}>
            {bulkAction === 'password' ? `Aplicar nova senha em ${selected.size} dispositivo(s). A nova credencial será salva no banco mas não enviada ao hardware.` : `Registrar fuso horário para ${selected.size} dispositivo(s).`}
          </p>
          <input
            type={bulkAction === 'password' ? 'password' : 'text'}
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            placeholder={bulkAction === 'password' ? 'Nova senha' : 'Ex: America/Sao_Paulo'}
            style={{ ...inputS, marginBottom: '12px' }}
          />
          {bulkMsg && <p style={{ fontSize: '13px', color: bulkMsg.includes('atualizada') || bulkMsg.includes('aplicado') ? '#22c55e' : '#f87171', margin: '0 0 10px' }}>{bulkMsg}</p>}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setBulkAction(null)} style={cancelBtn}>Cancelar</button>
            <button onClick={bulkAction === 'password' ? submitBulkPassword : submitBulkTimezone} disabled={bulkLoading || !bulkValue} style={primaryBtn}>
              {bulkLoading ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />} Aplicar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: Delete Confirm ───────────────────────────────────────────── */}
      {deleteConfirm && (
        <Modal title="Confirmar Exclusão" onClose={() => setDeleteConfirm(false)}>
          <p style={{ fontSize: '14px', color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Deseja remover <strong>{selected.size}</strong> dispositivo(s) da plataforma?
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Dispositivos vinculados a Áreas de Acesso não podem ser excluídos.
          </p>
          {deleteError && <ErrorBanner msg={deleteError} />}
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button onClick={() => setDeleteConfirm(false)} style={cancelBtn}>Cancelar</button>
            <button onClick={submitDelete} disabled={deleteLoading}
              style={{ ...primaryBtn, background: '#ef4444' }}>
              {deleteLoading ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />} Excluir
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px', width: '100%', maxWidth: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.4)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
      {label}
      {children}
    </label>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: '#f87171', fontSize: '13px', background: 'rgba(239,68,68,0.1)', padding: '10px 12px', borderRadius: '6px' }}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} /> {msg}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)' };
const tdStyle: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' };
const inputS: React.CSSProperties = { padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', width: '100%', boxSizing: 'border-box' };
const cancelBtn: React.CSSProperties = { flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '13px' };
const primaryBtn: React.CSSProperties = { flex: 1, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' };
const bulkBtnStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600 };
const pageBtn: React.CSSProperties = { padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '13px' };
