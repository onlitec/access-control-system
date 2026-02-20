import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AdminLayout from '@/components/AdminLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ResidentsPage from '@/pages/ResidentsPage';
import VisitorsPage from '@/pages/VisitorsPage';
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
            <Route path="/admin" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/admin/residents" element={<ProtectedRoute><ResidentsPage /></ProtectedRoute>} />
            <Route path="/admin/visitors" element={<ProtectedRoute><VisitorsPage /></ProtectedRoute>} />
            <Route path="/admin/access-logs" element={<ProtectedRoute><AccessLogsPage /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
            <Route path="/admin/session-audit" element={<ProtectedRoute><SessionAuditPage /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
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
