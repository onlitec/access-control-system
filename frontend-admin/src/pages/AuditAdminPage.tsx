import React, { useState, useEffect } from 'react';
import { List, Search, RefreshCw, Loader2, Calendar, FileSpreadsheet, Eye, X } from 'lucide-react';
import { apiFetch } from '@/services/api';

interface AdminLog {
  id: string;
  userEmail: string;
  action: string;
  status: string;
  ipAddress?: string;
  details?: string;
  createdAt: string;
}

export default function AuditAdminPage() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(15);
  
  // Selected log for detail viewing
  const [selectedLog, setSelectedLog] = useState<AdminLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter, statusFilter, from, to]);

  async function fetchLogs() {
    setLoading(true);
    try {
      let url = `/audit/admin?page=${page}&limit=${limit}`;
      if (actionFilter !== 'Todos') url += `&action=${actionFilter}`;
      if (statusFilter !== 'Todos') url += `&status=${statusFilter}`;
      if (from) url += `&from=${new Date(from).toISOString()}`;
      if (to) url += `&to=${new Date(to).toISOString()}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

      const data = await apiFetch<{ items: AdminLog[]; total: number }>(url);
      setLogs(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Error fetching admin logs:', err);
    } finally {
      setLoading(false);
    }
  }

  const actionTypes = [
    'Todos',
    'BACKUP_RUN',
    'BACKUP_DELETE',
    'CONTAINER_START',
    'CONTAINER_STOP',
    'CONTAINER_RESTART',
    'USER_CREATE',
    'USER_TOGGLE_STATUS',
    'USER_RESET_PASSWORD',
    'CONDO_SETTINGS_UPDATE',
    'CONDO_UNITS_IMPORT'
  ];

  return (
    <div className="page" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <div>
          <h1><List size={24} /> Logs Administrativos</h1>
          <p>Auditoria de ações críticas executadas pelos administradores do sistema.</p>
        </div>
        <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={fetchLogs} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Filters Card */}
      <div className="card" style={{ padding: '20px', marginBottom: '25px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
          {/* Search Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="text-muted" style={{ fontSize: '0.8rem' }}>Pesquisa por e-mail/detalhes</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Ex: alfreire..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
                style={{ width: '100%', padding: '8px 12px 8px 32px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--text-muted)' }} />
            </div>
          </div>

          {/* Action Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="text-muted" style={{ fontSize: '0.8' }}>Ação</label>
            <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
              {actionTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="text-muted" style={{ fontSize: '0.8' }}>Status</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
              <option value="Todos">Todos</option>
              <option value="success">Sucesso</option>
              <option value="failed">Falha</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '15px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="text-muted" style={{ fontSize: '0.8rem' }}>De</label>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={{ padding: '7px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label className="text-muted" style={{ fontSize: '0.8rem' }}>Até</label>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={{ padding: '7px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }} />
          </div>
          <button className="btn btn-primary" onClick={fetchLogs} style={{ height: '38px', padding: '0 20px' }}>Filtrar</button>
        </div>
      </div>

      {/* Logs Table */}
      {loading && logs.length === 0 ? (
        <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
          <Loader2 className="animate-spin" size={24} style={{ marginRight: '10px' }} /> Carregando auditoria administrativa...
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={{ padding: '12px 18px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Data/Hora</th>
                  <th style={{ padding: '12px 18px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Operador</th>
                  <th style={{ padding: '12px 18px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Ação executada</th>
                  <th style={{ padding: '12px 18px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>IP</th>
                  <th style={{ padding: '12px 18px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status</th>
                  <th style={{ padding: '12px 18px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum log administrativo encontrado.</td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const isSuccess = log.status === 'success';
                    return (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border-primary)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '14px 18px', fontSize: '0.9rem' }}>{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                        <td style={{ padding: '14px 18px', fontSize: '0.9rem', fontWeight: 500 }}>{log.userEmail || 'sistema'}</td>
                        <td style={{ padding: '14px 18px', fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--blue-400)' }}>{log.action}</td>
                        <td style={{ padding: '14px 18px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{log.ipAddress || '-'}</td>
                        <td style={{ padding: '14px 18px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderRadius: '4px',
                            background: isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: isSuccess ? 'var(--green-400)' : 'var(--red-400)',
                            border: `1px solid ${isSuccess ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                          }}>
                            {isSuccess ? 'Sucesso' : 'Falha'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', minWidth: 'auto' }}
                            title="Ver detalhes"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > limit && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderTop: '1px solid var(--border-primary)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mostrando {logs.length} de {total} registros</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Anterior</button>
                <button className="btn btn-secondary" disabled={page * limit >= total} onClick={() => setPage(page + 1)} style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Próxima</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Details Modal */}
      {selectedLog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="card" style={{
            maxWidth: '600px',
            width: '100%',
            padding: '20px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-primary)', paddingBottom: '10px', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <List size={18} /> Detalhes da Ação
              </h3>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setSelectedLog(null)}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <span className="text-muted">Data/Hora:</span>
                <span>{new Date(selectedLog.createdAt).toLocaleString('pt-BR')}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <span className="text-muted">Usuário:</span>
                <span style={{ fontWeight: 500 }}>{selectedLog.userEmail || 'sistema'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <span className="text-muted">Tipo de Ação:</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--blue-400)' }}>{selectedLog.action}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <span className="text-muted">Endereço IP:</span>
                <span>{selectedLog.ipAddress || '-'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <span className="text-muted">Resultado:</span>
                <span style={{ color: selectedLog.status === 'success' ? 'var(--green-400)' : 'var(--red-400)', fontWeight: 'bold' }}>
                  {selectedLog.status === 'success' ? 'Sucesso' : 'Falha'}
                </span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                <span className="text-muted">Observações / Detalhes técnicos:</span>
                <div style={{
                  padding: '12px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  color: '#e2e8f0'
                }}>
                  {selectedLog.details || 'Nenhum detalhe adicional informado.'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-primary" onClick={() => setSelectedLog(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
