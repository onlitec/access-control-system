import React, { useState, useEffect } from 'react';
import { getOpsHealth, getOpsServices, type WindowsService } from '@/services/api';
import {
    Activity,
    Database,
    HardDrive,
    Server,
    RefreshCw,
    AlertTriangle,
    CheckCircle,
    Info,
} from 'lucide-react';

interface HealthData {
    db: {
        version: string;
        activeConnections: number;
        maxConnections: number;
        sizeBytes: number;
        lastBackupAt: string | null;
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

const REQUIRED_SERVICES = [
    'onliacesso-postgres',
    'onliacesso-api',
    'onliacesso-visitor',
    'onliacesso-access',
    'onliacesso-admin',
    'onliacesso-proxy',
];

function formatUptime(seconds: number | null): string {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

const MOCK_HEALTH_DATA: HealthData = {
    db: {
        version: 'PostgreSQL 15.3 (Simulado)',
        activeConnections: 4,
        maxConnections: 100,
        sizeBytes: 52428800, // 50MB
        lastBackupAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    },
    disk: {
        usedBytes: 8589934592, // 8GB
        totalBytes: 53687091200, // 50GB
        uploadDirSizeBytes: 104857600, // 100MB
    },
    api: {
        requestsLast5Min: 47,
        avgResponseTimeMs: 83,
        errorRatePercent: 0.4,
    },
};

const MOCK_SERVICE_DATA: WindowsService[] = REQUIRED_SERVICES.map((name) => ({
    name,
    displayName: name,
    status: 'Running',
    startType: 'Automatic',
    pid: 0,
    memoryBytes: null,
    uptimeSeconds: 7200,
}));

export default function SystemHealthPage() {
    const [health, setHealth] = useState<HealthData | null>(null);
    const [services, setServices] = useState<WindowsService[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const [healthData, servicesData] = await Promise.all([
                getOpsHealth(),
                getOpsServices(),
            ]);
            setHealth(healthData);
            setServices(servicesData || []);
            setIsDemoMode(false);
        } catch (err) {
            console.warn('Backend API failed, falling back to mock demonstration mode:', err);
            setHealth(MOCK_HEALTH_DATA);
            setServices(MOCK_SERVICE_DATA);
            setIsDemoMode(true);
        } finally {
            setLoading(false);
            setRefreshing(false);
            setLastUpdated(new Date());
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(() => {
            loadData();
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    const formatBytes = (bytes: number, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Carregando status do sistema...</p>
            </div>
        );
    }

    const serviceMap = new Map((services || []).map((s) => [s.name, s]));
    
    // Disk percentage calculation
    const diskUsedPercent = health
        ? Math.round((health.disk.usedBytes / health.disk.totalBytes) * 100)
        : 0;

    // Database connection percentage calculation
    const dbConnPercent = health
        ? Math.round((health.db.activeConnections / health.db.maxConnections) * 100)
        : 0;

    return (
        <div className="page">
            {/* Last updated and header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1><Activity size={24} /> Saúde do Sistema</h1>
                    <p>Monitoramento operacional da infraestrutura e serviços</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {lastUpdated && (
                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                            Atualizado em: {lastUpdated.toLocaleTimeString('pt-BR')}
                        </span>
                    )}
                    <button className="btn btn-secondary" onClick={() => loadData(true)} disabled={refreshing}>
                        <RefreshCw size={16} className={refreshing ? 'spin' : ''} /> Atualizar
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
                            Não foi possível conectar-se aos serviços do backend. Exibindo dados de teste para validação da interface.
                        </p>
                    </div>
                </div>
            )}

            {/* Two-column responsive grid */}
            <div className="health-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                
                {/* CARD 1: Status dos Serviços (Containers) */}
                <div className="settings-card" style={{ margin: 0 }}>
                    <div className="settings-card-header">
                        <Server size={20} />
                        <h2>Status dos Serviços</h2>
                    </div>
                    <div className="data-table-wrapper" style={{ border: 'none', background: 'transparent' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Serviço</th>
                                    <th>Status</th>
                                    <th>Uptime</th>
                                </tr>
                            </thead>
                            <tbody>
                                {REQUIRED_SERVICES.map((name) => {
                                    const s = serviceMap.get(name);
                                    let state = 'unhealthy';
                                    let uptime = '—';

                                    if (s) {
                                        if (s.status === 'Running') {
                                            state = 'healthy';
                                        } else if (s.status === 'StartPending' || s.status === 'ContinuePending') {
                                            state = 'starting';
                                        }
                                        uptime = formatUptime(s.uptimeSeconds);
                                    }

                                    return (
                                        <tr key={name}>
                                            <td style={{ fontWeight: 600 }}>{name}</td>
                                            <td>
                                                <span 
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '3px 8px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        borderRadius: 'var(--radius-xs)',
                                                        background: state === 'healthy' ? 'rgba(34, 197, 94, 0.15)' : state === 'starting' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                        color: state === 'healthy' ? 'var(--green-400)' : state === 'starting' ? 'var(--amber-400)' : 'var(--red-400)',
                                                        border: `1px solid ${state === 'healthy' ? 'rgba(34, 197, 94, 0.3)' : state === 'starting' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                                    }}
                                                >
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: state === 'healthy' ? 'var(--green-500)' : state === 'starting' ? 'var(--amber-500)' : 'var(--red-500)' }} />
                                                    {state === 'healthy' ? 'Healthy' : state === 'starting' ? 'Starting' : 'Unhealthy'}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{uptime}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* CARD 2: Banco de dados */}
                <div className="settings-card" style={{ margin: 0 }}>
                    <div className="settings-card-header">
                        <Database size={20} />
                        <h2>Banco de dados</h2>
                    </div>
                    {health && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '10px 0' }}>
                            <div>
                                <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Versão do PostgreSQL</span>
                                <h3 style={{ margin: '4px 0 0', fontSize: '1.1rem', fontWeight: 600 }}>{health.db.version}</h3>
                            </div>
                            
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                                    <span className="text-muted">Conexões ativas</span>
                                    <strong>{health.db.activeConnections} / {health.db.maxConnections}</strong>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div 
                                        style={{ 
                                            width: `${Math.min(100, dbConnPercent)}%`, 
                                            height: '100%', 
                                            background: dbConnPercent > 80 ? 'var(--red-500)' : 'var(--blue-500)',
                                            transition: 'width 0.5s ease'
                                        }} 
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div>
                                    <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tamanho do Banco</span>
                                    <p style={{ margin: '4px 0 0', fontWeight: 600 }}>{formatBytes(health.db.sizeBytes)}</p>
                                </div>
                                <div>
                                    <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Último Backup</span>
                                    <p style={{ margin: '4px 0 0', fontWeight: 600, fontSize: '0.85rem' }}>
                                        {health.db.lastBackupAt
                                            ? new Date(health.db.lastBackupAt).toLocaleString('pt-BR')
                                            : 'Nenhum backup ainda'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* CARD 3: Armazenamento */}
                <div className="settings-card" style={{ margin: 0 }}>
                    <div className="settings-card-header">
                        <HardDrive size={20} />
                        <h2>Armazenamento</h2>
                    </div>
                    {health && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '10px 0' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                                    <span className="text-muted">Uso de disco</span>
                                    <strong>{formatBytes(health.disk.usedBytes)} / {formatBytes(health.disk.totalBytes)} ({diskUsedPercent}%)</strong>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div 
                                        style={{ 
                                            width: `${Math.min(100, diskUsedPercent)}%`, 
                                            height: '100%', 
                                            background: diskUsedPercent > 85 ? 'var(--red-500)' : 'var(--green-500)',
                                            transition: 'width 0.5s ease'
                                        }} 
                                    />
                                </div>
                            </div>

                            <div>
                                <span className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Diretório de uploads</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                    <Info size={16} className="text-muted" />
                                    <p style={{ margin: 0, fontWeight: 600 }}>
                                        Tamanho atual: {formatBytes(health.disk.uploadDirSizeBytes)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* CARD 4: Rede / API */}
                <div className="settings-card" style={{ margin: 0 }}>
                    <div className="settings-card-header">
                        <Activity size={20} />
                        <h2>Rede / API</h2>
                    </div>
                    {health && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', padding: '10px 0' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                                <div style={{ background: 'var(--bg-primary)', padding: '15px', borderRadius: 'var(--radius)', border: '1px solid var(--border-primary)' }}>
                                    <span className="text-muted" style={{ fontSize: '0.7rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reqs (5 min)</span>
                                    <strong style={{ fontSize: '1.5rem', display: 'block', marginTop: '5px' }}>{health.api.requestsLast5Min}</strong>
                                </div>
                                <div style={{ background: 'var(--bg-primary)', padding: '15px', borderRadius: 'var(--radius)', border: '1px solid var(--border-primary)' }}>
                                    <span className="text-muted" style={{ fontSize: '0.7rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tempo Médio</span>
                                    <strong style={{ fontSize: '1.5rem', display: 'block', marginTop: '5px' }}>{health.api.avgResponseTimeMs}<span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}> ms</span></strong>
                                </div>
                                <div style={{ background: 'var(--bg-primary)', padding: '15px', borderRadius: 'var(--radius)', border: '1px solid var(--border-primary)' }}>
                                    <span className="text-muted" style={{ fontSize: '0.7rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Taxa de erro</span>
                                    <strong style={{ fontSize: '1.5rem', display: 'block', marginTop: '5px', color: health.api.errorRatePercent > 1.0 ? 'var(--red-400)' : 'var(--text-primary)' }}>
                                        {health.api.errorRatePercent}<span style={{ fontSize: '0.85rem', fontWeight: 500 }}> %</span>
                                    </strong>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
