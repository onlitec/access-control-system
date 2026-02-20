import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDashboardStats } from '@/db/api';
import type { DashboardStats, HikcentralConfig } from '@/types';
import { Users, UserCheck, Briefcase, Activity, TrendingUp, CheckCircle, Monitor } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getHikcentralConfig } from '@/db/api';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [config, setConfig] = useState<HikcentralConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [statsData, configData] = await Promise.all([
        getDashboardStats(),
        getHikcentralConfig()
      ]);
      setStats(statsData);
      setConfig(configData);
    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total de Moradores',
      value: stats?.totalResidents || 0,
      icon: Users,
      color: 'text-primary',
      path: '/residents'
    },
    {
      title: 'Total de Visitantes',
      value: stats?.totalVisitors || 0,
      icon: UserCheck,
      color: 'text-chart-2',
      path: '/visitors'
    },
    {
      title: 'Visitas Ativas',
      value: stats?.activeVisits || 0,
      icon: Activity,
      color: 'text-chart-3',
      path: '/visitas-ativas'
    },
    {
      title: 'Visitas Concluídas',
      value: stats?.completedVisits || 0,
      icon: CheckCircle,
      color: 'text-success',
      path: '/visitas-concluidas'
    },
    {
      title: 'Prestadores Cadastrados',
      value: stats?.totalProviders || 0,
      icon: Briefcase,
      color: 'text-chart-4',
      path: '/providers'
    },
    {
      title: 'Prestadores em Atividade',
      value: 0, // Placeholder
      icon: Activity,
      color: 'text-chart-1',
      path: '/prestadores-atividade'
    },
    {
      title: 'Prestadores Serviços Finalizados',
      value: 0, // Placeholder
      icon: CheckCircle,
      color: 'text-muted-foreground',
      path: '/prestadores-finalizados'
    },
    {
      title: 'Acessos Hoje',
      value: stats?.todayAccess || 0,
      icon: TrendingUp,
      color: 'text-chart-5',
      path: '/acessos-hoje'
    },
    {
      title: 'Faciais Online/Offline',
      value: loading ? '...' : `${stats?.onlineDevices || 0}/${stats?.totalDevices || 0}`,
      icon: Monitor,
      color: !loading && stats?.offlineDevices && stats.offlineDevices > 0 ? 'text-destructive' : 'text-green-500',
      path: '/devices-status'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-muted-foreground">
            Visão geral do sistema de controle de acesso
          </p>
          {loading ? (
            <Skeleton className="h-5 w-24 bg-muted" />
          ) : (
            <Badge variant={config?.sync_enabled ? 'default' : 'secondary'} className={config?.sync_enabled ? 'bg-green-100 text-green-700 hover:bg-green-100 border-green-200' : ''}>
              {config?.sync_enabled ? 'Sincronização Ativa' : 'Sincronização Desativada'}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Link to={stat.path} key={stat.title} className="block">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-20 bg-muted" />
                ) : (
                  <div className="text-2xl font-bold">{stat.value}</div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bem-vindo ao Sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Este é o sistema de gestão de controle de acesso para condomínios.
            </p>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Gerencie moradores, visitantes e prestadores de serviços</li>
              <li>• Controle entradas e saídas em tempo real</li>
              <li>• Visualize histórico completo de acessos</li>
              <li>• Integração com Hikcentral 3.0.1</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Acesse rapidamente as funcionalidades principais:
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Link
                to="/residents"
                className="p-3 border rounded-lg hover:bg-accent transition-colors text-center text-sm font-medium"
              >
                Moradores
              </Link>
              <Link
                to="/visitors"
                className="p-3 border rounded-lg hover:bg-accent transition-colors text-center text-sm font-medium"
              >
                Visitantes
              </Link>
              <Link
                to="/providers"
                className="p-3 border rounded-lg hover:bg-accent transition-colors text-center text-sm font-medium"
              >
                Prestadores
              </Link>
              <Link
                to="/access-logs"
                className="p-3 border rounded-lg hover:bg-accent transition-colors text-center text-sm font-medium"
              >
                Histórico
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
