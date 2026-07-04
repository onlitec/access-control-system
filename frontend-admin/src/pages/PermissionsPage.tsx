import React, { useState, useEffect } from 'react';
import { Shield, ShieldAlert, Check, X, Users, Save, Loader2 } from 'lucide-react';
import { apiFetch } from '@/services/api';

interface RolePermissions {
  role: string;
  health: boolean;
  containers: boolean;
  backups: boolean;
  logs: boolean;
  integrations: boolean;
  condo: boolean;
  users: boolean;
  permissions: boolean;
  audit: boolean;
  deleteRegistration: boolean;
  editRegistration: boolean;
  viewOnly: boolean;
  editDepartments: boolean;
  manageDevices: boolean;
}

export default function PermissionsPage() {
  const [rolePermsList, setRolePermsList] = useState<RolePermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  
  // Selection of active role for configuration
  const [activeRoleIndex, setActiveRoleIndex] = useState<number>(0);

  useEffect(() => {
    fetchPermissions();
  }, []);

  async function fetchPermissions() {
    setLoading(true);
    try {
      const data = await apiFetch<RolePermissions[]>('/ops/permissions');
      setRolePermsList(data || []);
    } catch (err) {
      console.error('Error fetching role permissions:', err);
    } finally {
      setLoading(false);
    }
  }

  // Toggle permission for local state
  const handleTogglePermission = (roleName: string, field: keyof Omit<RolePermissions, 'role'>) => {
    setRolePermsList(prev => prev.map(item => {
      if (item.role === roleName) {
        return {
          ...item,
          [field]: !item[field]
        };
      }
      return item;
    }));
  };

  // Save permissions for a specific role
  async function saveRolePermissions(rolePerms: RolePermissions) {
    setSavingRole(rolePerms.role);
    try {
      await apiFetch('/ops/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rolePerms)
      });
      alert(`Permissões salvas com sucesso para o papel: ${rolePerms.role}`);
      await fetchPermissions();
    } catch (err: any) {
      alert(err.message || `Erro ao salvar permissões para o papel ${rolePerms.role}`);
    } finally {
      setSavingRole(null);
    }
  }

  const roleTitles: Record<string, { title: string; desc: string; color: string; bg: string }> = {
    admin_master: {
      title: 'Administrador Master',
      desc: 'Acesso total irrestrito ao painel master e configurações de infraestrutura.',
      color: 'var(--blue-500)',
      bg: 'rgba(59, 130, 246, 0.12)'
    },
    gestor_condominio: {
      title: 'Gestor do Condomínio',
      desc: 'Acesso restrito ao gerenciamento do condomínio, cadastro de unidades e visualização de auditoria de acessos.',
      color: 'var(--purple-500)',
      bg: 'rgba(168, 85, 247, 0.12)'
    },
    operador_portaria: {
      title: 'Operador de Portaria',
      desc: 'Acesso restrito apenas ao painel de portaria (/painel) para liberação e controle de acessos.',
      color: 'var(--green-500)',
      bg: 'rgba(34, 197, 94, 0.12)'
    }
  };

  const modules = [
    { key: 'health' as const, name: 'Saúde do Sistema', description: 'Métricas de banco de dados, disco e latência da API' },
    { key: 'containers' as const, name: 'Containers Docker', description: 'Monitoramento, reinicialização e logs de containers' },
    { key: 'backups' as const, name: 'Backups de Dados', description: 'Criação, download e deleção de dumps PostgreSQL' },
    { key: 'logs' as const, name: 'Logs de Infraestrutura', description: 'Histórico de logs de sistema e cron logs' },
    { key: 'integrations' as const, name: 'Integrações de Hardware', description: 'Configuração do HikCentral, Nice Guarita e Porteiros' },
    { key: 'condo' as const, name: 'Estruturas do Condomínio', description: 'Cadastro de torres, blocos, unidades e dados gerais' },
    { key: 'users' as const, name: 'Usuários do Sistema', description: 'Criação e controle de senhas de operadores/gestores' },
    { key: 'permissions' as const, name: 'Matriz de Permissões', description: 'Configuração dinâmica de papéis e regras de acesso' },
    { key: 'audit' as const, name: 'Histórico e Auditoria', description: 'Logs de acessos de moradores e logs administrativos' },
    { key: 'deleteRegistration' as const, name: 'Deletar Cadastro (Portaria)', description: 'Permissão para excluir registros de moradores, visitantes ou prestadores de serviços' },
    { key: 'editRegistration' as const, name: 'Editar/Criar Cadastro (Portaria)', description: 'Permissão para criar ou alterar dados cadastrais de moradores, visitantes ou prestadores' },
    { key: 'viewOnly' as const, name: 'Apenas Visualizar (Portaria)', description: 'Restrição de acesso a modo de leitura total na portaria (bloqueia edições e exclusões)' },
    { key: 'editDepartments' as const, name: 'Editar Departamentos/Categorias', description: 'Permissão para gerenciar e modificar departamentos de funcionários e categorias de visitantes' },
    { key: 'manageDevices' as const, name: 'Gerenciar e Acionar Dispositivos', description: 'Permissão para acionar portões/fechaduras e reiniciar controladoras de acesso Nice/HikCentral' },
  ];

  const activeRolePerms = rolePermsList[activeRoleIndex];
  const activeRoleMeta = activeRolePerms ? roleTitles[activeRolePerms.role] || { title: activeRolePerms.role, desc: '', color: 'var(--blue-500)', bg: 'rgba(59, 130, 246, 0.12)' } : null;

  return (
    <div className="page" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '25px' }}>
        <h1><Shield size={24} /> Matriz de Permissões</h1>
        <p>Configuração e gestão dinâmica de papéis de acesso e diretivas de segurança de rede do sistema.</p>
      </div>

      {loading && rolePermsList.length === 0 ? (
        <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
          <Loader2 className="animate-spin" size={24} style={{ marginRight: '10px' }} /> Carregando diretivas de segurança...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Tabs for Role Selection */}
          <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '1px', overflowX: 'auto' }}>
            {rolePermsList.map((item, index) => {
              const meta = roleTitles[item.role] || { title: item.role, color: 'var(--blue-500)' };
              const isActive = index === activeRoleIndex;
              return (
                <button
                  key={item.role}
                  onClick={() => setActiveRoleIndex(index)}
                  style={{
                    padding: '10px 20px',
                    background: 'none',
                    border: 'none',
                    borderBottom: isActive ? `3px solid ${meta.color}` : '3px solid transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: isActive ? 600 : 500,
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {meta.title}
                </button>
              );
            })}
          </div>

          {/* Active Role Configuration Section */}
          {activeRolePerms && activeRoleMeta && (
            <div className="settings-card" style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px', borderBottom: '1px solid var(--border-primary)', paddingBottom: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ padding: '10px', borderRadius: '10px', background: activeRoleMeta.bg, color: activeRoleMeta.color, display: 'inline-flex' }}>
                    <Users size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Configurando: {activeRoleMeta.title}</h3>
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>role key: <code>{activeRolePerms.role}</code></span>
                  </div>
                </div>
                
                <button
                  onClick={() => saveRolePermissions(activeRolePerms)}
                  disabled={savingRole !== null}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', background: activeRoleMeta.color, borderColor: activeRoleMeta.color }}
                >
                  {savingRole === activeRolePerms.role ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  Salvar Permissões do Papel
                </button>
              </div>

              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '15px 0' }}>
                {activeRoleMeta.desc}
              </p>

              {/* Modules Toggles List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                {modules.map(mod => {
                  const hasAccess = (activeRolePerms as any)[mod.key];
                  return (
                    <div
                      key={mod.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 20px',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)',
                        transition: 'border-color 0.2s'
                      }}
                    >
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--text-primary)' }}>{mod.name}</strong>
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>{mod.description}</span>
                      </div>

                      {/* Custom Switch Toggle */}
                      <div
                        onClick={() => handleTogglePermission(activeRolePerms.role, mod.key)}
                        style={{
                          width: '50px',
                          height: '26px',
                          borderRadius: '13px',
                          background: hasAccess ? activeRoleMeta.color : 'var(--bg-card)',
                          border: '1px solid var(--border-primary)',
                          position: 'relative',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease-in-out'
                        }}
                      >
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: '#ffffff',
                          position: 'absolute',
                          top: '2px',
                          left: hasAccess ? '26px' : '3px',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div style={{
            display: 'flex',
            gap: '12px',
            padding: '15px 20px',
            background: 'rgba(245, 158, 11, 0.06)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: 'var(--radius)',
            alignItems: 'flex-start'
          }}>
            <ShieldAlert size={20} style={{ color: 'var(--amber-500)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: 'var(--amber-500)', fontSize: '0.95rem' }}>Aviso de Segurança Crítico</strong>
              <p className="text-muted" style={{ margin: '5px 0 0', fontSize: '0.85rem', lineHeight: '1.5' }}>
                As permissões configuradas nesta matriz controlam as permissões de acesso em nível de rota e interface no painel administrativo master. Ao revogar permissões de um grupo de usuários, os módulos correspondentes serão imediatamente ocultados de sua barra de navegação e bloqueados contra acesso manual direto.
              </p>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
