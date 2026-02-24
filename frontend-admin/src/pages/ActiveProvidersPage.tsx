import React, { useState, useEffect } from 'react';
import { getActiveProviders, HikCentralVisitor } from '@/services/api';
import { UserCheck, Clock, Phone, Building, RefreshCw } from 'lucide-react';

export default function ActiveProvidersPage() {
    const [providers, setProviders] = useState<HikCentralVisitor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const loadProviders = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getActiveProviders();
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
        // Auto-refresh a cada 30 segundos
        const interval = setInterval(loadProviders, 30000);
        return () => clearInterval(interval);
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
                <p>Carregando prestadores em atividade...</p>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h1><UserCheck size={24} /> Prestadores em Atividade</h1>
                    <button 
                        className="btn btn-secondary" 
                        onClick={loadProviders}
                        disabled={loading}
                        style={{ padding: '0.5rem' }}
                    >
                        <RefreshCw size={16} className={loading ? 'spin' : ''} />
                    </button>
                </div>
                <p>Prestadores de serviços atualmente no condomínio</p>
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
                    <h3>Nenhum prestador em atividade</h3>
                    <p>Não há prestadores de serviços no condomínio neste momento.</p>
                </div>
            ) : (
                <div className="providers-grid">
                    {providers.map((provider) => (
                        <div key={provider.id} className="provider-card active">
                            <div className="provider-header">
                                <div className="provider-avatar">
                                    {provider.visitor_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="provider-info">
                                    <h3>{provider.visitor_name}</h3>
                                    <span className="status-badge status-active">
                                        {provider.appoint_status_text}
                                    </span>
                                </div>
                            </div>
                            <div className="provider-details">
                                <div className="detail-row">
                                    <Building size={16} />
                                    <span>{provider.visitor_group_name}</span>
                                </div>
                                {provider.phone_num && (
                                    <div className="detail-row">
                                        <Phone size={16} />
                                        <span>{provider.phone_num}</span>
                                    </div>
                                )}
                                <div className="detail-row">
                                    <Clock size={16} />
                                    <span>Entrada: {formatDate(provider.appoint_start_time)}</span>
                                </div>
                                <div className="detail-row">
                                    <Clock size={16} />
                                    <span>Previsão saída: {formatDate(provider.appoint_end_time)}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
