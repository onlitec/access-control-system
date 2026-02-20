import React, { useState, useEffect } from 'react';
import { getUsers, createUser, deleteUser } from '@/services/api';
import { UserCog, Plus, Trash2, X, Loader2, AlertTriangle, Shield } from 'lucide-react';

export default function UsersPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ email: '', password: '', name: '', role: 'ADMIN' });
    const [formLoading, setFormLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await getUsers();
            setUsers(data);
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
            await createUser(formData);
            setShowForm(false);
            setFormData({ email: '', password: '', name: '', role: 'ADMIN' });
            loadUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setFormLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
        try {
            await deleteUser(id);
            loadUsers();
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1><UserCog size={24} /> Usuários do Sistema</h1>
                    <p>Gerencie os administradores do sistema</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                    <Plus size={18} /> Novo Usuário
                </button>
            </div>

            {error && (
                <div className="alert alert-warning">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                    <button onClick={() => setError('')}><X size={14} /></button>
                </div>
            )}

            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Novo Usuário</h2>
                            <button className="modal-close" onClick={() => setShowForm(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleCreate} className="modal-form">
                            <div className="form-group">
                                <label>Nome</label>
                                <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Email</label>
                                <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Senha</label>
                                <input type="password" required value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Papel</label>
                                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                                    <option value="ADMIN">Administrador</option>
                                    <option value="OPERATOR">Operador</option>
                                    <option value="VIEWER">Visualizador</option>
                                </select>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={formLoading}>
                                    {formLoading ? <><Loader2 size={16} className="spin" /> Salvando...</> : 'Criar Usuário'}
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
                            <th>Email</th>
                            <th>Papel</th>
                            <th>Cadastro</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="table-empty"><Loader2 size={20} className="spin" /> Carregando...</td></tr>
                        ) : users.length > 0 ? (
                            users.map((u: any) => (
                                <tr key={u.id}>
                                    <td className="td-name">
                                        <Shield size={14} style={{ opacity: 0.5 }} /> {u.name}
                                    </td>
                                    <td>{u.email}</td>
                                    <td><span className="badge badge-role">{u.role}</span></td>
                                    <td>{new Date(u.createdAt).toLocaleDateString('pt-BR')}</td>
                                    <td>
                                        <button className="btn-icon btn-danger" onClick={() => handleDelete(u.id)} title="Excluir">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={5} className="table-empty">Nenhum usuário cadastrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
