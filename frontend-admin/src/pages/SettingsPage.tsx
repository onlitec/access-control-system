import React, { useState, useEffect } from 'react';
import { getHikConfig, getMySessions, logoutAllSessions, revokeMySession, updateHikConfig, getAdminOrganizations, getEntityMappings, createEntityMapping, deleteEntityMapping, EntityMapping, HikEntity } from '@/services/api';
import { Settings, Save, Loader2, AlertTriangle, CheckCircle, Wifi, Shield, LogOut, Trash2, RefreshCw, Database, Plus, X, Map } from 'lucide-react';

const ENTITY_TYPES = [
    { value: 'ORGANIZATION', label: 'Departamento/Organização' },
    { value: 'AREA', label: 'Área Física' },
    { value: 'ACCESS_LEVEL', label: 'Nível de Acesso' },
    { value: 'CUSTOM_FIELD', label: 'Campo Customizado' },
    { value: 'FLOOR', label: 'Piso/Andar' },
    { value: 'VISITOR_GROUP', label: 'Grupo de Visitantes' },
];

const PAGE_ROUTES = [
    { value: '/painel/residents', label: 'Moradores' },
    { value: '/painel/staff', label: 'Staff/Portaria' },
    { value: '/painel/service-providers', label: 'Prestadores' },
    { value: '/painel/visitors', label: 'Visitantes' },
];

