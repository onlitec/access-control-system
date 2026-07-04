import React, { useState, useEffect } from 'react';
import { Server, RotateCw, Cpu, Loader2, AlertTriangle } from 'lucide-react';
import { getOpsServices, restartOpsService, type WindowsService } from '@/services/api';

// Serviços cujo restart derruba o próprio painel por alguns segundos
const CRITICAL_SERVICES = ['onliacesso-postgres', 'onliacesso-api'];

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export default function ServicesPage() {
  const [services, setServices] = useState<WindowsService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchServices() {
    try {
      const data = await getOpsServices();
      setServices(data || []);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching services:', err);
      setError(err.message || 'Falha ao consultar os serviços');
    } finally {
      setLoading(false);
    }
  }

  async function handleRestart(name: string) {
    setConfirmRestart(null);
    setActionLoading(name);
    setNotice(null);
    try {
      const result = await restartOpsService(name);
      setNotice(result.message);
      await fetchServices();
    } catch (err: any) {
      setNotice(err.message || `Erro ao reiniciar o serviço ${name}`);
    } finally {
      setActionLoading(null);
    }
  }

  const totalServices = services.length;
  const runningServices = services.filter((s) => s.status === 'Running').length;

  return (
    <div className="page" style={{ minHeight: 'calc(100vh - 120px)' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <div>
          <h1><Server size={24} /> Serviços do Sistema</h1>
          <p>Status e gerenciamento dos serviços Windows do OnliAcesso.</p>
        </div>
        <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => { setLoading(true); fetchServices(); }}>
          <RotateCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {notice && (
        <div className="alert" style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid var(--blue-500)', color: 'var(--blue-400)', marginBottom: '20px', padding: '12px 16px', borderRadius: 'var(--radius)' }}>
          {notice}
        </div>
      )}
      {error && (
        <div className="alert" style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--red-500)', color: 'var(--red-400)', marginBottom: '20px', padding: '12px 16px', borderRadius: 'var(--radius)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
          <Loader2 className="animate-spin" size={24} style={{ marginRight: '10px' }} /> Carregando status dos serviços...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <Server size={24} style={{ color: 'var(--blue-500)' }} />
              <div>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Serviços Ativos</span>
                <h3 style={{ margin: '4px 0 0', fontSize: '1.4rem' }}>{runningServices} / {totalServices}</h3>
              </div>
            </div>
            <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <Cpu size={24} style={{ color: 'var(--green-500)' }} />
              <div>
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>Status Geral</span>
                <h3 style={{ margin: '4px 0 0', fontSize: '1.4rem', color: runningServices === totalServices && totalServices > 0 ? 'var(--green-400)' : 'var(--amber-500)' }}>
                  {runningServices === totalServices && totalServices > 0 ? 'Saudável' : 'Atenção'}
                </h3>
              </div>
            </div>
          </div>

          <div className="settings-card" style={{ margin: 0 }}>
            <div className="settings-card-header">
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Serviços Windows ({totalServices})</h2>
            </div>

            {services.length === 0 ? (
              <p style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>Nenhum serviço OnliAcesso encontrado.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                {services.map((s) => {
                  const isRunning = s.status === 'Running';
                  return (
                    <div key={s.name} style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '15px 20px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-sm)',
                      gap: '15px'
                    }}>
                      <div style={{ minWidth: '220px' }}>
                        <strong style={{ display: 'block', fontSize: '1rem', color: 'var(--text-primary)' }}>{s.displayName}</strong>
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>{s.name} · Uptime: {formatUptime(s.uptimeSeconds)}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '30px' }}>
                        <div>
                          <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block' }}>PID</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{s.pid ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block' }}>Memória</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatBytes(s.memoryBytes)}</span>
                        </div>
                        <div>
                          <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block' }}>Inicialização</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{s.startType === 'Automatic' ? 'Automática' : s.startType}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{
                          padding: '2px 8px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          borderRadius: '4px',
                          background: isRunning ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: isRunning ? 'var(--green-400)' : 'var(--red-400)',
                          border: `1px solid ${isRunning ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                        }}>
                          {isRunning ? 'Em execução' : s.status === 'Stopped' ? 'Parado' : s.status}
                        </span>

                        <button
                          title="Reiniciar serviço"
                          onClick={() => setConfirmRestart(s.name)}
                          disabled={actionLoading !== null}
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          {actionLoading === s.name ? <Loader2 className="animate-spin" size={14} /> : <RotateCw size={14} />}
                          Reiniciar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de confirmação de restart */}
      {confirmRestart && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div className="card" style={{
            maxWidth: '440px', width: '100%', padding: '24px',
            background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius)',
          }}>
            <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} style={{ color: 'var(--amber-500)' }} /> Reiniciar serviço
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Reiniciar <strong>{confirmRestart}</strong>?
              {CRITICAL_SERVICES.includes(confirmRestart) && (
                <>
                  <br /><br />
                  <span style={{ color: 'var(--amber-400)' }}>
                    Atenção: este serviço é crítico — o sistema (inclusive este painel)
                    ficará indisponível por alguns segundos durante o reinício.
                  </span>
                </>
              )}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmRestart(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => handleRestart(confirmRestart)}>Reiniciar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
