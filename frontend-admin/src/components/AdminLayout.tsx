import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
    LayoutDashboard,
    Users,
    UserCheck,
    ClipboardList,
    Settings,
    LogOut,
    Shield,
    ChevronRight,
    UserCog,
    ShieldAlert,
    Briefcase,
    HardHat,
} from 'lucide-react';

/**
 * Menus principais do painel administrativo.
 * Os 5 menus primários correspondem às seções operacionais:
 *  1. Dashboard      — visão geral e métricas do sistema
 *  2. Moradores      — pessoas no departamento MORADORES (org 7) do HikCentral
 *  3. Visitantes     — visitantes do grupo VISITANTES no módulo visitor do HikCentral
 *  4. Prestadores    — prestadores do grupo PRESTADORES no módulo visitor do HikCentral
 *  5. P. Calabasas   — prestadores permanentes do departamento PRESTADORES (org 3) do HikCentral
 *  6. Histórico      — histórico de eventos de acesso
 */
const navItems = [
    { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/admin/residents', icon: Users, label: 'Moradores' },
    { to: '/admin/visitors', icon: UserCheck, label: 'Visitantes' },
    { to: '/admin/providers', icon: Briefcase, label: 'Prestadores' },
    { to: '/admin/calabasas-providers', icon: HardHat, label: 'P. Calabasas' },
    { to: '/admin/access-logs', icon: ClipboardList, label: 'Histórico de Acesso' },
];

// Menus administrativos (separados visualmente)
const adminNavItems = [
    { to: '/admin/users', icon: UserCog, label: 'Usuários' },
    { to: '/admin/session-audit', icon: ShieldAlert, label: 'Auditoria Sessão' },
    { to: '/admin/settings', icon: Settings, label: 'Configurações' },
];

interface AdminLayoutProps {
    children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/admin/login');
    };

    return (
        <div className="admin-layout">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="logo-area">
                        <Shield size={28} />
                        <div>
                            <h1>Calabasas</h1>
                            <span>Admin Panel</span>
                        </div>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                                `nav-item ${isActive ? 'active' : ''}`
                            }
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                            <ChevronRight size={16} className="nav-arrow" />
                        </NavLink>
                    ))}

                    <div className="nav-divider" style={{ margin: '8px 12px', borderBottom: '1px solid var(--border)', opacity: 0.5 }} />

                    {adminNavItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) =>
                                `nav-item nav-item-sm ${isActive ? 'active' : ''}`
                            }
                        >
                            <item.icon size={18} />
                            <span>{item.label}</span>
                            <ChevronRight size={14} className="nav-arrow" />
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar">
                            {user?.name?.charAt(0)?.toUpperCase() || 'A'}
                        </div>
                        <div className="user-details">
                            <span className="user-name">{user?.name || 'Admin'}</span>
                            <span className="user-role">{user?.role || 'ADMIN'}</span>
                        </div>
                    </div>
                    <button className="logout-btn" onClick={handleLogout} title="Sair">
                        <LogOut size={18} />
                    </button>
                </div>
            </aside>

            <main className="main-content">
                {children}
            </main>
        </div>
    );
}
