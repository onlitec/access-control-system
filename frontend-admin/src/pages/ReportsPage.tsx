import React, { useState, useEffect } from 'react';
import { BarChart3, Users, Clock, Database, CheckCircle2, TrendingUp, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { apiFetch } from '@/services/api';

interface HealthStats {
  db: {
    version: string;
    activeConnections: number;
    maxConnections: number;
    sizeBytes: number;
    lastBackupAt: string;
  };
  disk: {
    usedBytes: number;
    totalBytes: number;
    uploadDirSizeBytes: number;
  };
  api: {
    requestsLast5Min: number;
    avgResponseTimeMs: number;
    errorRatePercent: number;
  };
}

export default function ReportsPage() {
  const [healthData, setHealthData] = useState<HealthStats | null>(null);
  const [accessTotal, setAccessTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      const [health, access] = await Promise.all([
        apiFetch<HealthStats>('/ops/health'),
        apiFetch<{ total: number }>('/audit/access?limit=1')
      ]);
      setHealthData(health);
      setAccessTotal(access.total || 0);
    } catch (err) {
      console.error('Error fetching report stats:', err);
    } finally {
      setLoading(false);
    }
  }

  // Format helper
  const formatMB = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatGB = (bytes: number) => {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  return (
    <div className="page" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <div>
          <h1><BarChart3 size={24} /> Relatórios Consolidados</h1>
          <p>Métricas consolidadas de tráfego de acesso, integridade de serviços e armazenamento.</p>
        </div>
        <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={fetchStats} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Carregando' : 'Atualizar'}
        </button>
      </div>

      {loading && !healthData ? (
        <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
          <Loader2 className="animate-spin" size={24} style={{ marginRight: '10px' }} /> Consolidando relatórios do sistema...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
          {/* Key metrics row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Total de Acessos Gravados</span>
                <Clock size={20} style={{ color: 'var(--blue-500)' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700 }}>{accessTotal}</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--green-400)', display: 'block', marginTop: '6px' }}>
                <TrendingUp size={12} style={{ display: 'inline', marginRight: '4px' }} /> Eventos auditados no banco
              </span>
            </div>

            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Armazenamento PostgreSQL</span>
                <Database size={20} style={{ color: 'var(--purple-500)' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700 }}>{healthData ? formatMB(healthData.db.sizeBytes) : '0 MB'}</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                Espaço total alocado para tabelas
              </span>
            </div>

            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Latência Média da API</span>
                <Clock size={20} style={{ color: 'var(--green-500)' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700 }}>{healthData ? `${healthData.api.avgResponseTimeMs} ms` : '0 ms'}</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                Tempo médio das últimas requisições
              </span>
            </div>

            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Taxa de Erro da API</span>
                <AlertTriangle size={20} style={{ color: healthData && healthData.api.errorRatePercent > 1 ? 'var(--red-500)' : 'var(--green-500)' }} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700 }}>{healthData ? `${healthData.api.errorRatePercent}%` : '0%'}</h3>
              <span style={{ fontSize: '0.75rem', color: healthData && healthData.api.errorRatePercent > 1 ? 'var(--red-400)' : 'var(--green-400)', display: 'block', marginTop: '6px' }}>
                {healthData && healthData.api.errorRatePercent === 0 ? 'Nenhum erro registrado' : 'Taxa dentro do limite aceitável'}
              </span>
            </div>
          </div>

          {/* Detailed stats grids */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            
            {/* Database Connections */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} style={{ color: 'var(--blue-400)' }} /> Uso de Conexões do Banco
              </h3>
              {healthData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span className="text-muted">Conexões ativas:</span>
                    <strong>{healthData.db.activeConnections} / {healthData.db.maxConnections}</strong>
                  </div>
                  {/* Progress Bar */}
                  <div style={{ height: '8px', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${(healthData.db.activeConnections / healthData.db.maxConnections) * 100}%`,
                      height: '100%',
                      background: 'var(--blue-500)',
                      borderRadius: '4px'
                    }}></div>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    Limite de conexões do PostgreSQL configurado no servidor. O pool de conexões do Prisma otimiza e reutiliza as conexões abertas automaticamente.
                  </span>
                </div>
              )}
            </div>

            {/* Storage details */}
            <div className="card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} style={{ color: 'var(--green-400)' }} /> Alocação de Disco
              </h3>
              {healthData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted">Espaço total em disco:</span>
                    <strong>{formatGB(healthData.disk.totalBytes)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted">Espaço ocupado:</span>
                    <strong>{formatGB(healthData.disk.usedBytes)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="text-muted">Imagens/Arquivos de Uploads:</span>
                    <strong>{formatMB(healthData.disk.uploadDirSizeBytes)}</strong>
                  </div>
                  
                  {/* Progress Bar */}
                  <div style={{ height: '8px', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden', marginTop: '5px' }}>
                    <div style={{
                      width: `${(healthData.disk.usedBytes / healthData.disk.totalBytes) * 100}%`,
                      height: '100%',
                      background: 'var(--green-500)',
                      borderRadius: '4px'
                    }}></div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
