import React, { useState, useEffect } from 'react';
import { getDashboardStats, getSystemStatus } from '@/services/api';
import {
    Users,
    UserCheck,
    Activity,
    ShieldCheck,
    Server,
    Database,
    Wifi,
    Clock,
    TrendingUp,
    AlertTriangle,
    Briefcase,
} from 'lucide-react';

interface Stats {
    totalResidents: number;
    totalVisitors: number;
    activeVisits: number;
    completedVisits: number;
    totalProviders: number;
    todayAccess: number;
    totalAccessEvents: number;
}

interface SystemStatus {
    api: string;
    database: string;
    hikcentral: string;
    uptime: number;
    timestamp: string;
}

export default function DashboardPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [system, setSystem] = useState<SystemStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [loadedAt] = useState(new Date());

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        setError('');
        try {
            const [statsData, systemData] = await Promise.all([
                getDashboardStats(),
                getSystemStatus().catch(() => null),
            ]);
            setStats(statsData);
            setSystem(systemData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatUptime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}h ${m}m`;
    };

    const statusColor = (status: string) => {
        if (status === 'ONLINE') return 'status-online';
        if (status === 'OFFLINE') return 'status-offline';
        return 'status-unknown';
    };

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Carregando dashboard...</p>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Dashboard</h1>
                    <p>Visão geral do sistema de controle de acesso</p>
                </div>
            </div>

            {error && (
                <div className="alert alert-warning">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {/* Métricas operacionais — o que está acontecendo agora */}
            <div className="dashboard-section-label">Tempo real</div>
            <div className="stats-grid stats-grid-hero">
                <div className="stat-card stat-card-hero stat-amber">
                    <div className="stat-icon"><TrendingUp size={28} /></div>
                    <div className="stat-info">
                        <span className="stat-value stat-value-hero">{stats?.todayAccess ?? '—'}</span>
                        <span className="stat-label">Acessos hoje</span>
                    </div>
                </div>
                <div className="stat-card stat-card-hero stat-purple">
                    <div className="stat-icon"><Activity size={28} /></div>
                    <div className="stat-info">
                        <span className="stat-value stat-value-hero">{stats?.activeVisits ?? '—'}</span>
                        <span className="stat-label">Visitas ativas</span>
                    </div>
                </div>
            </div>

            {/* Métricas cadastrais — totais que mudam devagar */}
            <div className="dashboard-section-label" style={{ marginTop: 24 }}>Cadastros</div>
            <div className="stats-grid">
                <div className="stat-card stat-blue">
                    <div className="stat-icon"><Users size={22} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{stats?.totalResidents ?? '—'}</span>
                        <span className="stat-label">Moradores</span>
                    </div>
                </div>
                <div className="stat-card stat-green">
                    <div className="stat-icon"><UserCheck size={22} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{stats?.totalVisitors ?? '—'}</span>
                        <span className="stat-label">Visitantes</span>
                    </div>
                </div>
                <div className="stat-card stat-blue">
                    <div className="stat-icon"><Briefcase size={22} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{stats?.totalProviders ?? '—'}</span>
                        <span className="stat-label">Prestadores</span>
                    </div>
                </div>
            </div>

            {system && (
                <div className="system-status-section" style={{ marginTop: 28 }}>
                    <h2><ShieldCheck size={20} /> Status do Sistema</h2>
                    <div className="status-grid">
                        <div className="status-card">
                            <Server size={20} />
                            <div>
                                <span className="status-label">Backend API</span>
                                <span className={`status-badge ${statusColor(system.api)}`}>{system.api}</span>
                            </div>
                        </div>
                        <div className="status-card">
                            <Database size={20} />
                            <div>
                                <span className="status-label">Banco de Dados</span>
                                <span className={`status-badge ${statusColor(system.database)}`}>{system.database}</span>
                            </div>
                        </div>
                        <div className="status-card">
                            <Wifi size={20} />
                            <div>
                                <span className="status-label">HikCentral</span>
                                <span className={`status-badge ${statusColor(system.hikcentral)}`}>{system.hikcentral}</span>
                            </div>
                        </div>
                        <div className="status-card">
                            <Clock size={20} />
                            <div>
                                <span className="status-label">Uptime</span>
                                <span className="status-value">{formatUptime(system.uptime)}</span>
                                <span className="status-uptime-since">
                                    desde {new Date(Date.now() - system.uptime * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="status-footer">
                        Verificado às {loadedAt.toLocaleTimeString('pt-BR')}
                    </div>
                </div>
            )}
        </div>
    );
}
