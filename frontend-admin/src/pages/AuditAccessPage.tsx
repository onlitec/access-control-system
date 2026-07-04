import React, { useState, useEffect } from 'react';
import {
    getAccessAudit,
    exportAccessAuditCSV,
    AccessEvent,
} from '@/services/api';
import {
    ClipboardList,
    RefreshCw,
    AlertTriangle,
    Search,
    Download,
    ChevronDown,
    ChevronUp,
    CheckCircle,
    XCircle,
    Clock,
    FileSpreadsheet,
    User,
} from 'lucide-react';

export default function AuditAccessPage() {
    // Default: last 7 days
    const defaultFrom = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
    const defaultTo = new Date().toISOString().split('T')[0];

    const [events, setEvents] = useState<AccessEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Filters
    const [from, setFrom] = useState(defaultFrom);
    const [to, setTo] = useState(defaultTo);
    const [search, setSearch] = useState('');
    const [type, setType] = useState('Todos');
    const [status, setStatus] = useState('Todos');
    const [currentPage, setCurrentPage] = useState(1);

    // Expandable rows
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

    const mockEvents: AccessEvent[] = [
        {
            id: 'mock-1',
            occurredAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
            personName: 'Carlos Souza (Simulado)',
            personType: 'resident',
            personId: 'p-1',
            unit: 'Torre A, Apto 102',
            operatorId: 'Porteiro Principal',
            deviceName: 'Portão Principal Pedestres',
            status: 'authorized',
            photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150&q=80',
            notes: 'Acesso normal via reconhecimento facial.',
            createdAt: new Date().toISOString(),
        },
        {
            id: 'mock-2',
            occurredAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
            personName: 'Ana Lima (Simulado)',
            personType: 'visitor',
            personId: 'v-2',
            unit: 'Torre B, Apto 304',
            operatorId: 'Portaria 24h',
            deviceName: 'Guarita Recepção',
            status: 'pending',
            photoUrl: null,
            notes: 'Aguardando liberação do morador.',
            createdAt: new Date().toISOString(),
        },
        {
            id: 'mock-3',
            occurredAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
            personName: 'Roberto Construções (Simulado)',
            personType: 'provider_resident',
            personId: 'pr-3',
            unit: 'Torre A, Apto 501',
            operatorId: 'Totem Autoatendimento',
            deviceName: 'Acesso de Serviço',
            status: 'denied',
            photoUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&h=150&q=80',
            notes: 'Documentação do prestador de serviço expirada no sistema.',
            createdAt: new Date().toISOString(),
        },
    ];

    const loadData = async (page = currentPage) => {
        setLoading(true);
        try {
            const filters = {
                from: from || undefined,
                to: to || undefined,
                search: search.trim() || undefined,
                type: type !== 'Todos' ? type : undefined,
                status: status !== 'Todos' ? status : undefined,
                page,
                limit: 25,
            };
            const response = await getAccessAudit(filters);
            setEvents(response.items || []);
            setTotal(response.total || 0);
            setIsDemoMode(false);
        } catch (err) {
            console.warn('Access audit API failed, using mock data:', err);
            setEvents(mockEvents);
            setTotal(mockEvents.length);
            setIsDemoMode(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(currentPage);
    }, [currentPage, from, to, type, status]);

    const handleSearchClick = () => {
        setCurrentPage(1);
        loadData(1);
    };

    const handleExport = async () => {
        setActionLoading(true);
        try {
            const filters = {
                from: from || undefined,
                to: to || undefined,
                search: search.trim() || undefined,
                type: type !== 'Todos' ? type : undefined,
                status: status !== 'Todos' ? status : undefined,
            };
            if (isDemoMode) {
                // Mock export alert
                alert('Modo demonstração: Download do arquivo acessos-export.csv simulado com sucesso!');
            } else {
                await exportAccessAuditCSV(filters);
            }
        } catch (err: any) {
            alert(`Erro ao exportar arquivo: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const toggleRow = (id: string) => {
        setExpandedRowId(expandedRowId === id ? null : id);
    };

    const getPersonTypeLabel = (pType: string) => {
        switch (pType) {
            case 'resident':
                return 'Morador';
            case 'visitor':
                return 'Visitante';
            case 'provider_condo':
                return 'Prestador (condomínio)';
            case 'provider_resident':
                return 'Prestador (morador)';
            default:
                return pType;
        }
    };

    const getStatusLabel = (st: string) => {
        switch (st) {
            case 'authorized':
                return 'Autorizado';
            case 'denied':
                return 'Negado';
            case 'pending':
                return 'Pendente';
            default:
                return st;
        }
    };

    const totalPages = Math.ceil(total / 25) || 1;

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1><ClipboardList size={24} /> Logs de Acesso</h1>
                    <p>Histórico e auditoria de entrada e saída de pessoas nas portarias</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-secondary" onClick={() => loadData(currentPage)} disabled={loading}>
                        <RefreshCw size={16} /> Atualizar
                    </button>
                    <button className="btn btn-primary" onClick={handleExport} disabled={actionLoading || events.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Download size={16} />
                        {actionLoading ? 'Exportando...' : 'Exportar CSV'}
                    </button>
                </div>
            </div>

            {/* Banner Mode Demo */}
            {isDemoMode && (
                <div className="alert alert-warning" style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid var(--amber-500)', color: 'var(--amber-400)', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', borderRadius: 'var(--radius)' }}>
                    <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                    <div>
                        <strong>Modo demonstração — dados simulados</strong>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(245, 158, 11, 0.8)' }}>
                            Não foi possível conectar-se ao backend. Exibindo dados simulados.
                        </p>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div className="settings-card" style={{ marginBottom: '20px', padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Data inicial</label>
                        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Data final</label>
                        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Nome da pessoa</label>
                        <div style={{ position: 'relative' }}>
                            <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ padding: '8px 12px 8px 36px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', width: '100%' }} />
                            <Search size={16} className="text-muted" style={{ position: 'absolute', left: '12px', top: '10px' }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Tipo de pessoa</label>
                        <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
                            <option value="Todos">Todos os tipos</option>
                            <option value="Morador">Morador</option>
                            <option value="Visitante">Visitante</option>
                            <option value="Prestador (condomínio)">Prestador (condomínio)</option>
                            <option value="Prestador (morador)">Prestador (morador)</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label className="text-muted" style={{ fontSize: '0.8rem' }}>Status do acesso</label>
                        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
                            <option value="Todos">Todos os status</option>
                            <option value="Autorizado">Autorizado</option>
                            <option value="Negado">Negado</option>
                            <option value="Pendente">Pendente</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={handleSearchClick} style={{ width: '100%', padding: '10px 0' }}>Filtrar</button>
                    </div>
                </div>
            </div>

            {/* Table list */}
            <div className="settings-card" style={{ margin: 0 }}>
                <div className="data-table-wrapper" style={{ border: 'none', background: 'transparent' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}></th>
                                <th>Data / Hora</th>
                                <th>Nome</th>
                                <th>Tipo</th>
                                <th>Unidade</th>
                                <th>Porteiro/Operador</th>
                                <th>Dispositivo</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {events.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        Nenhum evento de acesso encontrado para os filtros selecionados.
                                    </td>
                                </tr>
                            ) : (
                                events.map((event) => {
                                    const isExpanded = expandedRowId === event.id;
                                    return (
                                        <React.Fragment key={event.id}>
                                            <tr onClick={() => toggleRow(event.id)} style={{ cursor: 'pointer' }}>
                                                <td>{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                                                <td style={{ fontWeight: 500 }}>
                                                    {new Date(event.occurredAt).toLocaleString('pt-BR')}
                                                </td>
                                                <td style={{ fontWeight: 600 }}>{event.personName}</td>
                                                <td>
                                                    <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
                                                        {getPersonTypeLabel(event.personType)}
                                                    </span>
                                                </td>
                                                <td>{event.unit || '—'}</td>
                                                <td style={{ fontSize: '0.85rem' }}>{event.operatorId || '—'}</td>
                                                <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{event.deviceName || '—'}</td>
                                                <td>
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '2px 8px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        borderRadius: '4px',
                                                        background: event.status === 'authorized' ? 'rgba(34, 197, 94, 0.15)' : event.status === 'pending' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                        color: event.status === 'authorized' ? 'var(--green-400)' : event.status === 'pending' ? 'var(--amber-400)' : 'var(--red-400)',
                                                        border: `1px solid ${event.status === 'authorized' ? 'rgba(34, 197, 94, 0.3)' : event.status === 'pending' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                                    }}>
                                                        {event.status === 'authorized' && <CheckCircle size={12} />}
                                                        {event.status === 'pending' && <Clock size={12} />}
                                                        {event.status === 'denied' && <XCircle size={12} />}
                                                        {getStatusLabel(event.status)}
                                                    </span>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                                                    <td colSpan={8} style={{ padding: '20px 24px' }}>
                                                        <div style={{ display: 'flex', gap: '25px', flexWrap: 'wrap' }}>
                                                            
                                                            {/* Access Photo */}
                                                            <div style={{ width: '150px', height: '150px', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                                                                {event.photoUrl ? (
                                                                    <img src={event.photoUrl} alt="Foto capturada" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                ) : (
                                                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                                                                        <User size={36} style={{ margin: '0 auto 8px' }} />
                                                                        <span style={{ fontSize: '0.75rem' }}>Sem foto</span>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Additional details */}
                                                            <div style={{ flex: 1, minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                <div>
                                                                    <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observações / Detalhes de Liberação</span>
                                                                    <p style={{ margin: '5px 0 0', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: '1.5' }}>
                                                                        {event.notes || 'Nenhuma observação registrada para este evento.'}
                                                                    </p>
                                                                </div>

                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '5px' }}>
                                                                    <div>
                                                                        <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', textTransform: 'uppercase' }}>ID da Pessoa</span>
                                                                        <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{event.personId || 'Não registrado'}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', textTransform: 'uppercase' }}>Identificação Interna</span>
                                                                        <span style={{ fontSize: '0.85rem' }}>{event.id}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderTop: '1px solid var(--border-primary)' }}>
                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                            Mostrando <strong>{events.length}</strong> de {total} acessos registrados
                        </span>
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)}>
                                Anterior
                            </button>
                            <span style={{ display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: '0.85rem' }}>
                                {currentPage} / {totalPages}
                            </span>
                            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85rem' }} disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)}>
                                Próxima
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
