import React, { useState } from 'react';
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
    Menu,
    X,
    Plug,
} from 'lucide-react';
import { avatarGradient } from '@/utils/avatarColor';

const menuSections = [
    {
        title: 'Visão Geral',
        items: [
            { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
        ],
    },
    {
        title: 'Gestão de Pessoas',
        items: [
            { to: '/admin/residents', icon: Users, label: 'Moradores', end: false },
            { to: '/admin/visitors', icon: UserCheck, label: 'Visitantes', end: false },
            { to: '/admin/providers', icon: Briefcase, label: 'Prestadores', end: false },
            { to: '/admin/internal-providers', icon: HardHat, label: 'Prestadores Internos', end: false },
        ],
    },
    {
        title: 'Segurança',
        items: [
            { to: '/admin/access-logs', icon: ClipboardList, label: 'Histórico de Acesso', end: false },
            { to: '/admin/session-audit', icon: ShieldAlert, label: 'Auditoria Sessão', end: false },
        ],
    },
    {
        title: 'Administração',
        items: [
            { to: '/admin/users', icon: UserCog, label: 'Usuários', end: false },
            { to: '/admin/integrations', icon: Plug, label: 'Integrações', end: false },
            { to: '/admin/settings', icon: Settings, label: 'Configurações', end: false },
        ],
    },
];

interface AdminLayoutProps {
    children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/admin/login');
    };

    const closeSidebar = () => setSidebarOpen(false);

    const userInitial = user?.name?.charAt(0)?.toUpperCase() || 'A';
    const userGradient = avatarGradient(user?.name || 'Admin');

    return (
        <div className="admin-layout">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="sidebar-overlay" onClick={closeSidebar} />
            )}

            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="logo-area">
                        <Shield size={28} />
                        <div>
                            <h1>Acesso</h1>
                            <span>Admin Panel</span>
                        </div>
                    </div>
                    <button className="sidebar-close-btn" onClick={closeSidebar} aria-label="Fechar menu">
                        <X size={20} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {menuSections.map((section, sectionIndex) => (
                        <div key={section.title} className="menu-section">
                            {sectionIndex > 0 && (
                                <div className="section-divider" />
                            )}
                            <div className="section-title">
                                {section.title}
                            </div>
                            {section.items.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    className={({ isActive }) =>
                                        `nav-item ${isActive ? 'active' : ''}`
                                    }
                                    onClick={closeSidebar}
                                >
                                    <item.icon size={20} />
                                    <span>{item.label}</span>
                                    <ChevronRight size={16} className="nav-arrow" />
                                </NavLink>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-info">
                        <div className="user-avatar" style={{ background: userGradient }}>
                            {userInitial}
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
                <div className="mobile-topbar">
                    <button
                        className="mobile-menu-btn"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Abrir menu"
                    >
                        <Menu size={22} />
                    </button>
                    <div className="mobile-logo">
                        <Shield size={20} />
                        <span>Acesso Admin</span>
                    </div>
                </div>
                {children}
            </main>
        </div>
    );
}
