import React, { useState, useEffect } from 'react';
import { getVisitors } from '@/services/api';
import { UserCheck, Search, Loader2, AlertTriangle, Clock, Car } from 'lucide-react';

export default function VisitorsPage() {
    const [visitors, setVisitors] = useState<any[]>([]);
    const [count, setCount] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        loadVisitors();
    }, [page, search]);

    const loadVisitors = async () => {
        setLoading(true);
        try {
            const result = await getVisitors(page, 20, search);
            setVisitors(result.data);
            setCount(result.count);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const totalPages = Math.ceil(count / 20);

    const isActive = (v: any) => {
        const now = new Date();
        return new Date(v.visitStartTime) <= now && new Date(v.visitEndTime) >= now;
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1><UserCheck size={24} /> Visitantes</h1>
                    <p>{count} visitantes registrados</p>
                </div>
            </div>

            {error && (
                <div className="alert alert-warning">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
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

            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Documento</th>
                            <th>Placa</th>
                            <th>Entrada</th>
                            <th>Saída</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} className="table-empty"><Loader2 size={20} className="spin" /> Carregando...</td></tr>
                        ) : visitors.length > 0 ? (
                            visitors.map((v: any) => (
                                <tr key={v.id}>
                                    <td className="td-name">{v.name}</td>
                                    <td>{v.certificateNo || '—'}</td>
                                    <td>
                                        {v.plateNo ? (
                                            <span className="badge badge-outline"><Car size={12} /> {v.plateNo}</span>
                                        ) : '—'}
                                    </td>
                                    <td>
                                        <span className="td-time">
                                            <Clock size={14} />
                                            {new Date(v.visitStartTime).toLocaleString('pt-BR')}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="td-time">
                                            <Clock size={14} />
                                            {new Date(v.visitEndTime).toLocaleString('pt-BR')}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`status-pill ${isActive(v) ? 'status-active' : 'status-expired'}`}>
                                            {isActive(v) ? 'Ativo' : 'Expirado'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={6} className="table-empty">Nenhum visitante encontrado.</td></tr>
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
