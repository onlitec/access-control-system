import React, { useState, useEffect } from 'react';
import { getResidents, createResident, deleteResident, syncResidentsFromHikCentral } from '@/services/api';
import { Users, Plus, Search, Trash2, X, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

export default function ResidentsPage() {
    const [residents, setResidents] = useState<any[]>([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ firstName: '', lastName: '', phone: '', email: '', orgIndexCode: '1', photoBase64: '' });
    const [formLoading, setFormLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadResidents();
    }, [page, search]);

    const loadResidents = async () => {
        setLoading(true);
        try {
            const result = await getResidents(page, 20, search);
            setResidents(result.data);
            setCount(result.count);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormLoading(true);
        try {
            await createResident(formData);
            setShowForm(false);
            setFormData({ firstName: '', lastName: '', phone: '', email: '', orgIndexCode: '1', photoBase64: '' });
            loadResidents();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setFormLoading(false);
        }
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Calculate new dimensions keeping aspect ratio (max width/height 600px)
                const maxSize = 600;
                let width = img.width;
                let height = img.height;

                if (width > height && width > maxSize) {
                    height *= maxSize / width;
                    width = maxSize;
                } else if (height > maxSize) {
                    width *= maxSize / height;
                    height = maxSize;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                // Compress to JPEG with 0.8 quality
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                setFormData({ ...formData, photoBase64: compressedBase64 });
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este morador?')) return;
        try {
            await deleteResident(id);
            loadResidents();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setError('');
        try {
            await syncResidentsFromHikCentral();
            loadResidents();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSyncing(false);
        }
    };

    const totalPages = Math.ceil(count / 20);

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1><Users size={24} /> Moradores</h1>
                    <p>{count} moradores cadastrados</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-ghost" onClick={handleSync} disabled={syncing}>
                        {syncing ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
                        {syncing ? ' Sincronizando...' : ' Sincronizar'}
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                        <Plus size={18} /> Novo Morador
                    </button>
                </div>
            </div>

            {error && (
                <div className="alert alert-warning">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError('')}><X size={14} /></button>
                </div>
            )}

            <div className="search-bar">
                <Search size={18} />
                <input
                    type="text"
                    placeholder="Buscar por nome..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
            </div>

            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Novo Morador</h2>
                            <button className="modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreate} className="modal-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Nome</label>
                                    <input required value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Sobrenome</label>
                                    <input required value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Telefone</label>
                                    <input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Email</label>
                                    <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Unidade / Bloco</label>
                                <input required value={formData.orgIndexCode} onChange={(e) => setFormData({ ...formData, orgIndexCode: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Foto para Reconh. Facial</label>
                                <input type="file" accept="image/*" onChange={handlePhotoUpload} />
                                {formData.photoBase64 && (
                                    <img src={formData.photoBase64} alt="Preview" style={{ marginTop: 10, width: '100px', borderRadius: '8px' }} />
                                )}
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                                    {formLoading ? <><Loader2 size={16} className="spin" /> Salvando...</> : 'Salvar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Telefone</th>
                            <th>Email</th>
                            <th>Unidade</th>
                            <th>Cadastro</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="table-empty"><Loader2 size={20} className="spin" /> Carregando...</td></tr>
                        ) : residents.length > 0 ? (
                            residents.map((r: any) => (
                                <tr key={r.id}>
                                    <td className="td-name">{r.firstName} {r.lastName}</td>
                                    <td>{r.phone || '—'}</td>
                                    <td>{r.email || '—'}</td>
                                    <td><span className="badge">{r.orgIndexCode}</span></td>
                                    <td>{new Date(r.createdAt).toLocaleDateString('pt-BR')}</td>
                                    <td>
                                        <button className="btn-icon btn-danger" onClick={() => handleDelete(r.id)} title="Excluir">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={6} className="table-empty">Nenhum morador encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="pagination">
                    <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
                    <span>Página {page} de {totalPages}</span>
                    <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</button>
                </div>
            )}
        </div>
    );
}
