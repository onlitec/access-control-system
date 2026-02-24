import React, { useState, useEffect } from 'react';
import { getFinishedProviders, HikCentralVisitor } from '@/services/api';
import { UserCheck, Clock, Phone, Building, RefreshCw } from 'lucide-react';

export default function FinishedProvidersPage() {
    const [providers, setProviders] = useState<HikCentralVisitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const loadProviders = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getFinishedProviders();
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
    }, []);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            return date.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateStr;
        }
    };

    if (loading && providers.length === 0) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Carregando prestadores finalizados...</p>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h1><UserCheck size={24} /> Prestadores Finalizados</h1>
                    <button 
                        className="btn btn-secondary" 
                        onClick={loadProviders}
                        disabled={loading}
                        style={{ padding: '0.5rem' }}
                    >
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    </button>
                </div>
                <p>Histórico de prestadores de serviços que já encerraram suas visitas</p>
                {lastUpdate && (
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                        Última atualização: {lastUpdate.toLocaleTimeString('pt-BR')}
                    </p>
                )}
            </div>

            {error && (
                <div className="alert alert-warning">
                    {error}
                </div>
            )}

            {providers.length === 0 ? (
                <div className="empty-state">
                    <UserCheck size={48} />
                    <h3>Nenhum prestador finalizado</h3>
                    <p>Não há registros de prestadores que encerraram suas visitas recentemente.</p>
                </div>
            ) : (
                <div className="table-container">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Grupo</th>
                                <th>Telefone</th>
                                <th>Entrada</th>
                                <th>Saída</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {providers.map((provider) => (
                                <tr key={provider.id}>
                                    <td className="font-medium">{provider.visitor_name}</td>
                                    <td>{provider.visitor_group_name}</td>
                                    <td>{provider.phone_num || '-'}</td>
                                    <td>{formatDate(provider.appoint_start_time)}</td>
                                    <td>{formatDate(provider.appoint_end_time)}</td>
                                    <td>
                                        <span className="status-badge status-finished">
                                            {provider.appoint_status_text}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
