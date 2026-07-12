import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { apiFetch as request } from '@/services/api';
import {
  Folder, FolderOpen, Star, Plus, Edit2, Trash2, Key, Network,
  Camera, Cpu, Fingerprint, Mic, Wifi, ChevronDown, ChevronRight,
  CheckCircle, AlertTriangle, X, Settings, ArrowRight, Loader2,
  ListTodo
} from 'lucide-react';

interface AccessAreaNode {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  isFavorite: boolean;
  order: number;
  parentId: string | null;
  deviceCount: number;
  children: AccessAreaNode[];
}

interface FacialDoor {
  id: string;
  doorNo: number;
  name: string;
  actuatorType: string;
}

interface FacialDevice {
  id: string;
  name: string;
  role: string;
  doors: FacialDoor[];
}

interface NetworkDevice {
  id: string;
  friendlyName: string | null;
  ipAddress: string;
  deviceType: string;
  manufacturer: string | null;
  model: string | null;
  status: string;
}

const ICON_OPTIONS = ['🏠','🏊','🏋️','⛹️','🎉','🔥','🚶','🧖','🚗','🛝','🎾','🎱','🏓','🎳','🎭','🎬','📚','🌿','🐾','🅿️'];

export default function AccessAreasPage() {
  const [tree, setTree] = useState<AccessAreaNode[]>([]);
  const [flatAreas, setFlatAreas] = useState<AccessAreaNode[]>([]);
  const [selectedArea, setSelectedArea] = useState<AccessAreaNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States de Modais
  const [showForm, setShowForm] = useState(false);
  const [editingArea, setEditingArea] = useState<AccessAreaNode | null>(null);
  const [parentIdForNew, setParentIdForNew] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', icon: '🏠', isActive: true, order: 0, parentId: '' });

  // Exclusão com mover dispositivos
  const [areaToDelete, setAreaToDelete] = useState<AccessAreaNode | null>(null);
  const [moveDevicesToId, setMoveDevicesToId] = useState<string>('null');

  // Associação de Dispositivos
  const [showDeviceAssociation, setShowDeviceAssociation] = useState(false);
  const [allAvailableDevices, setAllAvailableDevices] = useState<NetworkDevice[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [associating, setAssociating] = useState(false);

  // Portas vinculadas (abas de detalhes da área)
  const [activeTab, setActiveTab] = useState<'doors' | 'devices'>('doors');
  const [facialDevices, setFacialDevices] = useState<FacialDevice[]>([]);
  const [selectedDoorIds, setSelectedDoorIds] = useState<string[]>([]);
  const [doorsLoading, setDoorsLoading] = useState(false);
  const [doorsSaving, setDoorsSaving] = useState(false);
  const [areaDevices, setAreaDevices] = useState<NetworkDevice[]>([]);
  const [areaDevicesLoading, setAreaDevicesLoading] = useState(false);

  // Controle de nós expandidos na árvore
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // ── Carregamento de Dados ──────────────────────────────────────────────────

  const loadTree = async () => {
    setLoading(true);
    try {
      const res = await request<{ data: AccessAreaNode[] }>('/access-areas/tree');
      const data = res?.data ?? [];
      setTree(data);

      // Achata a árvore para popular select boxes
      const flat: AccessAreaNode[] = [];
      const flatten = (nodes: AccessAreaNode[]) => {
        nodes.forEach(n => {
          flat.push(n);
          if (n.children && n.children.length > 0) flatten(n.children);
        });
      };
      flatten(data);
      setFlatAreas(flat);

      // Auto-seleciona a primeira área se nenhuma selecionada
      if (data.length > 0 && !selectedArea) {
        setSelectedArea(data[0]);
      } else if (selectedArea) {
        // Atualiza a referência selecionada
        const updated = flat.find(x => x.id === selectedArea.id);
        if (updated) setSelectedArea(updated);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadFacialDevices = async () => {
    try {
      const res = await request<{ devices: FacialDevice[] }>('/facial-access/devices');
      setFacialDevices(res?.devices ?? []);
    } catch {
      setFacialDevices([]);
    }
  };

  const loadAreaDevices = useCallback(async (areaId: string) => {
    setAreaDevicesLoading(true);
    try {
      const res = await request<{ data: NetworkDevice[] }>(`/access-areas/${areaId}/devices`);
      setAreaDevices(res?.data ?? []);
    } catch {
      setAreaDevices([]);
    } finally {
      setAreaDevicesLoading(false);
    }
  }, []);

  const loadDoorsOfArea = useCallback(async (areaId: string) => {
    setDoorsLoading(true);
    try {
      const res = await request<{ data: FacialDoor[] }>(`/access-areas/${areaId}/doors`);
      setSelectedDoorIds((res?.data ?? []).map(d => d.id));
    } catch {
      setSelectedDoorIds([]);
    } finally {
      setDoorsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTree();
    loadFacialDevices();
  }, []);

  useEffect(() => {
    if (selectedArea) {
      loadAreaDevices(selectedArea.id);
      loadDoorsOfArea(selectedArea.id);
    }
  }, [selectedArea, loadAreaDevices, loadDoorsOfArea]);

  // ── Ações da Árvore e Hierarquia ───────────────────────────────────────────

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleFavorite = async (area: AccessAreaNode, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await request(`/access-areas/${area.id}/favorite`, {
        method: 'PUT',
        body: JSON.stringify({ isFavorite: !area.isFavorite })
      });
      loadTree();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── Ações de CRUD ──────────────────────────────────────────────────────────

  const openNew = (parentId: string | null = null) => {
    setEditingArea(null);
    setParentIdForNew(parentId);
    setForm({ name: '', description: '', icon: '🏠', isActive: true, order: flatAreas.length + 1, parentId: parentId || '' });
    setError(null);
    setShowForm(true);
  };

  const openEdit = (area: AccessAreaNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingArea(area);
    setParentIdForNew(null);
    setForm({
      name: area.name,
      description: area.description ?? '',
      icon: area.icon ?? '🏠',
      isActive: area.isActive,
      order: area.order,
      parentId: area.parentId ?? ''
    });
    setError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingArea) {
        await request(`/access-areas/${editingArea.id}`, {
          method: 'PUT',
          body: JSON.stringify(form)
        });
      } else {
        await request('/access-areas', {
          method: 'POST',
          body: JSON.stringify(form)
        });
      }
      setShowForm(false);
      loadTree();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!areaToDelete) return;
    try {
      await request(`/access-areas/${areaToDelete.id}?moveDevicesTo=${moveDevicesToId}`, {
        method: 'DELETE'
      });
      setAreaToDelete(null);
      setSelectedArea(null);
      loadTree();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── Portas Vinculadas ──────────────────────────────────────────────────────

  const toggleDoorSelection = (doorId: string) => {
    setSelectedDoorIds(prev => prev.includes(doorId) ? prev.filter(id => id !== doorId) : [...prev, doorId]);
  };

  const saveDoors = async () => {
    if (!selectedArea) return;
    setDoorsSaving(true);
    try {
      await request(`/access-areas/${selectedArea.id}/doors`, {
        method: 'PUT',
        body: JSON.stringify({ doorIds: selectedDoorIds })
      });
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDoorsSaving(false);
    }
  };

  // ── Associação de Dispositivos ─────────────────────────────────────────────

  const openDeviceAssociation = async () => {
    if (!selectedArea) return;
    try {
      // Busca todos os dispositivos cadastrados no banco
      const res = await request<{ data: NetworkDevice[] }>('/devices?limit=200');
      // Filtra os que não estão na área atual
      const available = (res?.data ?? []).filter(d => d.id !== selectedArea.id);
      setAllAvailableDevices(available);
      setSelectedDeviceIds([]);
      setShowDeviceAssociation(true);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const submitDeviceAssociation = async () => {
    if (!selectedArea || selectedDeviceIds.length === 0) return;
    setAssociating(true);
    try {
      await request(`/access-areas/${selectedArea.id}/devices`, {
        method: 'PUT',
        body: JSON.stringify({ deviceIds: selectedDeviceIds })
      });
      setShowDeviceAssociation(false);
      loadTree();
      if (selectedArea) loadAreaDevices(selectedArea.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAssociating(false);
    }
  };

  const removeDeviceFromArea = async (deviceId: string) => {
    try {
      await request(`/devices/${deviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ areaId: null })
      });
      loadTree();
      if (selectedArea) loadAreaDevices(selectedArea.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── Render Helpers ──────────────────────────────────────────────────────────

  const renderNode = (node: AccessAreaNode, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedArea?.id === node.id;

    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          onClick={() => setSelectedArea(node)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            background: isSelected ? 'var(--accent-subtle, rgba(99,102,241,0.08))' : 'transparent',
            borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
            marginLeft: depth * 16,
            transition: 'all 0.15s ease',
            gap: '8px'
          }}
        >
          {/* Collapse/Expand toggle */}
          {hasChildren ? (
            <button
              onClick={(e) => toggleExpand(node.id, e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span style={{ width: 18 }} />
          )}

          {/* Icon */}
          <span style={{ fontSize: '18px', width: '22px', textAlign: 'center' }}>
            {node.icon ?? '🏠'}
          </span>

          {/* Title & Count */}
          <span style={{ flex: 1, fontSize: '13px', fontWeight: isSelected ? 600 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
            {node.deviceCount > 0 && (
              <span style={{ fontSize: '10px', marginLeft: '6px', color: 'var(--text-muted)', background: 'var(--border)', padding: '1px 6px', borderRadius: '999px' }}>
                {node.deviceCount}
              </span>
            )}
          </span>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              onClick={(e) => toggleFavorite(node, e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: node.isFavorite ? '#fbbf24' : 'var(--text-muted)' }}
            >
              <Star size={13} fill={node.isFavorite ? '#fbbf24' : 'none'} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); openNew(node.id); }}
              title="Adicionar sub-área"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
            >
              <Plus size={13} />
            </button>
            <button
              onClick={(e) => openEdit(node, e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)' }}
            >
              <Edit2 size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setAreaToDelete(node); setMoveDevicesToId('null'); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#f87171' }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Children Recursion */}
        {hasChildren && isExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px dashed var(--border)', marginLeft: (depth * 16) + 20 }}>
            {node.children.map(child => renderNode(child, 0))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="page" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '22px', fontWeight: 700 }}>
              <FolderOpen size={24} style={{ color: 'var(--accent)' }} /> Áreas de Acesso (Calabasas)
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>
              Organize os pontos físicos de segurança do condomínio e associe os leitores faciais e câmeras correspondentes.
            </p>
          </div>
          <button
            onClick={() => openNew(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px',
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px',
              fontWeight: 600, fontSize: '13px', cursor: 'pointer'
            }}
          >
            <Plus size={14} /> Criar Área Raiz
          </button>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontSize: '13px', background: 'rgba(239,68,68,0.1)', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px' }}>
            <AlertTriangle size={14} /> {error}
            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 700 }}>×</button>
          </div>
        )}

        {/* Split Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', flex: 1, minHeight: 0 }}>
          
          {/* Panel Esquerdo - Árvore de áreas */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>
              Estrutura Física
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                <Loader2 className="animate-spin" size={16} /> Carregando estrutura...
              </div>
            ) : tree.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                Nenhuma área criada. Comece criando uma área raiz acima.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {tree.map(node => renderNode(node, 0))}
              </div>
            )}
          </div>

          {/* Panel Direito - Detalhes da Área Selecionada */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {selectedArea ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                      <span style={{ fontSize: '24px' }}>{selectedArea.icon}</span> {selectedArea.name}
                    </h2>
                    {selectedArea.description && (
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '4px 0 0' }}>{selectedArea.description}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => openEdit(selectedArea, { stopPropagation: () => {} } as any)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      <Edit2 size={12} /> Editar Área
                    </button>
                    {activeTab === 'devices' && (
                      <button
                        onClick={openDeviceAssociation}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        <Plus size={12} /> Vincular Dispositivo
                      </button>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
                  <button
                    onClick={() => setActiveTab('doors')}
                    style={{
                      padding: '10px 4px', background: 'none', border: 'none',
                      borderBottom: activeTab === 'doors' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeTab === 'doors' ? 'var(--accent)' : 'var(--text-muted)',
                      fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                    }}
                  >
                    🚪 Portas Liberadas (HikCentral)
                  </button>
                  <button
                    onClick={() => setActiveTab('devices')}
                    style={{
                      padding: '10px 4px', background: 'none', border: 'none',
                      borderBottom: activeTab === 'devices' ? '2px solid var(--accent)' : '2px solid transparent',
                      color: activeTab === 'devices' ? 'var(--accent)' : 'var(--text-muted)',
                      fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                    }}
                  >
                    🔌 Dispositivos de Rede Associados
                  </button>
                </div>

                {/* Tab: Portas */}
                {activeTab === 'doors' && (
                  <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {doorsLoading ? (
                      <div style={{ color: 'var(--text-muted)', padding: '20px' }}>Carregando portas do banco...</div>
                    ) : facialDevices.every(d => d.doors.length === 0) ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                        Nenhuma porta de autenticação facial cadastrada. Crie uma conexão nas Integrações.
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {facialDevices.filter(d => d.doors.length > 0).map(device => (
                            <div key={device.id} style={{ background: 'rgba(100,116,139,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                {device.name}
                              </span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                {device.doors.map(door => {
                                  const isSelected = selectedDoorIds.includes(door.id);
                                  return (
                                    <label
                                      key={door.id}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                                        padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
                                        background: isSelected ? 'var(--accent-subtle, rgba(99,102,241,0.08))' : 'var(--card-bg)',
                                        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                                        color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                                        fontWeight: 500, transition: 'all 0.15s ease'
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleDoorSelection(door.id)}
                                        style={{ accentColor: 'var(--accent)' }}
                                      />
                                      #{door.doorNo} {door.name}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                          <button
                            onClick={saveDoors}
                            disabled={doorsSaving}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px',
                              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px',
                              fontWeight: 600, fontSize: '13px', cursor: 'pointer'
                            }}
                          >
                            {doorsSaving ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle size={14} />} Salvar Vínculos
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Tab: Dispositivos de Rede */}
                {activeTab === 'devices' && (
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {areaDevicesLoading ? (
                      <div style={{ color: 'var(--text-muted)', padding: '20px' }}>Buscando dispositivos...</div>
                    ) : areaDevices.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                        Nenhum hardware associado a esta sub-área. Clique em "Vincular Dispositivo" para adicionar.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {areaDevices.map(d => {
                          const isOnline = d.status === 'online';
                          return (
                            <div
                              key={d.id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                                background: 'rgba(100,116,139,0.02)'
                              }}
                            >
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOnline ? '#22c55e' : '#ef4444' }} />
                              <div style={{ flex: 1 }}>
                                <span style={{ fontWeight: 600, fontSize: '13px' }}>{d.friendlyName ?? d.ipAddress}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>({d.ipAddress})</span>
                              </div>
                              <button
                                onClick={() => removeDeviceFromArea(d.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', fontSize: '12px', fontWeight: 600 }}
                              >
                                Desvincular
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Selecione uma área na árvore para visualizar seus dispositivos e configurações.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal: Form de Cadastro/Edição de Área ────────────────────────── */}
      {showForm && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                {editingArea ? 'Editar Área Física' : 'Nova Área Física'}
              </h3>
              <button onClick={() => setShowForm(false)} style={closeBtnStyle}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Icon */}
              <label style={labelStyle}>
                Ícone
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                  {ICON_OPTIONS.map(ic => (
                    <button
                      key={ic}
                      onClick={() => setForm(f => ({ ...f, icon: ic }))}
                      style={{
                        width: '32px', height: '32px', borderRadius: '6px', border: form.icon === ic ? '2px solid var(--accent)' : '1px solid var(--border)',
                        background: form.icon === ic ? 'var(--accent-subtle, rgba(99,102,241,0.08))' : 'transparent',
                        cursor: 'pointer', fontSize: '16px'
                      }}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </label>

              {/* Name */}
              <label style={labelStyle}>
                Nome da Área *
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Academia, Hall A" style={inputStyle} />
              </label>

              {/* Description */}
              <label style={labelStyle}>
                Descrição
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional..." style={inputStyle} />
              </label>

              {/* Parent */}
              <label style={labelStyle}>
                Área Pai (Hierarquia)
                <select
                  value={form.parentId}
                  onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Nenhuma (Área Raiz)</option>
                  {flatAreas.filter(a => !editingArea || a.id !== editingArea.id).map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer', marginTop: '6px' }}>
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                Área ativa e visível no condomínio
              </label>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button onClick={() => setShowForm(false)} style={cancelBtnStyle}>Cancelar</button>
                <button onClick={handleSave} disabled={saving || !form.name.trim()} style={primaryBtnStyle}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar Exclusão com mover dispositivos ───────────────── */}
      {areaToDelete && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Confirmar Exclusão</h3>
              <button onClick={() => setAreaToDelete(null)} style={closeBtnStyle}><X size={20} /></button>
            </div>
            
            <p style={{ fontSize: '13px', margin: '0 0 12px' }}>
              Deseja realmente remover a área <strong>{areaToDelete.name}</strong>? Esta ação excluirá também suas sub-áreas.
            </p>

            {areaToDelete.deviceCount > 0 && (
              <div style={{ background: 'rgba(251,146,60,0.07)', border: '1px solid #fb923c', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#fb923c', display: 'block', marginBottom: '6px' }}>
                  ⚠️ Dispositivos Órfãos Detectados
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Existem {areaToDelete.deviceCount} dispositivos associados a esta área ou sub-áreas. Escolha para onde movê-los:
                </span>
                <select
                  value={moveDevicesToId}
                  onChange={e => setMoveDevicesToId(e.target.value)}
                  style={{ ...inputStyle, marginTop: '8px' }}
                >
                  <option value="null">Desvincular (Mover para "Sem área")</option>
                  {flatAreas.filter(a => a.id !== areaToDelete.id).map(a => (
                    <option key={a.id} value={a.id}>Mover para: {a.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setAreaToDelete(null)} style={cancelBtnStyle}>Cancelar</button>
              <button onClick={handleDeleteConfirm} style={{ ...primaryBtnStyle, background: '#ef4444' }}>
                Excluir Área
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Vincular Dispositivos em Lote ───────────────────────────── */}
      {showDeviceAssociation && selectedArea && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Vincular Dispositivos a {selectedArea.name}</h3>
              <button onClick={() => setShowDeviceAssociation(false)} style={closeBtnStyle}><X size={20} /></button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Selecione quais equipamentos cadastrados na plataforma deseja mover para esta área física.
            </p>

            {allAvailableDevices.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                Nenhum dispositivo disponível para vincular.
              </p>
            ) : (
              <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}>
                {allAvailableDevices.map(d => {
                  const isChecked = selectedDeviceIds.includes(d.id);
                  return (
                    <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', background: isChecked ? 'rgba(99,102,241,0.05)' : 'transparent' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => setSelectedDeviceIds(prev => prev.includes(d.id) ? prev.filter(id => id !== d.id) : [...prev, d.id])}
                      />
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>{d.friendlyName ?? d.ipAddress}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({d.ipAddress})</span>
                    </label>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowDeviceAssociation(false)} style={cancelBtnStyle}>Cancelar</button>
              <button onClick={submitDeviceAssociation} disabled={associating || selectedDeviceIds.length === 0} style={primaryBtnStyle}>
                {associating ? 'Vinculando...' : 'Confirmar Vínculo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

// ── Estilos Locais ────────────────────────────────────────────────────────────

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
};

const modalContentStyle: React.CSSProperties = {
  background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border)',
  padding: '24px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 64px rgba(0,0,0,0.4)'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px'
};

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)'
};

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)',
  borderRadius: '6px', color: 'var(--text-primary)', fontSize: '13px', width: '100%', boxSizing: 'border-box'
};

const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)',
  borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: '13px', textAlign: 'center'
};

const primaryBtnStyle: React.CSSProperties = {
  flex: 1, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: '8px',
  color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '13px', textAlign: 'center'
};
