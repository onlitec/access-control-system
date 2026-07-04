import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { apiFetch as request } from '@/services/api';

interface AccessArea {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    isActive: boolean;
    order: number;
}

const ICON_OPTIONS = ['🏠','🏊','🏋️','⛹️','🎉','🔥','🚶','🧖','🚗','🛝','🎾','🎱','🏓','🎳','🎭','🎬','📚','🌿','🐾','🅿️'];

const emptyForm = { name: '', description: '', icon: '🏠', isActive: true, order: 0 };

export default function AccessAreasPage() {
    const [areas, setAreas] = useState<AccessArea[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingArea, setEditingArea] = useState<AccessArea | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await request<{ data: AccessArea[] }>('/access-areas?all=true');
            setAreas(res?.data ?? []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const openNew = () => {
        setEditingArea(null);
        setForm({ ...emptyForm, order: areas.length + 1 });
        setShowForm(true);
    };

    const openEdit = (area: AccessArea) => {
        setEditingArea(area);
        setForm({
            name: area.name,
            description: area.description ?? '',
            icon: area.icon ?? '🏠',
            isActive: area.isActive,
            order: area.order,
        });
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            if (editingArea) {
                await request(`/access-areas/${editingArea.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(form),
                });
            } else {
                await request('/access-areas', {
                    method: 'POST',
                    body: JSON.stringify(form),
                });
            }
            setShowForm(false);
            load();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await request(`/access-areas/${id}`, { method: 'DELETE' });
            setDeleteConfirm(null);
            load();
        } catch (e: any) {
            setError(e.message);
        }
    };

    const toggleActive = async (area: AccessArea) => {
        try {
            await request(`/access-areas/${area.id}`, {
                method: 'PUT',
                body: JSON.stringify({ isActive: !area.isActive }),
            });
            load();
        } catch (e: any) {
            setError(e.message);
        }
    };

    return (
        <AdminLayout>
            <div style={{ padding: '32px 0', maxWidth: 860, margin: '0 auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
                    <div>
                        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Áreas de Acesso</h1>
                        <p style={{ color: 'var(--muted-fg, #888)', marginTop: 4, fontSize: 14 }}>
                            Configure as áreas do condomínio disponíveis no cadastro de moradores.
                        </p>
                    </div>
                    <button
                        onClick={openNew}
                        style={{
                            background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10,
                            padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14,
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}
                    >
                        + Nova Área
                    </button>
                </div>

                {error && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', color: '#b91c1c', marginBottom: 20 }}>
                        {error}
                        <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontWeight: 700 }}>×</button>
                    </div>
                )}

                {/* Form */}
                {showForm && (
                    <div style={{
                        background: 'var(--card, #fff)', border: '1px solid var(--border, #e4e4e7)',
                        borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
                    }}>
                        <h3 style={{ margin: '0 0 18px', fontWeight: 700, fontSize: 16 }}>
                            {editingArea ? 'Editar Área' : 'Nova Área'}
                        </h3>

                        {/* Icon picker */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>Ícone</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {ICON_OPTIONS.map(ic => (
                                    <button
                                        key={ic}
                                        onClick={() => setForm(f => ({ ...f, icon: ic }))}
                                        style={{
                                            width: 40, height: 40, borderRadius: 8, border: form.icon === ic
                                                ? '2px solid #dc2626' : '1px solid var(--border, #e4e4e7)',
                                            background: form.icon === ic ? '#fef2f2' : 'transparent',
                                            cursor: 'pointer', fontSize: 20,
                                        }}
                                    >
                                        {ic}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Name */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Nome *</label>
                                <input
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="ex: Piscina"
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: 8,
                                        border: '1px solid var(--border, #e4e4e7)',
                                        background: 'var(--input, #fff)', fontSize: 14, boxSizing: 'border-box',
                                        color: 'var(--foreground, #18181b)',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Ordem</label>
                                <input
                                    type="number"
                                    value={form.order}
                                    onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))}
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: 8,
                                        border: '1px solid var(--border, #e4e4e7)',
                                        background: 'var(--input, #fff)', fontSize: 14, boxSizing: 'border-box',
                                        color: 'var(--foreground, #18181b)',
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Descrição</label>
                            <input
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="ex: Área da piscina e deck molhado"
                                style={{
                                    width: '100%', padding: '9px 12px', borderRadius: 8,
                                    border: '1px solid var(--border, #e4e4e7)',
                                    background: 'var(--input, #fff)', fontSize: 14, boxSizing: 'border-box',
                                    color: 'var(--foreground, #18181b)',
                                }}
                            />
                        </div>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 20 }}>
                            <input
                                type="checkbox"
                                checked={form.isActive}
                                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                            />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>Área ativa (visível no cadastro de moradores)</span>
                        </label>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.name.trim()}
                                style={{
                                    background: saving || !form.name.trim() ? '#e4e4e7' : '#dc2626',
                                    color: saving || !form.name.trim() ? '#aaa' : '#fff',
                                    border: 'none', borderRadius: 8, padding: '9px 20px',
                                    fontWeight: 600, cursor: saving || !form.name.trim() ? 'default' : 'pointer', fontSize: 14,
                                }}
                            >
                                {saving ? 'Salvando…' : 'Salvar'}
                            </button>
                            <button
                                onClick={() => setShowForm(false)}
                                style={{
                                    background: 'transparent', border: '1px solid var(--border, #e4e4e7)',
                                    borderRadius: 8, padding: '9px 20px', fontWeight: 500, cursor: 'pointer', fontSize: 14,
                                    color: 'var(--foreground, #18181b)',
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* List */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: '#aaa' }}>Carregando…</div>
                ) : areas.length === 0 ? (
                    <div style={{
                        background: 'var(--card, #fff)', border: '2px dashed var(--border, #e4e4e7)',
                        borderRadius: 16, padding: '48px 24px', textAlign: 'center', color: '#aaa',
                    }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                        <p style={{ fontWeight: 600, marginBottom: 4 }}>Nenhuma área cadastrada</p>
                        <p style={{ fontSize: 13 }}>Clique em "Nova Área" para adicionar as áreas do condomínio.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {areas.map(area => (
                            <div
                                key={area.id}
                                style={{
                                    background: 'var(--card, #fff)', border: '1px solid var(--border, #e4e4e7)',
                                    borderRadius: 14, padding: '14px 18px',
                                    display: 'flex', alignItems: 'center', gap: 14,
                                    opacity: area.isActive ? 1 : 0.55,
                                }}
                            >
                                <span style={{ fontSize: 28, minWidth: 36, textAlign: 'center' }}>{area.icon}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, fontSize: 15 }}>{area.name}</span>
                                        {!area.isActive && (
                                            <span style={{
                                                fontSize: 11, fontWeight: 600, color: '#6b7280',
                                                background: '#f3f4f6', borderRadius: 6, padding: '2px 7px',
                                            }}>INATIVA</span>
                                        )}
                                    </div>
                                    {area.description && (
                                        <p style={{ fontSize: 13, color: '#888', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {area.description}
                                        </p>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                    <button
                                        onClick={() => toggleActive(area)}
                                        title={area.isActive ? 'Desativar' : 'Ativar'}
                                        style={{
                                            background: area.isActive ? '#f0fdf4' : '#f3f4f6',
                                            border: '1px solid ' + (area.isActive ? '#bbf7d0' : '#e4e4e7'),
                                            borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                                            fontWeight: 600, color: area.isActive ? '#16a34a' : '#6b7280',
                                        }}
                                    >
                                        {area.isActive ? 'Ativa' : 'Inativa'}
                                    </button>
                                    <button
                                        onClick={() => openEdit(area)}
                                        style={{
                                            background: '#fafafa', border: '1px solid var(--border, #e4e4e7)',
                                            borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                            color: 'var(--foreground, #18181b)',
                                        }}
                                    >
                                        Editar
                                    </button>
                                    {deleteConfirm === area.id ? (
                                        <>
                                            <button
                                                onClick={() => handleDelete(area.id)}
                                                style={{
                                                    background: '#dc2626', color: '#fff', border: 'none',
                                                    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                                }}
                                            >
                                                Confirmar
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(null)}
                                                style={{
                                                    background: 'transparent', border: '1px solid var(--border, #e4e4e7)',
                                                    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                                                    color: 'var(--foreground, #18181b)',
                                                }}
                                            >
                                                Cancelar
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => setDeleteConfirm(area.id)}
                                            style={{
                                                background: '#fef2f2', border: '1px solid #fca5a5',
                                                borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                                                fontWeight: 600, color: '#dc2626',
                                            }}
                                        >
                                            Excluir
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
