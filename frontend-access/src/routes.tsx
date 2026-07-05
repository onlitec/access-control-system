import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import LoginPage from './pages/LoginPage';
import FirstSetupPage from './pages/FirstSetupPage';
import DashboardPage from './pages/DashboardPage';
import ResidentsPage from './pages/ResidentsPage';
import VisitorsPage from './pages/VisitorsPage';
import ServiceProvidersPage from './pages/ServiceProvidersPage';
import StaffPage from './pages/StaffPage';
import AccessLogsPage from './pages/AccessLogsPage';
import EventsCenterPage from './pages/EventsCenterPage';
import DeliveriesPage from './pages/DeliveriesPage';
import HikcentralConfigPage from './pages/HikcentralConfigPage';
import AdminUsersPage from './pages/AdminUsersPage';
import ResidentSelfService from './pages/ResidentSelfService';
import NotFound from './pages/NotFound';
import ActiveVisitsPage from './pages/ActiveVisitsPage';
import CompletedVisitsPage from './pages/CompletedVisitsPage';
import ActiveProvidersPage from './pages/ActiveProvidersPage';
import FinishedProvidersPage from './pages/FinishedProvidersPage';
import TodayAccessesPage from './pages/TodayAccessesPage';
import PresentResidentsPage from './pages/PresentResidentsPage';
import DeviceStatusPage from './pages/DeviceStatusPage';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
}

const routes: RouteConfig[] = [
  {
    name: 'Login',
    path: '/login',
    element: <LoginPage />,
    visible: false
  },
  {
    name: 'Configuração Inicial',
    path: '/setup',
    element: <FirstSetupPage />,
    visible: false
  },
  {
    name: 'Home',
    path: '/',
    element: <Navigate to="/dashboard" replace />,
    visible: false
  },
  {
    name: 'Dashboard',
    path: '/dashboard',
    element: <DashboardPage />
  },
  {
    name: 'Moradores',
    path: '/residents',
    element: <ResidentsPage />
  },
  {
    name: 'Visitantes',
    path: '/visitors',
    element: <VisitorsPage />
  },
  {
    name: 'Prestadores',
    path: '/providers',
    element: <ServiceProvidersPage />
  },
  {
    name: 'Funcionários',
    path: '/staff',
    element: <StaffPage />
  },

  { name: 'Entregas', path: '/entregas', element: <DeliveriesPage /> },
  { name: 'Central de Eventos', path: '/eventos', element: <EventsCenterPage /> },
  { name: 'Histórico de Acesso', path: '/access-logs', element: <AccessLogsPage /> },
  { name: 'Visitas Ativas', path: '/visitas-ativas', element: <ActiveVisitsPage /> },
  { name: 'Visitas Concluídas', path: '/visitas-concluidas', element: <CompletedVisitsPage /> },
  { name: 'Prestadores em Atividade', path: '/prestadores-atividade', element: <ActiveProvidersPage /> },
  { name: 'Prestadores Finalizados', path: '/prestadores-finalizados', element: <FinishedProvidersPage /> },
  { name: 'Acessos Hoje', path: '/acessos-hoje', element: <TodayAccessesPage /> },
  { name: 'Moradores Presentes', path: '/moradores-presentes', element: <PresentResidentsPage /> },
  { name: 'Status Dispositivos', path: '/devices-status', element: <DeviceStatusPage /> },
  { name: 'Configuração Hikcentral', path: '/hikcentral-config', element: <HikcentralConfigPage /> },
  {
    name: 'Gerenciar Usuários',
    path: '/admin/users',
    element: <AdminUsersPage />
  },
  {
    name: 'Portal do Morador',
    path: '/setup/:id',
    element: <ResidentSelfService />,
    visible: false
  },
  {
    name: 'Not Found',
    path: '*',
    element: <NotFound />,
    visible: false
  }
];

export default routes;
