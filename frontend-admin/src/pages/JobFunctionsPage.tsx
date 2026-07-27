import React, { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { apiFetch as request } from '@/services/api';

interface JobFunction {
    id: string;
    name: string;
    description?: string | null;
    person_count?: number;
    service_provider_count?: number;
}

const emptyForm = { name: '', description: '' };

export default function JobFunctionsPage() {
    const [jobFunctions, setJobFunctions] = useState<JobFunction[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingFn, setEditingFn] = useState<JobFunction | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await request<{ data: JobFunction[] } | JobFunction[]>('/job-functions');
            setJobFunctions(Array.isArray(res) ? res : (res?.data ?? []));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const openNew = () => {
        setEditingFn(null);
        setForm(emptyForm);
        setShowForm(true);
    };

    const openEdit = (fn: JobFunction) => {
        setEditingFn(fn);
        setForm({
            name: fn.name,
            description: fn.description ?? '',
        });
        setShowForm(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        setError(null);
        try {
            if (editingFn) {
                await request(`/job-functions/${editingFn.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(form),
                });
            } else {
                await request('/job-functions', {
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
        setError(null);
        try {
            await request(`/job-functions/${id}`, { method: 'DELETE' });
            setDeleteConfirm(null);
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
                        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Funções</h1>
                        <p style={{ color: 'var(--muted-fg, #888)', marginTop: 4, fontSize: 14 }}>
                            Gerencie os cargos/funções (ex: zelador, porteiro, síndico) e vincule moradores e prestadores a eles.
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
                        + Nova Função
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
                        borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                    }}>
                        <h3 style={{ margin: '0 0 18px', fontWeight: 700, fontSize: 16 }}>
                            {editingFn ? 'Editar Função' : 'Nova Função'}
                        </h3>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Nome *</label>
                            <input
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="ex: Zelador"
                                style={{
                                    width: '100%', padding: '9px 12px', borderRadius: 8,
                                    border: '1px solid var(--border, #e4e4e7)',
                                    background: 'var(--input, #fff)', fontSize: 14, boxSizing: 'border-box',
                                    color: 'var(--foreground, #18181b)',
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: 24 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Descrição</label>
                            <input
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="ex: Responsável pela manutenção e limpeza das áreas comuns"
                                style={{
                                    width: '100%', padding: '9px 12px', borderRadius: 8,
                                    border: '1px solid var(--border, #e4e4e7)',
                                    background: 'var(--input, #fff)', fontSize: 14, boxSizing: 'border-box',
                                    color: 'var(--foreground, #18181b)',
                                }}
                            />
                        </div>

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
                ) : jobFunctions.length === 0 ? (
                    <div style={{
                        background: 'var(--card, #fff)', border: '2px dashed var(--border, #e4e4e7)',
                        borderRadius: 16, padding: '48px 24px', textAlign: 'center', color: '#aaa',
                    }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>🧑‍💼</div>
                        <p style={{ fontWeight: 600, marginBottom: 4 }}>Nenhuma função cadastrada</p>
                        <p style={{ fontSize: 13 }}>Clique em "Nova Função" para começar.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {jobFunctions.map(fn => {
                            const usageCount = (fn.person_count ?? 0) + (fn.service_provider_count ?? 0);
                            return (
                                <div
                                    key={fn.id}
                                    style={{
                                        background: 'var(--card, #fff)', border: '1px solid var(--border, #e4e4e7)',
                                        borderRadius: 14, padding: '14px 18px',
                                        display: 'flex', alignItems: 'center', gap: 14,
                                    }}
                                >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: 700, fontSize: 15 }}>{fn.name}</span>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600,
                                                background: '#6366f122', color: '#6366f1',
                                                borderRadius: 6, padding: '2px 8px',
                                                border: '1px solid #6366f144',
                                            }}>
                                                {usageCount === 1 ? '1 vínculo' : `${usageCount} vínculos`}
                                            </span>
                                        </div>
                                        {fn.description && (
                                            <p style={{ fontSize: 13, color: '#888', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {fn.description}
                                            </p>
                                        )}
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                        <button
                                            onClick={() => openEdit(fn)}
                                            style={{
                                                background: '#fafafa', border: '1px solid var(--border, #e4e4e7)',
                                                borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                                color: 'var(--foreground, #18181b)',
                                            }}
                                        >
                                            Editar
                                        </button>
                                        {deleteConfirm === fn.id ? (
                                            <>
                                                <button
                                                    onClick={() => handleDelete(fn.id)}
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
                                                onClick={() => setDeleteConfirm(fn.id)}
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
                            );
                        })}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
