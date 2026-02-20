import React, { useEffect, useState } from 'react';
import { exportSessionAuditCsv, getSecurityMetrics, getSecurityMetricsHistory, getSessionAudit, getSessionAuditExportMeta } from '@/services/api';
import { ShieldAlert, Filter, Loader2, AlertTriangle, RefreshCw, Download, CheckCircle2, XCircle, KeyRound, ArrowUpDown } from 'lucide-react';
import { buildActiveFilterChips, getNextSortOrder, toDatetimeLocal, type FilterState, type SortBy, type SortOrder } from './sessionAuditUtils';

const EVENT_TYPES = [
    'login',
    'refresh',
    'logout',
    'logout_all',
    'list_sessions',
    'revoke_session',
];

export default function SessionAuditPage() {
    const [rows, setRows] = useState<any[]>([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState<number | null>(null);
    const [exportMessage, setExportMessage] = useState('');
    const [exportLimit, setExportLimit] = useState(5000);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [sortBy, setSortBy] = useState<SortBy>('createdAt');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [filters, setFilters] = useState<FilterState>({
        userEmail: '',
        eventType: '',
        success: '',
        start: '',
        end: '',
        ipAddress: '',
        sessionId: '',
    });
    const [summary, setSummary] = useState({
        total: 0,
        success: 0,
        failure: 0,
        loginFailure: 0,
    });
    const [metrics, setMetrics] = useState<null | {
        generatedAt: string;
        topN: number;
        window: { hours: number; start: string; end: string };
        login: { attempts: number; failedAttempts: number; failureRate: number };
        topIpAttempts: Array<{ ipAddress: string | null; attempts: number; failedAttempts: number; failureRate: number }>;
        topUserAttempts: Array<{ userEmail: string | null; attempts: number; failedAttempts: number; failureRate: number }>;
    }>(null);
    const [metricsHistory, setMetricsHistory] = useState<Array<{
        id: string;
        generatedAt: string;
        login: { attempts: number; failedAttempts: number; failureRate: number };
    }>>([]);

    useEffect(() => {
        loadAudit();
    }, [page, limit, sortBy, sortOrder]);

    useEffect(() => {
        loadMetrics();
    }, []);

    const toApiFilters = (effectiveFilters: FilterState) => ({
        userEmail: effectiveFilters.userEmail || undefined,
        eventType: effectiveFilters.eventType || undefined,
        success: (effectiveFilters.success as 'true' | 'false' | '') || undefined,
        startTime: effectiveFilters.start ? new Date(effectiveFilters.start).toISOString() : undefined,
        endTime: effectiveFilters.end ? new Date(effectiveFilters.end).toISOString() : undefined,
        ipAddress: effectiveFilters.ipAddress || undefined,
        sessionId: effectiveFilters.sessionId || undefined,
    });

    const loadMetrics = async () => {
        try {
            const [result, history] = await Promise.all([
                getSecurityMetrics(24, 5),
                getSecurityMetricsHistory({ limit: 24, windowHours: 24 }),
            ]);
            setMetrics(result);
            setMetricsHistory(history.data || []);
        } catch {
            // Metrics are complementary; keep page usable even if this fails.
        }
    };

    const loadAudit = async (
        nextFilters?: FilterState,
        nextPage?: number,
        nextLimit?: number,
        nextSortBy?: SortBy,
        nextSortOrder?: SortOrder,
    ) => {
        const effectiveFilters = nextFilters || filters;
        const effectivePage = nextPage ?? page;
        const effectiveLimit = nextLimit ?? limit;
        const effectiveSortBy = nextSortBy ?? sortBy;
        const effectiveSortOrder = nextSortOrder ?? sortOrder;

        setLoading(true);
        setError('');
        try {
            const result = await getSessionAudit({
                page: effectivePage,
                limit: effectiveLimit,
                sortBy: effectiveSortBy,
                sortOrder: effectiveSortOrder,
                ...toApiFilters(effectiveFilters),
            });
            setRows(result.data || []);
            setCount(result.count || 0);
            setSummary({
                total: result.summary?.total ?? result.count ?? 0,
                success: result.summary?.success ?? 0,
                failure: result.summary?.failure ?? 0,
                loginFailure: result.summary?.loginFailure ?? 0,
            });
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar auditoria');
        } finally {
            setLoading(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(count / limit));

    const applyFilters = (nextFilters: FilterState) => {
        setFilters(nextFilters);
        if (page !== 1) {
            setPage(1);
            return;
        }
        loadAudit(nextFilters, 1);
    };

    const applyPreset = (preset: '1h' | '12h' | '24h' | '7d' | '30d' | 'login_failures' | 'clear') => {
        const now = new Date();
        if (preset === '1h') {
            const start = new Date(now.getTime() - 1 * 60 * 60 * 1000);
            applyFilters({ ...filters, start: toDatetimeLocal(start), end: toDatetimeLocal(now) });
            return;
        }
        if (preset === '12h') {
            const start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
            applyFilters({ ...filters, start: toDatetimeLocal(start), end: toDatetimeLocal(now) });
            return;
        }
        if (preset === '24h') {
            const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            applyFilters({ ...filters, start: toDatetimeLocal(start), end: toDatetimeLocal(now) });
            return;
        }
        if (preset === '7d') {
            const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            applyFilters({ ...filters, start: toDatetimeLocal(start), end: toDatetimeLocal(now) });
            return;
        }
        if (preset === '30d') {
            const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            applyFilters({ ...filters, start: toDatetimeLocal(start), end: toDatetimeLocal(now) });
            return;
        }
        if (preset === 'login_failures') {
            applyFilters({ ...filters, eventType: 'login', success: 'false' });
            return;
        }
        applyFilters({
            userEmail: '',
            eventType: '',
            success: '',
            start: '',
            end: '',
            ipAddress: '',
            sessionId: '',
        });
    };

    const toggleSort = (column: SortBy) => {
        const nextSortOrder = getNextSortOrder(sortBy, sortOrder, column);
        setSortBy(column);
        setSortOrder(nextSortOrder);
        setPage(1);
    };

    const sortLabel = (column: SortBy) => {
        if (sortBy !== column) return <ArrowUpDown size={13} />;
        return sortOrder === 'asc' ? '▲' : '▼';
    };

    const handleExport = async () => {
        setExporting(true);
        setExportProgress(0);
        setExportMessage('Preparando exportação...');
        setError('');
        try {
            const exportFilters = {
                ...toApiFilters(filters),
                limit: exportLimit,
                sortBy,
                sortOrder,
            };
            const meta = await getSessionAuditExportMeta(exportFilters);
            setExportMessage(
                meta.truncated
                    ? `Exportando ${meta.effectiveLimit} de ${meta.count} registros (limite aplicado).`
                    : `Exportando ${meta.count} registros.`,
            );

            const blob = await exportSessionAuditCsv(exportFilters, {
                onProgress: (progress) => {
                    if (typeof progress.percent === 'number') {
                        setExportProgress(progress.percent);
                    }
                },
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `session-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setExportMessage('Exportação concluída.');
            setExportProgress(100);
        } catch (err: any) {
            setError(err.message || 'Falha ao exportar CSV');
            setExportMessage('Falha na exportação.');
        } finally {
            setExporting(false);
        }
    };

    const activeFilterChips = buildActiveFilterChips(filters);

    const removeFilterChip = (key: keyof FilterState) => {
        const nextFilters = { ...filters, [key]: '' };
        applyFilters(nextFilters);
    };

    return (
        <div className="page" data-testid="session-audit-page">
            <div className="page-header">
                <div>
                    <h1><ShieldAlert size={24} /> Auditoria de Sessão</h1>
                    <p>{count} eventos encontrados</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                        data-testid="export-limit-input"
                        type="number"
                        min={1}
                        max={20000}
                        value={exportLimit}
                        onChange={(e) => setExportLimit(Math.max(1, Number(e.target.value) || 1))}
                        style={{ width: 120 }}
                    />
                    <button data-testid="export-csv-button" className="btn btn-ghost" onClick={handleExport} disabled={exporting}>
                        {exporting ? <Loader2 size={18} className="spin" /> : <Download size={18} />} Exportar CSV
                    </button>
                    <button data-testid="refresh-audit-button" className="btn btn-primary" onClick={() => { loadAudit(); void loadMetrics(); }}>
                        <RefreshCw size={18} /> Atualizar
                    </button>
                </div>
            </div>

            {exportMessage && (
                <div className="alert" data-testid="export-feedback" style={{ marginBottom: '12px' }}>
                    <span>{exportMessage}</span>
                </div>
            )}
            {exportProgress !== null && (
                <div className="export-progress" data-testid="export-progress">
                    <div className="export-progress-bar" style={{ width: `${Math.max(0, Math.min(100, exportProgress))}%` }} />
                    <span>{exportProgress}%</span>
                </div>
            )}

            {error && (
                <div className="alert alert-warning">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                </div>
            )}

            <div className="stats-grid">
                <div className="stat-card stat-blue">
                    <div className="stat-icon"><ShieldAlert size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{summary.total}</span>
                        <span className="stat-label">Total no filtro</span>
                    </div>
                </div>
                <div className="stat-card stat-green">
                    <div className="stat-icon"><CheckCircle2 size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{summary.success}</span>
                        <span className="stat-label">Sucesso</span>
                    </div>
                </div>
                <div className="stat-card stat-red">
                    <div className="stat-icon"><XCircle size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{summary.failure}</span>
                        <span className="stat-label">Falha</span>
                    </div>
                </div>
                <div className="stat-card stat-amber">
                    <div className="stat-icon"><KeyRound size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{summary.loginFailure}</span>
                        <span className="stat-label">Falhas de login</span>
                    </div>
                </div>
            </div>

            {metrics && (
                <div className="stats-grid" style={{ marginTop: '-16px' }} data-testid="security-metrics-block">
                    <div className="stat-card stat-red">
                        <div className="stat-icon"><ShieldAlert size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{metrics.login.failureRate}%</span>
                            <span className="stat-label">Taxa de falha de login ({metrics.window.hours}h)</span>
                        </div>
                    </div>
                    <div className="stat-card stat-blue">
                        <div className="stat-icon"><KeyRound size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{metrics.login.attempts}</span>
                            <span className="stat-label">Tentativas de login ({metrics.window.hours}h)</span>
                        </div>
                    </div>
                    <div className="stat-card stat-amber">
                        <div className="stat-icon"><XCircle size={24} /></div>
                        <div className="stat-info">
                            <span className="stat-value">{metrics.login.failedAttempts}</span>
                            <span className="stat-label">Falhas de login ({metrics.window.hours}h)</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
                <Filter size={18} />
                <div className="form-group inline">
                    <label>Email:</label>
                    <input
                        type="text"
                        placeholder="usuario@dominio.com"
                        value={filters.userEmail}
                        onChange={(e) => setFilters({ ...filters, userEmail: e.target.value })}
                    />
                </div>
                <div className="form-group inline">
                    <label>Evento:</label>
                    <select
                        value={filters.eventType}
                        onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}
                    >
                        <option value="">Todos</option>
                        {EVENT_TYPES.map((ev) => (
                            <option key={ev} value={ev}>{ev}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group inline">
                    <label>Sucesso:</label>
                    <select
                        value={filters.success}
                        onChange={(e) => setFilters({ ...filters, success: e.target.value })}
                    >
                        <option value="">Todos</option>
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                    </select>
                </div>
                <div className="form-group inline">
                    <label>IP:</label>
                    <input
                        type="text"
                        placeholder="192.168.0.1"
                        value={filters.ipAddress}
                        onChange={(e) => setFilters({ ...filters, ipAddress: e.target.value })}
                    />
                </div>
                <div className="form-group inline">
                    <label>Sessão:</label>
                    <input
                        type="text"
                        placeholder="session-id"
                        value={filters.sessionId}
                        onChange={(e) => setFilters({ ...filters, sessionId: e.target.value })}
                    />
                </div>
                <div className="form-group inline">
                    <label>De:</label>
                    <input
                        type="datetime-local"
                        value={filters.start}
                        onChange={(e) => setFilters({ ...filters, start: e.target.value })}
                    />
                </div>
                <div className="form-group inline">
                    <label>Até:</label>
                    <input
                        type="datetime-local"
                        value={filters.end}
                        onChange={(e) => setFilters({ ...filters, end: e.target.value })}
                    />
                </div>
                <button data-testid="apply-filter-button" className="btn btn-ghost" onClick={() => applyFilters(filters)}>
                    Filtrar
                </button>
                <button data-testid="preset-1h" className="btn btn-ghost" onClick={() => applyPreset('1h')}>Última 1h</button>
                <button data-testid="preset-12h" className="btn btn-ghost" onClick={() => applyPreset('12h')}>Últimas 12h</button>
                <button data-testid="preset-30d" className="btn btn-ghost" onClick={() => applyPreset('30d')}>Últimos 30 dias</button>
                <button className="btn btn-ghost" onClick={() => applyPreset('24h')}>Últimas 24h</button>
                <button className="btn btn-ghost" onClick={() => applyPreset('7d')}>Últimos 7 dias</button>
                <button data-testid="preset-login-failures" className="btn btn-ghost" onClick={() => applyPreset('login_failures')}>Falhas de Login</button>
                <button data-testid="clear-filters" className="btn btn-ghost" onClick={() => applyPreset('clear')}>Limpar</button>
            </div>

            {activeFilterChips.length > 0 && (
                <div className="active-filter-chips" data-testid="active-filter-chips">
                    {activeFilterChips.map((chip) => (
                        <button
                            key={chip.key}
                            className="active-filter-chip"
                            onClick={() => removeFilterChip(chip.key)}
                            title="Remover filtro"
                        >
                            <span>{chip.label}</span>
                            <span className="chip-remove">x</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="data-table-wrapper" data-testid="audit-table-wrapper">
                <table className="data-table" data-testid="audit-table">
                    <thead>
                        <tr>
                            <th className="sortable-header" onClick={() => toggleSort('createdAt')} data-testid="sort-createdAt">Data/Hora {sortLabel('createdAt')}</th>
                            <th className="sortable-header" onClick={() => toggleSort('eventType')} data-testid="sort-eventType">Evento {sortLabel('eventType')}</th>
                            <th className="sortable-header" onClick={() => toggleSort('success')} data-testid="sort-success">Sucesso {sortLabel('success')}</th>
                            <th className="sortable-header" onClick={() => toggleSort('userEmail')} data-testid="sort-userEmail">Usuário {sortLabel('userEmail')}</th>
                            <th>Sessão</th>
                            <th className="sortable-header" onClick={() => toggleSort('ipAddress')} data-testid="sort-ipAddress">IP {sortLabel('ipAddress')}</th>
                            <th>Detalhes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} className="table-empty"><Loader2 size={20} className="spin" /> Carregando...</td></tr>
                        ) : rows.length > 0 ? (
                            rows.map((row) => (
                                <tr key={row.id}>
                                    <td>{new Date(row.createdAt).toLocaleString('pt-BR')}</td>
                                    <td><span className="badge badge-event">{row.eventType}</span></td>
                                    <td>
                                        <span className={`badge ${row.success ? 'badge-success' : 'badge-danger'}`}>
                                            {row.success ? 'Sim' : 'Não'}
                                        </span>
                                    </td>
                                    <td>{row.userEmail || '—'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.sessionId || '—'}</td>
                                    <td>{row.ipAddress || '—'}</td>
                                    <td>{row.details || '—'}</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={7} className="table-empty">Nenhum evento encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {metrics && (
                <div className="metrics-tables" data-testid="metrics-tables">
                    <div className="data-table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Top IP</th>
                                    <th>Tentativas</th>
                                    <th>Falhas</th>
                                    <th>Taxa</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.topIpAttempts.length ? metrics.topIpAttempts.map((item) => (
                                    <tr key={item.ipAddress || 'ip-empty'}>
                                        <td>{item.ipAddress || '—'}</td>
                                        <td>{item.attempts}</td>
                                        <td>{item.failedAttempts}</td>
                                        <td>{item.failureRate}%</td>
                                    </tr>
                                )) : <tr><td colSpan={4} className="table-empty">Sem dados</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <div className="data-table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Top Usuário</th>
                                    <th>Tentativas</th>
                                    <th>Falhas</th>
                                    <th>Taxa</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.topUserAttempts.length ? metrics.topUserAttempts.map((item) => (
                                    <tr key={item.userEmail || 'user-empty'}>
                                        <td>{item.userEmail || '—'}</td>
                                        <td>{item.attempts}</td>
                                        <td>{item.failedAttempts}</td>
                                        <td>{item.failureRate}%</td>
                                    </tr>
                                )) : <tr><td colSpan={4} className="table-empty">Sem dados</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <div className="data-table-wrapper" data-testid="metrics-history-table">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Snapshot</th>
                                    <th>Tentativas</th>
                                    <th>Falhas</th>
                                    <th>Taxa</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metricsHistory.length ? metricsHistory.map((item) => (
                                    <tr key={item.id}>
                                        <td>{new Date(item.generatedAt).toLocaleString('pt-BR')}</td>
                                        <td>{item.login.attempts}</td>
                                        <td>{item.login.failedAttempts}</td>
                                        <td>{item.login.failureRate}%</td>
                                    </tr>
                                )) : <tr><td colSpan={4} className="table-empty">Sem snapshots</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="pagination">
                <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Anterior
                </button>
                <span>Página {page} de {totalPages}</span>
                <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Próxima
                </button>
                <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                </select>
            </div>
        </div>
    );
}
