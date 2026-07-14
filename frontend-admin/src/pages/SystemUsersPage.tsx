import React, { useState, useEffect } from 'react';
import {
    getSystemUsers,
    createSystemUser,
    updateSystemUser,
    resetSystemUserPassword,
    getUserPermissions,
    setUserPermissions,
    getAllCameraChannels,
    getUserCameras,
    setUserCameras,
    SystemUser,
    UserPermissionsResponse,
} from '@/services/api';
import {
    Users, RefreshCw, AlertTriangle, Plus, X, Edit2, Lock,
    ToggleLeft, ToggleRight, CheckCircle, Info, ShieldCheck,
    ShieldOff, ChevronDown, ChevronUp, Loader2, Video,
} from 'lucide-react';

// ── Permission metadata ───────────────────────────────────────────────────

const PERMISSION_META: Record<string, { label: string; description: string; group: string }> = {
    editRegistration:   { label: 'Cadastrar / Editar',      description: 'Criar e editar moradores, visitantes e prestadores',   group: 'Cadastros' },
    deleteRegistration: { label: 'Excluir cadastros',       description: 'Remover permanentemente registros do sistema',           group: 'Cadastros' },
    viewOnly:           { label: 'Somente leitura',          description: 'Bloqueia qualquer escrita mesmo se outras perms ativas', group: 'Cadastros' },
    manageDevices:      { label: 'Gerenciar dispositivos',   description: 'Configurar videoporteiros e receptores',                group: 'Dispositivos' },
    condo:              { label: 'Config. condomínio',       description: 'Editar regras e dados gerais do condomínio',            group: 'Administração' },
    users:              { label: 'Gerenciar usuários',       description: 'Criar, editar e desativar operadores do sistema',       group: 'Administração' },
    permissions:        { label: 'Gerenciar permissões',     description: 'Alterar permissões de papéis e usuários',              group: 'Administração' },
    audit:              { label: 'Auditoria',                description: 'Visualizar logs de auditoria de sessão e admin',       group: 'Administração' },
    integrations:       { label: 'Integrações',              description: 'Configurar HikCentral, videoporteiros e Guarita',       group: 'Sistemas' },
    health:             { label: 'Saúde do sistema',         description: 'Ver status de containers e métricas de infraestrutura', group: 'Sistemas' },
    containers:         { label: 'Containers',               description: 'Gerenciar containers Docker do servidor',               group: 'Sistemas' },
    backups:            { label: 'Backups',                  description: 'Criar e restaurar backups do banco de dados',           group: 'Sistemas' },
    logs:               { label: 'Logs do servidor',         description: 'Visualizar logs de aplicação e erro',                  group: 'Sistemas' },
    editDepartments:    { label: 'Editar departamentos',     description: 'Configurar mapeamento CMS de entidades HikCentral',    group: 'Sistemas' },
};

const PERM_GROUPS = ['Cadastros', 'Dispositivos', 'Administração', 'Sistemas'];

const ROLE_LABELS: Record<string, string> = {
    admin_master: 'Admin Master',
    operador_portaria: 'Operador Portaria',
    gestor_condominio: 'Gestor Condomínio',
};

// ── Component ─────────────────────────────────────────────────────────────

