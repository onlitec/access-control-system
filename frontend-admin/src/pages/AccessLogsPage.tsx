import React, { useState, useEffect } from 'react';
import { getAccessLogs } from '@/services/api';
import { ClipboardList, Search, Loader2, AlertTriangle, RefreshCw, Filter } from 'lucide-react';

export default function AccessLogsPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [source, setSource] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 86400000).toISOString().slice(0, 16),
        end: new Date().toISOString().slice(0, 16),
    });

    useEffect(() => {
        loadLogs();
    }, [page]);

    const loadLogs = async () => {
        setLoading(true);
        setError('');
        try {
            const result = await getAccessLogs(
                new Date(dateRange.start).toISOString(),
                new Date(dateRange.end).toISOString(),
                page,
                50
            );
            setLogs(result.data || []);
            setTotal(result.total || 0);
            setSource(result.source || 'unknown');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const eventTypeLabel = (type: string) => {
        const map: Record<string, string> = {
            'ACCESS': 'Acesso',
            'VISIT': 'Visita',
            '196893': 'Acesso Facial',
            '196608': 'Cartão',
        };
        return map[type] || type;
    };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1><ClipboardList size={24} /> Logs de Acesso</h1>
                    <p>{total} eventos encontrados {source && <span className="badge badge-sm">Fonte: {source}</span>}</p>
                </div>
                <button className="btn btn-primary" onClick={loadLogs}>
                    <RefreshCw size={18} /> Atualizar
                </button>
            </div>

            {error && (
                <div className="alert alert-warning">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                </div>
            )}

            <div className="filter-bar">
                <Filter size={18} />
                <div className="form-group inline">
                    <label>De:</label>
                    <input
                        type="datetime-local"
                        value={dateRange.start}
                        onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                    />
                </div>
                <div className="form-group inline">
                    <label>Até:</label>
                    <input
                        type="datetime-local"
                        value={dateRange.end}
                        onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                    />
                </div>
                <button className="btn btn-ghost" onClick={() => { setPage(1); loadLogs(); }}>Filtrar</button>
            </div>

            <div className="data-table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Pessoa</th>
                            <th>Horário</th>
                            <th>Dispositivo</th>
                            <th>Porta</th>
                            <th>Tipo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} className="table-empty"><Loader2 size={20} className="spin" /> Carregando...</td></tr>
                        ) : logs.length > 0 ? (
                            logs.map((log: any, idx: number) => (
                                <tr key={log.id || idx}>
                                    <td className="td-name">{log.personName || 'Desconhecido'}</td>
                                    <td>{new Date(log.eventTime || log.happenTime).toLocaleString('pt-BR')}</td>
                                    <td>{log.deviceName || log.srcName || 'N/A'}</td>
                                    <td>{log.doorName || '—'}</td>
                                    <td>
                                        <span className="badge badge-event">
                                            {eventTypeLabel(log.eventType?.toString() || '')}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={5} className="table-empty">Nenhum evento encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
