import React, { useState, useEffect } from 'react';
import { getAllProviders, HikCentralVisitor } from '@/services/api';
import { Briefcase, Search, Loader2, AlertTriangle, Clock, Car, RefreshCw, Phone, FileText } from 'lucide-react';

const STATUS_LABELS: Record<number, { label: string; cls: string }> = {
    0: { label: 'Agendado', cls: 'status-scheduled' },
    1: { label: 'Finalizado', cls: 'status-finished' },
    2: { label: 'Em Atividade', cls: 'status-active' },
    4: { label: 'Expirado', cls: 'status-expired' },
};

export default function ProvidersPage() {
    const [providers, setProviders] = useState<HikCentralVisitor[]>([]);
    const [filtered, setFiltered] = useState<HikCentralVisitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const loadProviders = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getAllProviders();
            setProviders(result.data || []);
            setLastUpdate(new Date());
        } catch (err: any) {
            setError(err.message || 'Erro ao carregar prestadores');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProviders();
        // Auto-refresh a cada 60 segundos
        const interval = setInterval(loadProviders, 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let data = providers;
        if (filterStatus !== 'all') {
            data = data.filter(v => v.appoint_status === Number(filterStatus));
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            data = data.filter(v =>
                v.visitor_name.toLowerCase().includes(q) ||
                v.phone_num?.toLowerCase().includes(q) ||
                v.certificate_no?.toLowerCase().includes(q)
            );
        }
        setFiltered(data);
    }, [providers, search, filterStatus]);

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '—';
        try {
            return new Date(dateStr).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch { return dateStr; }
    };

    const statusInfo = (status: number) => STATUS_LABELS[status] || { label: 'Desconhecido', cls: '' };
    const countByStatus = (s: number) => providers.filter(v => v.appoint_status === s).length;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1><Briefcase size={24} /> Prestadores</h1>
                    <p>
                        {providers.length} prestadores cadastrados no grupo <strong>PRESTADORES</strong> (módulo visitantes)
                        {lastUpdate && <span className="text-muted" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                            · Atualizado às {lastUpdate.toLocaleTimeString('pt-BR')}
                        </span>}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        Prestadores de serviços cadastrados pelos moradores para visitas temporárias
                    </p>
                </div>
                <button className="btn btn-ghost" onClick={loadProviders} disabled={loading}>
                    {loading ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
                    {loading ? ' Carregando...' : ' Atualizar'}
                </button>
            </div>

            {/* Resumo por status */}
            <div className="stats-strip">
                <div className="stat-chip stat-chip-green">
                    <span className="stat-chip-value">{countByStatus(2)}</span>
                    <span className="stat-chip-label">Em Atividade</span>
                </div>
                <div className="stat-chip stat-chip-blue">
                    <span className="stat-chip-value">{countByStatus(0)}</span>
                    <span className="stat-chip-label">Agendados</span>
                </div>
                <div className="stat-chip stat-chip-gray">
                    <span className="stat-chip-value">{countByStatus(1)}</span>
                    <span className="stat-chip-label">Finalizados</span>
                </div>
                <div className="stat-chip stat-chip-red">
                    <span className="stat-chip-value">{countByStatus(4)}</span>
                    <span className="stat-chip-label">Expirados</span>
                </div>
            </div>

            {error && (
                <div className="alert alert-warning">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {/* Filtros */}
            <div className="filter-row">
                <div className="search-bar" style={{ flex: 1 }}>
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por nome, telefone ou documento..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select
                    className="form-select"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                >
                    <option value="all">Todos os Status</option>
                    <option value="2">Em Atividade</option>
                    <option value="0">Agendados</option>
                    <option value="1">Finalizados</option>
                    <option value="4">Expirados</option>
                </select>
            </div>

            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Status</th>
                            <th>Documento</th>
                            <th>Telefone</th>
                            <th>Placa</th>
                            <th>Entrada</th>
                            <th>Saída Prevista</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} className="table-empty"><Loader2 size={20} className="spin" /> Carregando...</td></tr>
                        ) : filtered.length > 0 ? (
                            filtered.map((v) => {
                                const st = statusInfo(v.appoint_status);
                                return (
                                    <tr key={v.id}>
                                        <td className="td-name">{v.visitor_name || '—'}</td>
                                        <td>
                                            <span className={`status-pill ${st.cls}`}>{st.label}</span>
                                        </td>
                                        <td>
                                            {v.certificate_no ? (
                                                <span className="td-doc">
                                                    <FileText size={13} /> {v.certificate_no}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            {v.phone_num ? (
                                                <span className="td-doc">
                                                    <Phone size={13} /> {v.phone_num}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            {v.plate_no ? (
                                                <span className="badge badge-outline"><Car size={12} /> {v.plate_no}</span>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            <span className="td-time">
                                                <Clock size={13} />
                                                {formatDate(v.appoint_start_time)}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="td-time">
                                                <Clock size={13} />
                                                {formatDate(v.appoint_end_time)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr><td colSpan={7} className="table-empty">Nenhum prestador encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                Exibindo {filtered.length} de {providers.length} prestadores
            </p>
        </div>
    );
}
