import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AdminLayout from '@/components/AdminLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import IntegrationsPage from '@/pages/IntegrationsPage';
import PlaceholderPage from '@/pages/PlaceholderPage';
import SystemHealthPage from '@/pages/SystemHealthPage';
import BackupsPage from '@/pages/BackupsPage';
import SystemUsersPage from '@/pages/SystemUsersPage';
import AuditAccessPage from '@/pages/AuditAccessPage';
import CondominiumPage from '@/pages/CondominiumPage';
import ServicesPage from '@/pages/ServicesPage';
import SystemSettingsPage from '@/pages/SystemSettingsPage';
import LogsPage from '@/pages/LogsPage';
import AuditAdminPage from '@/pages/AuditAdminPage';
import PermissionsPage from '@/pages/PermissionsPage';
import ReportsPage from '@/pages/ReportsPage';
import AccessAreasPage from '@/pages/AccessAreasPage';
import DepartmentsPage from '@/pages/DepartmentsPage';
import JobFunctionsPage from '@/pages/JobFunctionsPage';
import OnboardingReviewPage from '@/pages/OnboardingReviewPage';
import VmsDevicesPage from '@/pages/VmsDevicesPage';
import VmsStoragePage from '@/pages/VmsStoragePage';
import NetworkDevicesPage from '@/pages/NetworkDevicesPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading, user } = useAuth();

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

    if (user?.role === 'operador_portaria') {
        window.location.href = '/painel/';
        return null;
    }

    return <AdminLayout>{children}</AdminLayout>;
}

function AppRoutes() {
    const { isAuthenticated, isLoading, user } = useAuth();

    if (isLoading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
            </div>
        );
    }

    if (isAuthenticated && user?.role === 'operador_portaria') {
        window.location.href = '/painel/';
        return null;
    }

    return (
        <Routes>
            <Route
                path="/admin/login"
                element={isAuthenticated ? <Navigate to="/admin" replace /> : <LoginPage />}
            />
            {/* Visão geral */}
            <Route path="/admin" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

            {/* Sistema */}
            <Route path="/admin/health" element={<ProtectedRoute><SystemHealthPage /></ProtectedRoute>} />
            <Route path="/admin/services" element={<ProtectedRoute><ServicesPage /></ProtectedRoute>} />
            <Route path="/admin/containers" element={<Navigate to="/admin/services" replace />} />
            <Route path="/admin/backups" element={<ProtectedRoute><BackupsPage /></ProtectedRoute>} />
            <Route path="/admin/logs" element={<ProtectedRoute><LogsPage /></ProtectedRoute>} />

            {/* Configurações */}
            <Route path="/admin/integrations" element={<ProtectedRoute><IntegrationsPage /></ProtectedRoute>} />
            <Route path="/admin/condominium" element={<ProtectedRoute><CondominiumPage /></ProtectedRoute>} />
            <Route path="/admin/system-users" element={<ProtectedRoute><SystemUsersPage /></ProtectedRoute>} />
            <Route path="/admin/permissions" element={<ProtectedRoute><PermissionsPage /></ProtectedRoute>} />
            <Route path="/admin/access-areas" element={<ProtectedRoute><AccessAreasPage /></ProtectedRoute>} />
            <Route path="/admin/departments" element={<ProtectedRoute><DepartmentsPage /></ProtectedRoute>} />
            <Route path="/admin/job-functions" element={<ProtectedRoute><JobFunctionsPage /></ProtectedRoute>} />
            <Route path="/admin/onboarding-review" element={<ProtectedRoute><OnboardingReviewPage /></ProtectedRoute>} />
            <Route path="/admin/system-settings" element={<ProtectedRoute><SystemSettingsPage /></ProtectedRoute>} />

            {/* VMS — Gerenciador de Imagens */}
            <Route path="/admin/vms-devices" element={<ProtectedRoute><VmsDevicesPage /></ProtectedRoute>} />
            <Route path="/admin/vms-storage" element={<ProtectedRoute><VmsStoragePage /></ProtectedRoute>} />

            {/* Dispositivos de Rede */}
            <Route path="/admin/network-devices" element={<ProtectedRoute><NetworkDevicesPage /></ProtectedRoute>} />

            {/* Auditoria */}
            <Route path="/admin/audit-access" element={<ProtectedRoute><AuditAccessPage /></ProtectedRoute>} />
            <Route path="/admin/audit-admin" element={<ProtectedRoute><AuditAdminPage /></ProtectedRoute>} />
            <Route path="/admin/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />

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