export default function SystemUsersPage() {
    const [users, setUsers] = useState<SystemUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Create form
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<'admin_master' | 'operador_portaria' | 'gestor_condominio'>('operador_portaria');
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

    // Edit inline
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editRole, setEditRole] = useState<'admin_master' | 'operador_portaria' | 'gestor_condominio'>('operador_portaria');

    // Permission drawer
    const [permDrawerUser, setPermDrawerUser] = useState<SystemUser | null>(null);
    const [permData, setPermData] = useState<UserPermissionsResponse | null>(null);
    const [permLoading, setPermLoading] = useState(false);
    const [permSaving, setPermSaving] = useState(false);

    // Câmeras por usuário
    const [camDrawerUser, setCamDrawerUser] = useState<SystemUser | null>(null);
    const [camAll, setCamAll] = useState(true);
    const [camSelected, setCamSelected] = useState<Set<string>>(new Set());
    const [camChannels, setCamChannels] = useState<{ id: string; name: string; deviceName: string }[]>([]);
    const [camLoading, setCamLoading] = useState(false);
    const [camSaving, setCamSaving] = useState(false);
    // Local draft of custom overrides being edited
    const [permDraft, setPermDraft] = useState<Record<string, boolean | null>>({});

    useEffect(() => { loadData(); }, []);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 5000);
    };

    async function loadData() {
        setLoading(true);
        try {
            const data = await getSystemUsers();
            setUsers(data || []);
            setIsDemoMode(false);
        } catch {
            setIsDemoMode(true);
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateUser() {
        if (!name.trim() || !email.trim()) {
            showToast('error', 'Nome e e-mail são obrigatórios.');
            return;
        }
        const tempPassword = Math.random().toString(36).slice(-8);
        setActionLoading('create');
        try {
            const response = await createSystemUser({ name, email, role, password: tempPassword });
            setUsers(prev => [...prev, response]);
            setGeneratedPassword(tempPassword);
            setName(''); setEmail('');
            setShowCreateForm(false);
            showToast('success', 'Usuário criado com sucesso!');
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao criar usuário.');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleUpdateUser(id: string) {
        setActionLoading(id);
        try {
            const response = await updateSystemUser(id, { name: editName, role: editRole });
            setUsers(prev => prev.map(u => u.id === id ? response : u));
            setEditingUserId(null);
            showToast('success', 'Usuário atualizado.');
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao atualizar.');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleToggleStatus(user: SystemUser) {
        const newStatus = user.status === 'active' ? 'inactive' : 'active';
        setActionLoading(user.id);
        try {
            const response = await updateSystemUser(user.id, { status: newStatus } as any);
            setUsers(prev => prev.map(u => u.id === user.id ? response : u));
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao alterar status.');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleResetPassword(id: string) {
        if (!window.confirm('Gerar nova senha temporária para este usuário?')) return;
        setActionLoading(id);
        try {
            const response = await resetSystemUserPassword(id);
            setGeneratedPassword(response.tempPassword);
            showToast('success', 'Senha temporária gerada!');
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao redefinir senha.');
        } finally {
            setActionLoading(null);
        }
    }

    // ── Câmeras por usuário ────────────────────────────────────────────

    async function openCamDrawer(user: SystemUser) {
        setCamDrawerUser(user);
        setCamLoading(true);
        setCamChannels([]);
        setCamSelected(new Set());
        setCamAll(true);
        try {
            const [all, cur] = await Promise.all([getAllCameraChannels(), getUserCameras(user.id)]);
            setCamChannels(all.channels || []);
            setCamAll(cur.all);
            setCamSelected(new Set(cur.channelIds || []));
        } catch {
            showToast('error', 'Erro ao carregar as câmeras do usuário.');
            setCamDrawerUser(null);
        } finally {
            setCamLoading(false);
        }
    }
    function toggleCam(id: string) {
        setCamSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    }
    async function saveCameras() {
        if (!camDrawerUser) return;
        setCamSaving(true);
        try {
            await setUserCameras(camDrawerUser.id, { all: camAll, channelIds: [...camSelected] });
            showToast('success', `Câmeras de ${camDrawerUser.name} salvas.`);
            setCamDrawerUser(null);
        } catch {
            showToast('error', 'Erro ao salvar as câmeras.');
        } finally {
            setCamSaving(false);
        }
    }

    // ── Permission drawer ──────────────────────────────────────────────

    async function openPermDrawer(user: SystemUser) {
        setPermDrawerUser(user);
        setPermData(null);
        setPermDraft({});
        setPermLoading(true);
        try {
            const data = await getUserPermissions(user.id);
            setPermData(data);
            setPermDraft({ ...(data.customPermissions ?? {}) });
        } catch {
            showToast('error', 'Erro ao carregar permissões do usuário.');
            setPermDrawerUser(null);
        } finally {
            setPermLoading(false);
        }
    }

    function closePermDrawer() {
        setPermDrawerUser(null);
        setPermData(null);
        setPermDraft({});
    }

    function togglePermDraft(key: string) {
        if (!permData) return;
        const roleVal = permData.rolePermissions?.[key] ?? false;
        const currentDraft = permDraft[key];

        if (currentDraft === undefined || currentDraft === null) {
            // No override yet → set override to opposite of role default
            setPermDraft(d => ({ ...d, [key]: !roleVal }));
        } else if (currentDraft !== roleVal) {
            // Override differs from role → remove override (revert to role)
            setPermDraft(d => { const n = { ...d }; delete n[key]; return n; });
        } else {
            // Override same as role (shouldn't normally happen) → flip it
            setPermDraft(d => ({ ...d, [key]: !currentDraft }));
        }
    }

    function effectiveValue(key: string): boolean {
        if (permDraft[key] !== undefined) return !!permDraft[key];
        return !!(permData?.rolePermissions?.[key]);
    }

    function hasOverride(key: string): boolean {
        return permDraft[key] !== undefined;
    }

    async function savePermissions() {
        if (!permDrawerUser) return;
        setPermSaving(true);
        try {
            // Send only the overrides (nulls clear an override)
            const payload: Record<string, boolean | null> = {};
            for (const key of Object.keys(PERMISSION_META)) {
                if (permDraft[key] !== undefined) {
                    payload[key] = permDraft[key];
                } else if (permData?.customPermissions?.[key] !== undefined) {
                    // Key existed before but user removed override → send null
                    payload[key] = null;
                }
            }
            await setUserPermissions(permDrawerUser.id, payload);
            showToast('success', `Permissões de ${permDrawerUser.name} salvas. O novo token será aplicado no próximo login.`);
            closePermDrawer();
        } catch (err: any) {
            showToast('error', err.message || 'Erro ao salvar permissões.');
        } finally {
            setPermSaving(false);
        }
    }

    // ── Render ────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner" />
                <p>Carregando usuários...</p>
            </div>
        );
    }

    return (
        <div className="page">
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1><Users size={24} /> Usuários do Sistema</h1>
                    <p>Operadores e administradores — permissões individuais por usuário</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-secondary" onClick={loadData}><RefreshCw size={16} /></button>
                    <button className="btn btn-primary" onClick={() => { setShowCreateForm(!showCreateForm); setGeneratedPassword(null); }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {showCreateForm ? <X size={16} /> : <Plus size={16} />}
                        {showCreateForm ? 'Cancelar' : 'Novo usuário'}
                    </button>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 1100, padding: '12px 18px', borderRadius: '8px', background: toast.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`, color: toast.type === 'success' ? 'var(--green-400)' : 'var(--red-400)', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
                    {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                    <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{toast.message}</span>
                </div>
            )}

            {/* Temporary password notice */}
            {generatedPassword && (
                <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <CheckCircle size={22} style={{ color: 'var(--green-400)', flexShrink: 0 }} />
                    <div>
                        <strong style={{ color: 'var(--green-400)' }}>Senha temporária gerada — copie agora, não será exibida novamente:</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                            <code style={{ fontSize: '1.2rem', letterSpacing: '0.08em', color: 'var(--text-primary)', background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', padding: '6px 14px', borderRadius: '6px' }}>{generatedPassword}</code>
                            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => { navigator.clipboard.writeText(generatedPassword); showToast('success', 'Copiado!'); }}>Copiar</button>
                            <button onClick={() => setGeneratedPassword(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
                        </div>
                    </div>
                </div>
            )}

            {isDemoMode && (
                <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', color: 'var(--amber-400)' }}>
                    <AlertTriangle size={18} /><span>Backend indisponível — dados não carregados.</span>
                </div>
            )}

            {/* Create Form */}
            {showCreateForm && (
                <div className="settings-card" style={{ marginBottom: '20px' }}>
                    <div className="settings-card-header"><Users size={18} /><h2>Novo Usuário</h2></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '15px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Nome completo</label>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: João da Silva" style={inp} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>E-mail</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="joao@portaria.com" style={inp} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Papel base</label>
                            <select value={role} onChange={(e: any) => setRole(e.target.value)} style={inp}>
                                <option value="operador_portaria">Operador Portaria</option>
                                <option value="gestor_condominio">Gestor Condomínio</option>
                                <option value="admin_master">Admin Master</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-primary)', display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                        <Info size={14} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--text-accent)' }} />
                        <span>Uma senha temporária será gerada. Após criar o usuário, clique em <strong>Permissões</strong> para ajustar permissões individuais além das do papel.</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                        <button className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>Cancelar</button>
                        <button className="btn btn-primary" onClick={handleCreateUser} disabled={actionLoading === 'create'}>
                            {actionLoading === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar usuário
                        </button>
                    </div>
                </div>
            )}

            {/* Users table */}
            <div className="settings-card" style={{ margin: 0 }}>
                <div className="settings-card-header"><Users size={18} /><h2>Operadores cadastrados</h2></div>
                <div className="data-table-wrapper" style={{ border: 'none', background: 'transparent' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>E-mail</th>
                                <th>Papel</th>
                                <th>Último acesso</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>Nenhum usuário cadastrado.</td></tr>
                            ) : users.map(user => {
                                const isEditing = editingUserId === user.id;
                                return (
                                    <tr key={user.id}>
                                        <td>
                                            {isEditing
                                                ? <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inp, width: '180px', padding: '4px 8px' }} />
                                                : <span style={{ fontWeight: 500 }}>{user.name}</span>}
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>{user.email}</td>
                                        <td>
                                            {isEditing
                                                ? <select value={editRole} onChange={(e: any) => setEditRole(e.target.value)} style={{ ...inp, padding: '4px 8px' }}>
                                                    <option value="operador_portaria">Operador Portaria</option>
                                                    <option value="gestor_condominio">Gestor Condomínio</option>
                                                    <option value="admin_master">Admin Master</option>
                                                  </select>
                                                : <span style={{ fontSize: '0.83rem', color: 'var(--text-secondary)' }}>{ROLE_LABELS[user.role] ?? user.role}</span>}
                                        </td>
                                        <td style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                                            {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('pt-BR') : 'Nunca'}
                                        </td>
                                        <td>
                                            <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: '0.73rem', fontWeight: 600, borderRadius: '4px', background: user.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)', color: user.status === 'active' ? 'var(--green-400)' : 'var(--text-muted)', border: `1px solid ${user.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}` }}>
                                                {user.status === 'active' ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                {isEditing ? (
                                                    <>
                                                        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => handleUpdateUser(user.id)} disabled={!!actionLoading}>Salvar</button>
                                                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setEditingUserId(null)}>Cancelar</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button className="btn btn-secondary" style={{ padding: '5px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }} onClick={() => openPermDrawer(user)} title="Permissões individuais">
                                                            <ShieldCheck size={13} /> Permissões
                                                        </button>
                                                        <button className="btn btn-secondary" style={{ padding: '5px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }} onClick={() => openCamDrawer(user)} title="Câmeras que o usuário pode ver">
                                                            <Video size={13} /> Câmeras
                                                        </button>
                                                        <button className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto' }} onClick={() => { setEditingUserId(user.id); setEditName(user.name); setEditRole(user.role); }} title="Editar">
                                                            <Edit2 size={13} />
                                                        </button>
                                                        <button className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto' }} onClick={() => handleResetPassword(user.id)} title="Nova senha temporária">
                                                            <Lock size={13} />
                                                        </button>
                                                        <button className="btn btn-secondary" style={{ padding: '6px', minWidth: 'auto', color: user.status === 'active' ? 'var(--red-400)' : 'var(--green-400)', borderColor: user.status === 'active' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)' }} onClick={() => handleToggleStatus(user)} title={user.status === 'active' ? 'Desativar' : 'Ativar'}>
                                                            {user.status === 'active' ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Permission Drawer Overlay */}
            {permDrawerUser && (
                <>
                    {/* Backdrop */}
                    <div onClick={closePermDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200 }} />

                    {/* Drawer */}
                    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px', maxWidth: '95vw', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-primary)', zIndex: 1300, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.3)' }}>

                        {/* Drawer header */}
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <ShieldCheck size={18} style={{ color: 'var(--text-accent)' }} />
                                    <strong style={{ fontSize: '1rem' }}>Permissões individuais</strong>
                                </div>
                                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                                    {permDrawerUser.name} · <span style={{ color: 'var(--text-accent)' }}>{ROLE_LABELS[permDrawerUser.role] ?? permDrawerUser.role}</span>
                                </div>
                            </div>
                            <button onClick={closePermDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}><X size={18} /></button>
                        </div>

                        {/* Legend */}
                        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--green-400)', display: 'inline-block' }} /> Ativo (papel)
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(59,130,246,0.9)', display: 'inline-block' }} /> Ativo (override)
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(239,68,68,0.7)', display: 'inline-block' }} /> Bloqueado (override)
                            </span>
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                            {permLoading ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', padding: '20px 0' }}>
                                    <Loader2 size={16} className="animate-spin" /> Carregando permissões...
                                </div>
                            ) : permData ? (
                                PERM_GROUPS.map(group => {
                                    const keys = Object.entries(PERMISSION_META).filter(([, m]) => m.group === group).map(([k]) => k);
                                    return (
                                        <div key={group} style={{ marginBottom: '24px' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>{group}</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {keys.map(key => {
                                                    const meta = PERMISSION_META[key];
                                                    const effective = effectiveValue(key);
                                                    const override = hasOverride(key);
                                                    const roleVal = !!(permData.rolePermissions?.[key]);

                                                    let dotColor = 'rgba(100,116,139,0.3)';
                                                    if (effective && !override) dotColor = 'var(--green-400)';
                                                    if (effective && override) dotColor = 'rgba(59,130,246,0.9)';
                                                    if (!effective && override) dotColor = 'rgba(239,68,68,0.7)';

                                                    return (
                                                        <div key={key} onClick={() => togglePermDraft(key)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '6px', border: `1px solid ${override ? (effective ? 'rgba(59,130,246,0.3)' : 'rgba(239,68,68,0.3)') : 'var(--border-primary)'}`, background: override ? (effective ? 'rgba(59,130,246,0.06)' : 'rgba(239,68,68,0.06)') : 'var(--bg-primary)', cursor: 'pointer', userSelect: 'none' }}>
                                                            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: effective ? `0 0 6px ${dotColor}` : 'none' }} />
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)' }}>{meta.label}</div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{meta.description}</div>
                                                            </div>
                                                            {override && (
                                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: effective ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)', color: effective ? 'rgba(59,130,246,1)' : 'rgba(239,68,68,1)', border: `1px solid ${effective ? 'rgba(59,130,246,0.3)' : 'rgba(239,68,68,0.3)'}`, flexShrink: 0 }}>
                                                                    OVERRIDE
                                                                </span>
                                                            )}
                                                            {!override && roleVal !== effective && (
                                                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>papel</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : null}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {Object.keys(permDraft).length > 0
                                    ? `${Object.keys(permDraft).length} override(s) configurado(s)`
                                    : 'Sem overrides — usando permissões do papel'}
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn btn-secondary" onClick={closePermDrawer}>Cancelar</button>
                                <button className="btn btn-primary" onClick={savePermissions} disabled={permSaving} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {permSaving ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                    Salvar permissões
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Camera Drawer Overlay */}
            {camDrawerUser && (
                <>
                    <div onClick={() => setCamDrawerUser(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200 }} />
                    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px', maxWidth: '95vw', background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-primary)', zIndex: 1300, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.3)' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <Video size={18} style={{ color: 'var(--text-accent)' }} />
                                    <strong style={{ fontSize: '1rem' }}>Câmeras do usuário</strong>
                                </div>
                                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                                    {camDrawerUser.name} — vale no painel e no cloud
                                </div>
                            </div>
                            <button onClick={() => setCamDrawerUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                            {camLoading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader2 className="animate-spin" /></div>
                            ) : (
                                <>
                                    <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '12px' }}>
                                        <input type="radio" checked={camAll} onChange={() => setCamAll(true)} style={{ marginTop: '3px' }} />
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Todas as câmeras</div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>O usuário vê todas as câmeras cadastradas.</div>
                                        </div>
                                    </label>
                                    <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '8px' }}>
                                        <input type="radio" checked={!camAll} onChange={() => setCamAll(false)} style={{ marginTop: '3px' }} />
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Apenas as câmeras selecionadas</div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Marque abaixo o que o usuário pode ver.</div>
                                        </div>
                                    </label>

                                    {!camAll && (
                                        <div style={{ marginTop: '10px', border: '1px solid var(--border-primary)', borderRadius: '8px', padding: '8px 12px' }}>
                                            {camChannels.length === 0 ? (
                                                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '8px 0' }}>Nenhuma câmera cadastrada.</div>
                                            ) : camChannels.map(ch => (
                                                <label key={ch.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0', cursor: 'pointer' }}>
                                                    <input type="checkbox" checked={camSelected.has(ch.id)} onChange={() => toggleCam(ch.id)} />
                                                    <span style={{ fontSize: '0.86rem' }}>{ch.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>· {ch.deviceName}</span></span>
                                                </label>
                                            ))}
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', borderTop: '1px solid var(--border-primary)', paddingTop: '6px' }}>
                                                {camSelected.size} de {camChannels.length} selecionada(s)
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn btn-secondary" onClick={() => setCamDrawerUser(null)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={saveCameras} disabled={camSaving || camLoading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {camSaving ? <Loader2 size={13} className="animate-spin" /> : <Video size={13} />}
                                Salvar câmeras
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

const inp: React.CSSProperties = {
    padding: '8px 12px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-primary)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    width: '100%',
    boxSizing: 'border-box',
};