export default function SettingsPage() {
    const [config, setConfig] = useState({ apiUrl: '', appKey: '', appSecret: '', syncEnabled: true });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [sessionsBusy, setSessionsBusy] = useState(false);
    const [sessions, setSessions] = useState<Array<{ id: string; createdAt: string; expiresAt: string }>>([]);
    const [maxSessions, setMaxSessions] = useState<number>(5);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // CMS Data-Driven: Mapeamentos
    const [mappings, setMappings] = useState<EntityMapping[]>([]);
    const [mappingsLoading, setMappingsLoading] = useState(false);
    const [organizations, setOrganizations] = useState<HikEntity[]>([]);
    const [showMappingForm, setShowMappingForm] = useState(false);
    const [newMapping, setNewMapping] = useState({
        pageRoute: '/painel/residents',
        entityType: 'ORGANIZATION',
        hikEntityId: '',
        hikEntityName: '',
        priority: 0,
    });

    useEffect(() => {
        loadConfig();
        loadSessions();
        loadMappings();
        loadOrganizations();
    }, []);

    const loadMappings = async () => {
        setMappingsLoading(true);
        try {
            const result = await getEntityMappings();
            setMappings(result.data || []);
        } catch (err: any) {
            console.error('Erro ao carregar mapeamentos:', err);
        } finally {
            setMappingsLoading(false);
        }
    };

    const loadOrganizations = async () => {
        try {
            const result = await getAdminOrganizations();
            setOrganizations(result.data || []);
        } catch (err: any) {
            console.error('Erro ao carregar organizações:', err);
        }
    };

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await getHikConfig();
            setConfig({
                apiUrl: data.apiUrl || '',
                appKey: data.appKey || '',
                appSecret: data.appSecret || '',
                syncEnabled: data.syncEnabled ?? true,
            });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadSessions = async () => {
        setSessionsLoading(true);
        try {
            const result = await getMySessions();
            setSessions(result.data || []);
            setMaxSessions(result.maxActiveSessions || 5);
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar sessões');
        } finally {
            setSessionsLoading(false);
        }
    };

    const handleRevokeSession = async (sessionId: string) => {
        setSessionsBusy(true);
        setError('');
        setSuccess('');
        try {
            await revokeMySession(sessionId);
            setSuccess('Sessão revogada com sucesso');
            await loadSessions();
        } catch (err: any) {
            setError(err.message || 'Falha ao revogar sessão');
        } finally {
            setSessionsBusy(false);
        }
    };

    const handleLogoutAll = async () => {
        setSessionsBusy(true);
        setError('');
        setSuccess('');
        try {
            const result = await logoutAllSessions();
            setSuccess(`Logout global executado. Sessões revogadas: ${result.revokedSessions}`);
            await loadSessions();
        } catch (err: any) {
            setError(err.message || 'Falha no logout global');
        } finally {
            setSessionsBusy(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        setSuccess('');
        try {
            await updateHikConfig(config);
            setSuccess('Configurações salvas com sucesso!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleCreateMapping = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        try {
            await createEntityMapping(newMapping);
            setSuccess('Mapeamento criado com sucesso!');
            setShowMappingForm(false);
            setNewMapping({ pageRoute: '/painel/residents', entityType: 'ORGANIZATION', hikEntityId: '', hikEntityName: '', priority: 0 });
            loadMappings();
        } catch (err: any) {
            setError(err.message || 'Erro ao criar mapeamento');
        }
    };

    const handleDeleteMapping = async (id: string) => {
        if (!confirm('Tem certeza que deseja remover este mapeamento?')) return;
        setError('');
        try {
            await deleteEntityMapping(id);
            setSuccess('Mapeamento removido com sucesso!');
            loadMappings();
        } catch (err: any) {
            setError(err.message || 'Erro ao remover mapeamento');
        }
    };

    const handleEntitySelect = (entityId: string) => {
        const entity = organizations.find(o => o.id === entityId);
        setNewMapping({
            ...newMapping,
            hikEntityId: entityId,
            hikEntityName: entity?.name || '',
        });
    };

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Carregando configurações...</p>
            </div>
        );
    }

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1><Settings size={24} /> Configurações</h1>
                    <p>Configurações de integração HikCentral</p>
                </div>
            </div>

            {error && (
                <div className="alert alert-warning">
                    <AlertTriangle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="alert alert-success">
                    <CheckCircle size={18} />
                    <span>{success}</span>
                </div>
            )}

            <div className="settings-card">
                <div className="settings-card-header">
                    <Wifi size={20} />
                    <h2>HikCentral OpenAPI</h2>
                </div>

                <form onSubmit={handleSave} className="settings-form">
                    <div className="form-group">
                        <label>URL da API</label>
                        <input
                            type="text"
                            placeholder="https://100.77.145.39"
                            value={config.apiUrl}
                            onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                        />
                        <span className="form-hint">Endereço IP ou domínio do servidor HikCentral</span>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>App Key</label>
                            <input
                                type="text"
                                placeholder="26269542"
                                value={config.appKey}
                                onChange={(e) => setConfig({ ...config, appKey: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>App Secret</label>
                            <input
                                type="password"
                                placeholder="••••••••••••"
                                value={config.appSecret}
                                onChange={(e) => setConfig({ ...config, appSecret: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="form-group form-switch-group">
                        <label className="switch-label">
                            <span>Sincronização Automática</span>
                            <span className="switch-description">Sincronizar automaticamente moradores e visitantes com o HikCentral</span>
                        </label>
                        <label className="switch">
                            <input
                                type="checkbox"
                                checked={config.syncEnabled}
                                onChange={(e) => setConfig({ ...config, syncEnabled: e.target.checked })}
                            />
                            <span className="switch-slider"></span>
                        </label>
                    </div>

                    <div className="settings-actions">
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? (
                                <><Loader2 size={18} className="spin" /> Salvando...</>
                            ) : (
                                <><Save size={18} /> Salvar Configurações</>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            <div className="settings-card">
                <div className="settings-card-header">
                    <Shield size={20} />
                    <h2>Sessões Ativas</h2>
                </div>
                <p style={{ marginTop: 0, color: '#6b7280' }}>
                    Limite atual por usuário: <strong>{maxSessions}</strong>
                </p>
                <div className="settings-actions" style={{ marginTop: '0.75rem' }}>
                    <button type="button" className="btn" onClick={loadSessions} disabled={sessionsLoading || sessionsBusy}>
                        <RefreshCw size={18} className={sessionsLoading ? 'spin' : ''} /> Atualizar
                    </button>
                    <button type="button" className="btn btn-danger" onClick={handleLogoutAll} disabled={sessionsLoading || sessionsBusy}>
                        <LogOut size={18} /> Logout de Todas
                    </button>
                </div>

                {sessionsLoading ? (
                    <div className="page-loading" style={{ minHeight: 120 }}>
                        <div className="spinner"></div>
                        <p>Carregando sessões...</p>
                    </div>
                ) : sessions.length === 0 ? (
                    <p style={{ color: '#6b7280' }}>Nenhuma sessão ativa.</p>
                ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {sessions.map((session) => (
                            <div key={session.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.75rem' }}>
                                <div>
                                    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{session.id}</div>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                                        Criada: {new Date(session.createdAt).toLocaleString('pt-BR')} | Expira: {new Date(session.expiresAt).toLocaleString('pt-BR')}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    disabled={sessionsBusy}
                                    onClick={() => handleRevokeSession(session.id)}
                                >
                                    <Trash2 size={16} /> Revogar
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* CMS Data-Driven: Entity Mappings */}
            <div className="settings-card">
                <div className="settings-card-header">
                    <Database size={20} />
                    <h2>Mapeamentos de Entidades (CMS)</h2>
                </div>
                <p style={{ marginTop: 0, color: '#6b7280', marginBottom: '1rem' }}>
                    Configure quais entidades do HikCentral alimentam cada página do painel.
                </p>

                <div className="settings-actions" style={{ marginBottom: '1rem' }}>
                    <button type="button" className="btn" onClick={loadMappings} disabled={mappingsLoading}>
                        <RefreshCw size={18} className={mappingsLoading ? 'spin' : ''} /> Atualizar
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setShowMappingForm(!showMappingForm)}>
                        {showMappingForm ? <><X size={18} /> Cancelar</> : <><Plus size={18} /> Novo Mapeamento</>}
                    </button>
                </div>

                {showMappingForm && (
                    <form onSubmit={handleCreateMapping} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', marginBottom: '1rem', background: '#f9fafb' }}>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Página do Painel</label>
                                <select
                                    value={newMapping.pageRoute}
                                    onChange={(e) => setNewMapping({ ...newMapping, pageRoute: e.target.value })}
                                >
                                    {PAGE_ROUTES.map(route => (
                                        <option key={route.value} value={route.value}>{route.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Tipo de Entidade</label>
                                <select
                                    value={newMapping.entityType}
                                    onChange={(e) => setNewMapping({ ...newMapping, entityType: e.target.value })}
                                >
                                    {ENTITY_TYPES.map(type => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Entidade HikCentral</label>
                                <select
                                    value={newMapping.hikEntityId}
                                    onChange={(e) => handleEntitySelect(e.target.value)}
                                >
                                    <option value="">Selecione...</option>
                                    {organizations.map(org => (
                                        <option key={org.id} value={org.id}>{org.name} ({org.id})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Prioridade</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={newMapping.priority}
                                    onChange={(e) => setNewMapping({ ...newMapping, priority: parseInt(e.target.value) || 0 })}
                                    placeholder="0 = maior prioridade"
                                />
                            </div>
                        </div>
                        <div className="settings-actions">
                            <button type="submit" className="btn btn-primary">
                                <Map size={18} /> Criar Mapeamento
                            </button>
                        </div>
                    </form>
                )}

                {mappingsLoading ? (
                    <div className="page-loading" style={{ minHeight: 100 }}>
                        <div className="spinner"></div>
                        <p>Carregando mapeamentos...</p>
                    </div>
                ) : mappings.length === 0 ? (
                    <p style={{ color: '#6b7280' }}>Nenhum mapeamento configurado. Clique em "Novo Mapeamento" para começar.</p>
                ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {mappings.map((mapping) => (
                            <div key={mapping.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.75rem' }}>
                                <div>
                                    <div style={{ fontWeight: 500 }}>
                                        <span style={{ color: '#3b82f6' }}>{mapping.pageRoute}</span>
                                        {' → '}
                                        <span style={{ color: '#10b981' }}>{mapping.hikEntityName}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                                        Tipo: <strong>{ENTITY_TYPES.find(t => t.value === mapping.entityType)?.label || mapping.entityType}</strong>
                                        {' | '}ID: <code>{mapping.hikEntityId}</code>
                                        {' | '}Prioridade: {mapping.priority}
                                        {' | '}Status: {mapping.isActive ? '✅ Ativo' : '⛔ Inativo'}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => handleDeleteMapping(mapping.id)}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
