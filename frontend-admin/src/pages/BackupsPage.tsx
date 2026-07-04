import React, { useState, useEffect } from 'react';
import {
    getBackupStatus,
    getBackupList,
    runBackup,
    deleteBackup,
    downloadBackup,
    BackupRun,
} from '@/services/api';
import {
    Database,
    RefreshCw,
    AlertTriangle,
    Download,
    Trash2,
    Play,
    CheckCircle,
    XCircle,
    Calendar,
    Folder,
    Clock,
} from 'lucide-react';

export default function BackupsPage() {
    const [status, setStatus] = useState<{
        lastBackup: BackupRun | null;
        nextScheduled: string;
        destination: string;
    } | null>(null);
    const [listData, setListData] = useState<{
        items: BackupRun[];
        total: number;
        page: number;
        limit: number;
    }>({ items: [], total: 0, page: 1, limit: 10 });

    const [loading, setLoading] = useState(true);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [runningBackupId, setRunningBackupId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    // Mock backup data for fallback
    const mockStatus = {
        lastBackup: {
            id: 'mock-1',
            status: 'success' as const,
            type: 'manual' as const,
            startedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
            completedAt: new Date(Date.now() - 4 * 3600 * 1000 + 4200).toISOString(),
            durationMs: 4200,
            sizeBytes: '24567890',
            destination: '/app/backups/system_db_mock.dump',
            errorMessage: null,
            triggeredBy: 'admin',
            createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
        },
        nextScheduled: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
        destination: '/app/backups',
    };

    const mockList = {
        items: [
            {
                id: 'mock-1',
                status: 'success' as const,
                type: 'manual' as const,
                startedAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
                completedAt: new Date(Date.now() - 4 * 3600 * 1000 + 4200).toISOString(),
                durationMs: 4200,
                sizeBytes: '24567890',
                destination: '/app/backups/system_db_mock.dump',
                errorMessage: null,
                triggeredBy: 'admin',
                createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
            },
            {
                id: 'mock-2',
                status: 'success' as const,
                type: 'automatic' as const,
                startedAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
                completedAt: new Date(Date.now() - 28 * 3600 * 1000 + 4500).toISOString(),
                durationMs: 4500,
                sizeBytes: '24560012',
                destination: '/app/backups/system_db_auto.dump',
                errorMessage: null,
                triggeredBy: 'scheduler',
                createdAt: new Date(Date.now() - 28 * 3600 * 1000).toISOString(),
            },
            {
                id: 'mock-3',
                status: 'failed' as const,
                type: 'automatic' as const,
                startedAt: new Date(Date.now() - 52 * 3600 * 1000).toISOString(),
                completedAt: new Date(Date.now() - 52 * 3600 * 1000 + 1200).toISOString(),
                durationMs: 1200,
                sizeBytes: null,
                destination: null,
                errorMessage: 'Database connection timeout during pg_dump',
                triggeredBy: 'scheduler',
                createdAt: new Date(Date.now() - 52 * 3600 * 1000).toISOString(),
            },
        ],
        total: 3,
        page: 1,
        limit: 10,
    };

    const loadData = async (page = currentPage) => {
        try {
            const [statusData, listResponse] = await Promise.all([
                getBackupStatus(),
                getBackupList(page, 10),
            ]);
            setStatus(statusData);
            setListData(listResponse);
            setIsDemoMode(false);
        } catch (err) {
            console.warn('Backup endpoints failed, falling back to mock data:', err);
            setStatus(mockStatus);
            setListData(mockList);
            setIsDemoMode(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData(currentPage);
    }, [currentPage]);

    // Polling hook when backup is running
    useEffect(() => {
        if (!runningBackupId || isDemoMode) return;

        const interval = setInterval(async () => {
            try {
                const statusData = await getBackupStatus();
                setStatus(statusData);
                
                // Fetch list too to see updates
                const listResponse = await getBackupList(currentPage, 10);
                setListData(listResponse);

                // Check if the running backup finished
                const matchingRun = listResponse.items.find(item => item.id === runningBackupId);
                if (matchingRun && matchingRun.status !== 'running') {
                    setRunningBackupId(null);
                    if (matchingRun.status === 'success') {
                        showToast('success', 'Backup manual concluído com sucesso!');
                    } else {
                        showToast('error', `Falha no backup: ${matchingRun.errorMessage || 'Erro desconhecido'}`);
                    }
                }
            } catch (err) {
                console.error('Error polling backup status:', err);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [runningBackupId, isDemoMode, currentPage]);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 6000);
    };

    const handleRunBackup = async () => {
        if (runningBackupId) return;
        setActionLoading('run');
        try {
            if (isDemoMode) {
                // Mock execution
                showToast('success', 'Backup manual iniciado no modo demonstração!');
                setRunningBackupId('mock-running');
                setTimeout(() => {
                    const newMockRun = {
                        id: 'mock-running',
                        status: 'success' as const,
                        type: 'manual' as const,
                        startedAt: new Date().toISOString(),
                        completedAt: new Date().toISOString(),
                        durationMs: 3800,
                        sizeBytes: '24681357',
                        destination: '/app/backups/system_db_manual_new.dump',
                        errorMessage: null,
                        triggeredBy: 'admin',
                        createdAt: new Date().toISOString(),
                    };
                    
                    setStatus(prev => prev ? { ...prev, lastBackup: newMockRun } : null);
                    setListData(prev => ({
                        ...prev,
                        items: [newMockRun, ...prev.items],
                        total: prev.total + 1,
                    }));
                    setRunningBackupId(null);
                    showToast('success', 'Backup manual (Simulado) concluído com sucesso!');
                }, 4000);
            } else {
                const response = await runBackup();
                setRunningBackupId(response.id);
                showToast('success', 'Processo de backup iniciado no servidor...');
            }
        } catch (err: any) {
            showToast('error', `Erro ao iniciar backup: ${err.message || 'Falha na conexão'}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDownload = async (item: BackupRun) => {
        if (!item.destination) return;
        const fileName = item.destination.split('/').pop() || 'backup.dump';
        setActionLoading(item.id);
        try {
            if (isDemoMode) {
                // Mock download
                showToast('success', `Download do arquivo simulado '${fileName}' iniciado!`);
            } else {
                await downloadBackup(item.id, fileName);
            }
        } catch (err: any) {
            showToast('error', `Erro ao baixar arquivo: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir permanentemente este backup? Esta ação não pode ser desfeita.')) {
            return;
        }
        setActionLoading(id);
        try {
            if (isDemoMode) {
                setListData(prev => ({
                    ...prev,
                    items: prev.items.filter(item => item.id !== id),
                    total: prev.total - 1,
                }));
                showToast('success', 'Backup simulado excluído com sucesso.');
            } else {
                await deleteBackup(id);
                showToast('success', 'Backup excluído do servidor com sucesso.');
                loadData(currentPage);
            }
        } catch (err: any) {
            showToast('error', `Erro ao excluir backup: ${err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const formatBytes = (bytesStr: string | null) => {
        if (!bytesStr) return '—';
        const bytes = parseFloat(bytesStr);
        if (isNaN(bytes)) return '—';
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDuration = (ms: number | null) => {
        if (!ms) return '—';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Carregando status de backups...</p>
            </div>
        );
    }

    const totalPages = Math.ceil(listData.total / listData.limit) || 1;

    return (
        <div className="page">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1><Database size={24} /> Backups do Sistema</h1>
                    <p>Gerenciamento, download e execução de backups do banco de dados do sistema</p>
                </div>
                <button className="btn btn-secondary" onClick={() => loadData()} disabled={actionLoading !== null}>
                    <RefreshCw size={16} /> Atualizar status
                </button>
            </div>

            {/* Banner Mode Demo */}
            {isDemoMode && (
                <div className="alert alert-warning" style={{ background: 'rgba(245, 158, 11, 0.12)', border: '1px solid var(--amber-500)', color: 'var(--amber-400)', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', borderRadius: 'var(--radius)' }}>
                    <AlertTriangle size={20} style={{ flexShrink: 0 }} />
                    <div>
                        <strong>Modo demonstração — dados simulados</strong>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(245, 158, 11, 0.8)' }}>
                            Não foi possível conectar-se aos serviços de backup do backend. Exibindo dados simulados.
                        </p>
                    </div>
                </div>
            )}

            {/* Toast Notifications */}
            {toast && (
                <div 
                    className={`alert alert-${toast.type === 'success' ? 'success' : 'danger'}`} 
                    style={{ 
                        position: 'fixed', 
                        bottom: '20px', 
                        right: '20px', 
                        zIndex: 1000, 
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        margin: 0,
                        animation: 'fadeIn 0.3s ease'
                    }}
                >
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                        <p style={{ margin: 0, fontWeight: 500 }}>{toast.message}</p>
                    </div>
                </div>
            )}

            {/* Main content grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'start' }}>
                
                {/* Left Area: History Table */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* SECTION 2: Histórico de backups */}
                    <div className="settings-card" style={{ margin: 0 }}>
                        <div className="settings-card-header">
                            <Database size={20} />
                            <h2>Histórico de backups</h2>
                        </div>
                        <div className="data-table-wrapper" style={{ border: 'none', background: 'transparent' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Data/Hora início</th>
                                        <th>Tamanho</th>
                                        <th>Tipo</th>
                                        <th>Duração</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {listData.items.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                                                Nenhum backup encontrado no histórico.
                                            </td>
                                        </tr>
                                    ) : (
                                        listData.items.map((item) => (
                                            <tr key={item.id}>
                                                <td style={{ fontWeight: 500 }}>
                                                    {new Date(item.startedAt).toLocaleString('pt-BR')}
                                                </td>
                                                <td>{formatBytes(item.sizeBytes)}</td>
                                                <td>
                                                    <span className={`badge ${item.type === 'automatic' ? 'badge-info' : 'badge-primary'}`} style={{
                                                        background: item.type === 'automatic' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                                                        color: item.type === 'automatic' ? 'var(--blue-400)' : 'var(--purple-400)',
                                                        fontSize: '0.75rem',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontWeight: 600,
                                                        border: `1px solid ${item.type === 'automatic' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`
                                                    }}>
                                                        {item.type === 'automatic' ? 'Automático' : 'Manual'}
                                                    </span>
                                                </td>
                                                <td>{formatDuration(item.durationMs)}</td>
                                                <td>
                                                    {item.status === 'running' ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--amber-400)', fontWeight: 600, fontSize: '0.85rem' }}>
                                                            <RefreshCw size={14} className="spin" /> Executando
                                                        </span>
                                                    ) : item.status === 'success' ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--green-400)', fontWeight: 600, fontSize: '0.85rem' }}>
                                                            <CheckCircle size={14} /> Sucesso
                                                        </span>
                                                    ) : (
                                                        <span 
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--red-400)', fontWeight: 600, fontSize: '0.85rem', cursor: item.errorMessage ? 'help' : 'default' }}
                                                            title={item.errorMessage || undefined}
                                                        >
                                                            <XCircle size={14} /> Falhou
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        <button 
                                                            className="btn btn-secondary" 
                                                            style={{ padding: '6px', minWidth: 'auto' }}
                                                            disabled={item.status !== 'success' || actionLoading !== null || !item.destination}
                                                            onClick={() => handleDownload(item)}
                                                            title="Download do dump"
                                                        >
                                                            <Download size={14} />
                                                        </button>
                                                        <button 
                                                            className="btn btn-secondary" 
                                                            style={{ padding: '6px', minWidth: 'auto', color: 'var(--red-400)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
                                                            disabled={actionLoading !== null || item.status === 'running'}
                                                            onClick={() => handleDelete(item.id)}
                                                            title="Excluir backup"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0 0', borderTop: '1px solid var(--border-primary)', marginTop: '15px' }}>
                                <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                                    Página <strong>{currentPage}</strong> de {totalPages} ({listData.total} backups totais)
                                </span>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '4px 10px', fontSize: '0.85rem' }} 
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => prev - 1)}
                                    >
                                        Anterior
                                    </button>
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '4px 10px', fontSize: '0.85rem' }} 
                                        disabled={currentPage === totalPages}
                                        onClick={() => setCurrentPage(prev => prev + 1)}
                                    >
                                        Próxima
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Area: Status Summary + Run Trigger */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* SECTION 1: Status do backup */}
                    <div className="settings-card" style={{ margin: 0 }}>
                        <div className="settings-card-header">
                            <Clock size={20} />
                            <h2>Status do Backup</h2>
                        </div>
                        {status && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', fontSize: '0.9rem' }}>
                                <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                                    <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Último backup completo</span>
                                    {status.lastBackup ? (
                                        <div style={{ marginTop: '5px' }}>
                                            <strong style={{ display: 'block' }}>
                                                {new Date(status.lastBackup.startedAt).toLocaleString('pt-BR')}
                                            </strong>
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                Tamanho: {formatBytes(status.lastBackup.sizeBytes)} ({status.lastBackup.status === 'success' ? 'Sucesso' : 'Falha'})
                                            </span>
                                        </div>
                                    ) : (
                                        <span style={{ display: 'block', marginTop: '5px', color: 'var(--text-muted)' }}>Nenhum backup registrado</span>
                                    )}
                                </div>

                                <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: '12px' }}>
                                    <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Próximo backup agendado</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                                        <Calendar size={16} className="text-muted" />
                                        <strong>{new Date(status.nextScheduled).toLocaleString('pt-BR')}</strong>
                                    </div>
                                </div>

                                <div>
                                    <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Diretório de destino</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
                                        <Folder size={16} className="text-muted" />
                                        <code style={{ fontSize: '0.8rem', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '4px' }}>
                                            {status.destination}
                                        </code>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* SECTION 3: Executar backup manual */}
                    <div className="settings-card" style={{ margin: 0 }}>
                        <div className="settings-card-header">
                            <Play size={20} />
                            <h2>Backup Manual</h2>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                            Inicie um backup completo instantâneo do banco de dados PostgreSQL. O processo será executado em segundo plano.
                        </p>
                        <button 
                            className="btn btn-primary" 
                            style={{ 
                                width: '100%', 
                                padding: '10px', 
                                display: 'flex', 
                                justifyContent: 'center', 
                                alignItems: 'center', 
                                gap: '8px',
                                background: runningBackupId ? 'var(--amber-glow)' : 'var(--blue-600)',
                                color: runningBackupId ? 'var(--amber-400)' : '#fff',
                                borderColor: runningBackupId ? 'var(--amber-500)' : 'var(--blue-500)'
                            }}
                            disabled={actionLoading !== null || runningBackupId !== null}
                            onClick={handleRunBackup}
                        >
                            {runningBackupId ? (
                                <>
                                    <RefreshCw size={16} className="spin" /> Processando backup...
                                </>
                            ) : (
                                <>
                                    <Play size={16} /> Iniciar backup agora
                                </>
                            )}
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}
