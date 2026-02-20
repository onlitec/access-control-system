import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { AuthProvider } from '@/contexts/AuthContext';
import { RouteGuard } from '@/components/common/RouteGuard';
import { Toaster } from '@/components/ui/toaster';
import AppLayout from '@/components/layouts/AppLayout';
import routes from './routes';

// Componente para gerenciar o layout condicionalmente
function AppContent() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  return (
    <>
      <IntersectObserver />
      {isLoginPage ? (
        <Routes>
          {routes.map((route, index) => (
            <Route key={index} path={route.path} element={route.element} />
          ))}
        </Routes>
      ) : (
        <AppLayout>
          <Routes>
            {routes.map((route, index) => (
              <Route key={index} path={route.path} element={route.element} />
            ))}
          </Routes>
        </AppLayout>
      )}
      <Toaster />
    </>
  );
}

const App: React.FC = () => {
  return (
    <Router basename="/painel">
      <AuthProvider>
        <RouteGuard>
          <AppContent />
        </RouteGuard>
      </AuthProvider>
    </Router>
  );
};

export default App;
