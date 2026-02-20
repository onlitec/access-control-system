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
                <h1>Dashboard</h1>
                <p>Visão geral do sistema Calabasas</p>
            </div>

            {error && (
                <div className="alert alert-warning">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                </div>
            )}

            <div className="stats-grid">
                <div className="stat-card stat-blue">
                    <div className="stat-icon"><Users size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{stats?.totalResidents ?? '—'}</span>
                        <span className="stat-label">Moradores</span>
                    </div>
                </div>
                <div className="stat-card stat-green">
                    <div className="stat-icon"><UserCheck size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{stats?.totalVisitors ?? '—'}</span>
                        <span className="stat-label">Visitantes</span>
                    </div>
                </div>
                <div className="stat-card stat-purple">
                    <div className="stat-icon"><Activity size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{stats?.activeVisits ?? '—'}</span>
                        <span className="stat-label">Visitas Ativas</span>
                    </div>
                </div>
                <div className="stat-card stat-amber">
                    <div className="stat-icon"><TrendingUp size={24} /></div>
                    <div className="stat-info">
                        <span className="stat-value">{stats?.todayAccess ?? '—'}</span>
                        <span className="stat-label">Acessos Hoje</span>
                    </div>
                </div>
            </div>

            {system && (
                <div className="system-status-section">
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
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
