import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AdminLayout from '@/components/AdminLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ResidentsPage from '@/pages/ResidentsPage';
import VisitorsPage from '@/pages/VisitorsPage';
import ProvidersPage from '@/pages/ProvidersPage';
import CalabasasProvidersPage from '@/pages/CalabasasProvidersPage';
import AccessLogsPage from '@/pages/AccessLogsPage';
import UsersPage from '@/pages/UsersPage';
import SettingsPage from '@/pages/SettingsPage';
import SessionAuditPage from '@/pages/SessionAuditPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/admin/login" replace />;
    }

    return <AdminLayout>{children}</AdminLayout>;
}

function AppRoutes() {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <Routes>
            <Route
                path="/admin/login"
                element={isAuthenticated ? <Navigate to="/admin" replace /> : <LoginPage />}
            />
            {/* Dashboard */}
            <Route path="/admin" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

            {/* ===== 5 MENUS PRINCIPAIS ===== */}
            {/* 1. Moradores — departamento MORADORES (org 7) no HikCentral */}
            <Route path="/admin/residents" element={<ProtectedRoute><ResidentsPage /></ProtectedRoute>} />

            {/* 2. Visitantes — grupo VISITANTES no módulo visitor do HikCentral */}
            <Route path="/admin/visitors" element={<ProtectedRoute><VisitorsPage /></ProtectedRoute>} />

            {/* 3. Prestadores — grupo PRESTADORES no módulo visitor do HikCentral (cadastrados pelos moradores) */}
            <Route path="/admin/providers" element={<ProtectedRoute><ProvidersPage /></ProtectedRoute>} />

            {/* 4. P. Calabasas — departamento PRESTADORES (org 3), são prestadores permanentes do condomínio */}
            <Route path="/admin/calabasas-providers" element={<ProtectedRoute><CalabasasProvidersPage /></ProtectedRoute>} />

            {/* 5. Histórico de Acesso */}
            <Route path="/admin/access-logs" element={<ProtectedRoute><AccessLogsPage /></ProtectedRoute>} />

            {/* ===== MENUS ADMINISTRATIVOS ===== */}
            <Route path="/admin/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
            <Route path="/admin/session-audit" element={<ProtectedRoute><SessionAuditPage /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
    );
}

const App = () => {
    return (
        <Router>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </Router>
    );
};

export default App;
