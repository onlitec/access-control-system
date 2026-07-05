import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
    LayoutDashboard,
    Activity,
    Box,
    Database,
    FileText,
    Plug,
    Building,
    Users,
    Shield,
    ClipboardList,
    List,
    BarChart3,
    LogOut,
    ChevronRight,
    Menu,
    X,
    Sun,
    Moon,
    KeyRound,
    Layers,
    Settings,
    UserCheck,
} from 'lucide-react';
import { avatarGradient } from '@/utils/avatarColor';

const menuSections = [
    {
        title: 'Visão geral',
        items: [
            { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
        ],
    },
    {
        title: 'Sistema',
        items: [
            { to: '/admin/health', icon: Activity, label: 'Saúde do sistema', end: false },
            { to: '/admin/services', icon: Box, label: 'Serviços', end: false },
            { to: '/admin/backups', icon: Database, label: 'Backups', end: false },
            { to: '/admin/logs', icon: FileText, label: 'Logs do sistema', end: false },
        ],
    },
    {
        title: 'Configurações',
        items: [
            { to: '/admin/integrations', icon: Plug, label: 'Integrações', end: false },
            { to: '/admin/condominium', icon: Building, label: 'Condomínio', end: false },
            { to: '/admin/departments', icon: Layers, label: 'Departamentos', end: false },
            { to: '/admin/access-areas', icon: KeyRound, label: 'Áreas de Acesso', end: false },
            { to: '/admin/system-users', icon: Users, label: 'Usuários do sistema', end: false },
            { to: '/admin/permissions', icon: Shield, label: 'Permissões', end: false },
            { to: '/admin/system-settings', icon: Settings, label: 'Sistema (SMTP/Updates)', end: false },
        ],
    },
    {
        title: 'Auditoria',
        items: [
            { to: '/admin/onboarding-review', icon: UserCheck, label: 'Aprovação Facial', end: false },
            { to: '/admin/audit-access', icon: ClipboardList, label: 'Logs de acesso', end: false },
            { to: '/admin/audit-admin', icon: List, label: 'Logs administrativos', end: false },
            { to: '/admin/reports', icon: BarChart3, label: 'Relatórios', end: false },
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
    const [theme, setTheme] = useState<'dark' | 'light'>(() => {
        const saved = localStorage.getItem('admin_theme');
        if (saved === 'light') {
            document.documentElement.classList.add('light');
            return 'light';
        }
        return 'dark';
    });

    const toggleTheme = () => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(nextTheme);
        localStorage.setItem('admin_theme', nextTheme);
        if (nextTheme === 'light') {
            document.documentElement.classList.add('light');
        } else {
            document.documentElement.classList.remove('light');
        }
    };

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
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="theme-toggle-btn" onClick={toggleTheme} title="Alternar tema">
                            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                        </button>
                        <button className="logout-btn" onClick={handleLogout} title="Sair">
                            <LogOut size={18} />
                        </button>
                    </div>
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
