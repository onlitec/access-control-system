import React, { useState, useEffect } from 'react';
import { FileText, ShieldAlert, Terminal, RefreshCw, Loader2, Search } from 'lucide-react';
import { apiFetch } from '@/services/api';

interface SystemLog {
  timestamp_utc: string;
  host?: string;
  user?: string;
  action?: string;
  status?: string;
  details?: string;
  raw?: string;
}

const LOG_SERVICES = [
  'onliacesso-api',
  'onliacesso-postgres',
  'onliacesso-visitor',
  'onliacesso-access',
  'onliacesso-admin',
  'onliacesso-proxy',
];

export default function LogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState<number>(100);
  const [service, setService] = useState<string>('onliacesso-api');
  const [stream, setStream] = useState<'out' | 'err'>('out');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    fetchLogs();
  }, [limit, service, stream]);

  async function fetchLogs() {
    setLoading(true);
    try {
      const data = await apiFetch<SystemLog[]>(
        `/ops/logs?service=${encodeURIComponent(service)}&stream=${stream}&limit=${limit}`,
      );
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching system logs:', err);
    } finally {
      setLoading(false);
    }
  }

  // Filter logs locally based on search term
  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    
    if (log.raw) {
      return log.raw.toLowerCase().includes(term);
    }
    
    return (
      (log.host?.toLowerCase().includes(term) ?? false) ||
      (log.user?.toLowerCase().includes(term) ?? false) ||
      (log.action?.toLowerCase().includes(term) ?? false) ||
      (log.status?.toLowerCase().includes(term) ?? false) ||
      (log.details?.toLowerCase().includes(term) ?? false)
    );
  });

  return (
    <div className="page" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <div>
          <h1><FileText size={24} /> Logs do Sistema</h1>
          <p>Histórico de logs de sistema de infraestrutura e serviços do console administrativo.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={fetchLogs} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Carregando' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Controls Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '400px' }}>
            <input
              type="text"
              placeholder="Pesquisar por ação, usuário, host ou detalhes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem'
              }}
            />
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            style={{
              padding: '8px 12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem'
            }}
          >
            {LOG_SERVICES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={stream}
            onChange={(e) => setStream(e.target.value as 'out' | 'err')}
            style={{
              padding: '8px 12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem'
            }}
          >
            <option value="out">Saída (out)</option>
            <option value="err">Erros (err)</option>
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value))}
            style={{
              padding: '8px 12px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem'
            }}
          >
            <option value={50}>Últimos 50 logs</option>
            <option value={100}>Últimos 100 logs</option>
            <option value={200}>Últimos 200 logs</option>
            <option value={500}>Últimos 500 logs</option>
          </select>
        </div>
      </div>

      {/* Logs Table / Console View */}
      {loading && logs.length === 0 ? (
        <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
          <Loader2 className="animate-spin" size={24} style={{ marginRight: '10px' }} /> Carregando logs de auditoria do sistema...
        </div>
      ) : (
        <div className="card" style={{ padding: '20px', background: '#090d16', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-primary)', paddingBottom: '10px', marginBottom: '15px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={16} /> {service}.{stream}.log
            </span>
            <span>Mostrando {filteredLogs.length} logs</span>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            maxHeight: '65vh',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            lineHeight: '1.4',
            paddingRight: '5px'
          }}>
            {filteredLogs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>Nenhum log encontrado.</div>
            ) : (
              filteredLogs.map((l, index) => {
                const dateStr = l.timestamp_utc ? new Date(l.timestamp_utc).toLocaleString('pt-BR') : '';
                
                if (l.raw) {
                  return (
                    <div key={index} style={{ display: 'flex', gap: '10px', wordBreak: 'break-all' }}>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>[{dateStr}]</span>
                      <span style={{ color: 'var(--red-400)' }}>[RAW]</span>
                      <span style={{ color: '#d4d4d4' }}>{l.raw}</span>
                    </div>
                  );
                }

                const isOk = l.status === 'ok';
                return (
                  <div key={index} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.01)',
                    borderLeft: `3px solid ${isOk ? 'var(--green-500)' : 'var(--red-500)'}`,
                    borderRadius: '0 4px 4px 0',
                    gap: '4px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-muted)' }}>[{dateStr}]</span>
                        <span style={{ color: 'var(--blue-400)', fontWeight: 600 }}>[{l.host || 'SYSTEM'}]</span>
                        <span style={{ color: 'var(--purple-400)' }}>{l.user || 'system'}</span>
                        <span style={{ color: '#e2e8f0', fontWeight: 'bold' }}>{l.action}</span>
                      </div>
                      <span style={{
                        color: isOk ? 'var(--green-400)' : 'var(--red-400)',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        textTransform: 'uppercase'
                      }}>
                        {l.status}
                      </span>
                    </div>
                    {l.details && (
                      <div style={{ color: 'var(--text-secondary)', paddingLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.05)', marginTop: '4px', wordBreak: 'break-all' }}>
                        {l.details}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
