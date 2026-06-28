import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDashboardStats } from '@/db/api';
import type { DashboardStats, HikcentralConfig } from '@/types';
import { Users, UserCheck, Briefcase, Activity, TrendingUp, CheckCircle, Monitor } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getHikcentralConfig } from '@/db/api';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { GateControl } from '@/components/GateControl';

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

  const devicesOnline = stats?.onlineDevices ?? 0;
  const devicesTotal = stats?.totalDevices ?? 0;
  const devicesOffline = stats?.offlineDevices ?? 0;

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
            <Badge
              variant={config?.sync_enabled ? 'default' : 'secondary'}
              className={config?.sync_enabled ? 'bg-green-100 text-green-700 hover:bg-green-100 border-green-200' : ''}
            >
              {config?.sync_enabled ? 'Sincronização Ativa' : 'Sincronização Desativada'}
            </Badge>
          )}
        </div>
      </div>

      {/* Métricas operacionais — tempo real */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Tempo real</p>
        <div className="grid gap-4 md:grid-cols-3">
          <Link to="/visitas-ativas" className="block">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Visitas Ativas</CardTitle>
                <Activity className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-9 w-20 bg-muted" />
                ) : (
                  <div className="text-4xl font-bold tracking-tight">{stats?.activeVisits ?? 0}</div>
                )}
              </CardContent>
            </Card>
          </Link>

          <Link to="/acessos-hoje" className="block">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Acessos Hoje</CardTitle>
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-9 w-20 bg-muted" />
                ) : (
                  <div className="text-4xl font-bold tracking-tight">{stats?.todayAccess ?? 0}</div>
                )}
              </CardContent>
            </Card>
          </Link>

          <Link to="/devices-status" className="block">
            <Card className={!loading && devicesOffline > 0 ? 'border-destructive/30 bg-destructive/5' : ''}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Faciais Online</CardTitle>
                <Monitor className={`h-5 w-5 ${!loading && devicesOffline > 0 ? 'text-destructive' : 'text-green-500'}`} />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-9 w-20 bg-muted" />
                ) : (
                  <div className="text-4xl font-bold tracking-tight">
                    {devicesOnline}
                    <span className="text-lg font-normal text-muted-foreground">/{devicesTotal}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Cadastros */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Cadastros</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link to="/residents" className="block">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Moradores</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-7 w-16 bg-muted" /> : (
                  <div className="text-2xl font-bold">{stats?.totalResidents ?? 0}</div>
                )}
              </CardContent>
            </Card>
          </Link>

          <Link to="/visitors" className="block">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Visitantes</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-7 w-16 bg-muted" /> : (
                  <div className="text-2xl font-bold">{stats?.totalVisitors ?? 0}</div>
                )}
              </CardContent>
            </Card>
          </Link>

          <Link to="/providers" className="block">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Prestadores</CardTitle>
                <Briefcase className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-7 w-16 bg-muted" /> : (
                  <div className="text-2xl font-bold">{stats?.totalProviders ?? 0}</div>
                )}
              </CardContent>
            </Card>
          </Link>

          <Link to="/visitas-concluidas" className="block">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Visitas Concluídas</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-7 w-16 bg-muted" /> : (
                  <div className="text-2xl font-bold">{stats?.completedVisits ?? 0}</div>
                )}
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Gate Control — Nice Guarita IP */}
        <div className="mt-6">
          <GateControl />
        </div>
      </div>
    </div>
  );
}
