import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    getOpsHealth,
    getCondominiumSettings,
    getSystemUsers,
    getBackupStatus,
} from '@/services/api';
import {
    Activity,
    Database,
    Users,
    Building2,
    ShieldAlert,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Info,
} from 'lucide-react';

export default function DashboardPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [loadedAt] = useState(new Date());

    // Stats state
    const [healthStatus, setHealthStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
    const [lastBackupStr, setLastBackupStr] = useState<string>('Nenhum backup');
    const [usersCount, setUsersCount] = useState<number>(0);
    const [condoName, setCondoName] = useState<string>('Condomínio');

    const loadData = async () => {
        setLoading(true);
        try {
            const [health, settings, users, backup] = await Promise.all([
                getOpsHealth().catch(() => null),
                getCondominiumSettings().catch(() => null),
                getSystemUsers().catch(() => null),
                getBackupStatus().catch(() => null),
            ]);

            // Process health
            if (health) {
                const errorRate = health.api?.errorRatePercent || 0;
                if (errorRate > 20) setHealthStatus('error');
                else if (errorRate > 5) setHealthStatus('warning');
                else setHealthStatus('healthy');
            }

            // Process settings
            if (settings) {
                setCondoName(settings.name);
            }

            // Process users
            if (users) {
                setUsersCount(users.filter(u => u.status === 'active').length);
            }

            // Process backups
            if (backup && backup.lastBackup && backup.lastBackup.completedAt) {
                const date = new Date(backup.lastBackup.completedAt);
                setLastBackupStr(date.toLocaleString('pt-BR'));
            }

            setIsDemoMode(false);
        } catch (err) {
            console.warn('Dashboard endpoints failed, using simulated data:', err);
            setHealthStatus('healthy');
            setLastBackupStr(new Date().toLocaleString('pt-BR'));
            setUsersCount(3);
            setCondoName('Condomínio Residencial (Simulado)');
            setIsDemoMode(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Carregando painel de controle...</p>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Painel de Operações do Sistema</h1>
                    <p>Visão geral de infraestrutura, controle de acesso e saúde do servidor</p>
                </div>
            </div>

            {/* Banner Mode Demo */}
            {isDemoMode && (
                <div className="alert alert-warning" style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid var(--amber-500)', color: 'var(--amber-400)', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', borderRadius: 'var(--radius)' }}>
                    <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                    <div>
                        <strong>Modo demonstração — dados simulados</strong>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(245, 158, 11, 0.8)' }}>
                            Não foi possível carregar as métricas reais. Exibindo dados simulados.
                        </p>
                    </div>
                </div>
            )}

            {/* Premium 4-Card Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginTop: '20px' }}>
                
                {/* 1. SISTEMA CARD */}
                <div onClick={() => navigate('/admin/health')} style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius)',
                    padding: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }} className="dashboard-card-hover">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Saúde do Sistema</span>
                            <h2 style={{ fontSize: '1.5rem', marginTop: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {healthStatus === 'healthy' && <span style={{ color: 'var(--green-400)' }}>Saudável</span>}
                                {healthStatus === 'warning' && <span style={{ color: 'var(--amber-400)' }}>Atenção</span>}
                                {healthStatus === 'error' && <span style={{ color: 'var(--red-400)' }}>Erro</span>}
                            </h2>
                        </div>
                        <div style={{
                            background: healthStatus === 'healthy' ? 'rgba(34, 197, 94, 0.1)' : healthStatus === 'warning' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            padding: '10px',
                            borderRadius: '12px',
                            color: healthStatus === 'healthy' ? 'var(--green-400)' : healthStatus === 'warning' ? 'var(--amber-400)' : 'var(--red-400)',
                        }}>
                            <Activity size={24} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: healthStatus === 'healthy' ? 'var(--green-500)' : healthStatus === 'warning' ? 'var(--amber-500)' : 'var(--red-500)',
                            display: 'inline-block'
                        }}></span>
                        Verificar containers e conexões
                    </div>
                </div>

                {/* 2. BACKUPS CARD */}
                <div onClick={() => navigate('/admin/backups')} style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius)',
                    padding: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }} className="dashboard-card-hover">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Backups</span>
                            <h2 style={{ fontSize: '1rem', marginTop: '12px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                {lastBackupStr}
                            </h2>
                        </div>
                        <div style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            padding: '10px',
                            borderRadius: '12px',
                            color: 'var(--blue-400)',
                        }}>
                            <Database size={24} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <CheckCircle2 size={14} style={{ color: 'var(--green-400)' }} />
                        Gerenciar cópias de segurança
                    </div>
                </div>

                {/* 3. USUÁRIOS CARD */}
                <div onClick={() => navigate('/admin/system-users')} style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius)',
                    padding: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }} className="dashboard-card-hover">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Usuários do Sistema</span>
                            <h2 style={{ fontSize: '1.5rem', marginTop: '8px', fontWeight: 700 }}>
                                {usersCount} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>operadores</span>
                            </h2>
                        </div>
                        <div style={{
                            background: 'rgba(168, 85, 247, 0.1)',
                            padding: '10px',
                            borderRadius: '12px',
                            color: 'var(--purple-400)',
                        }}>
                            <Users size={24} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <Clock size={14} />
                        Controle de acessos operacionais
                    </div>
                </div>

                {/* 4. CONDOMÍNIO CARD */}
                <div onClick={() => navigate('/admin/condominium')} style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius)',
                    padding: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '140px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }} className="dashboard-card-hover">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Estrutura Física</span>
                            <h2 style={{ fontSize: '1rem', marginTop: '12px', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                                {condoName}
                            </h2>
                        </div>
                        <div style={{
                            background: 'rgba(236, 72, 153, 0.1)',
                            padding: '10px',
                            borderRadius: '12px',
                            color: 'var(--pink-400)',
                        }}>
                            <Building2 size={24} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <Building2 size={14} />
                        Configurar torres, blocos e aptos
                    </div>
                </div>

            </div>

            <div style={{ marginTop: '30px', background: 'var(--bg-secondary)', padding: '20px', borderRadius: 'var(--radius)', border: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <Info size={16} />
                    <span>Última verificação às {loadedAt.toLocaleTimeString('pt-BR')}</span>
                </div>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={loadData}>Recarregar</button>
            </div>
        </div>
    );
}
