import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDashboardStats } from '@/db/api';
import type { DashboardStats } from '@/types';
import {
  Users, UserCheck, Briefcase, TrendingUp, Building2,
  UserPlus, FileEdit, Package, CheckCircle
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { GateControl } from '@/components/GateControl';
import { useAuth } from '@/contexts/AuthContext';
import { useGuaritaPassback } from '@/hooks/useGuaritaPassback';
import { PassbackAlertBanner } from '@/components/PassbackAlertBanner';
import { EventFeed } from '@/components/EventFeed';
import { AlertsPanel } from '@/components/AlertsPanel';
import { CamerasPanel } from '@/components/CamerasPanel';
import { EntityStatCard } from '@/components/entity/EntityStatCard';
import { HourlyTrendChart } from '@/components/entity/HourlyTrendChart';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const OCCUPANCY_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

export default function DashboardPage() {
  const { user } = useAuth();
  const canRegister = !!(user?.permissions?.editRegistration);
  const { alerts: passbackAlerts, release: releasePassback, dismiss: dismissPassback } = useGuaritaPassback();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    loadStats();
    const statsTimer = setInterval(loadStats, 60_000);
    const clockTimer = setInterval(() => setClock(new Date()), 1_000);
    return () => { clearInterval(statsTimer); clearInterval(clockTimer); };
  }, []);

  const loadStats = async () => {
    try {
      const statsData = await getDashboardStats();
      setStats(statsData);
    } catch (error) {
      console.error('Erro ao carregar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const devicesOnline = stats?.onlineDevices ?? 0;
  const devicesOffline = stats?.offlineDevices ?? 0;
  const systemOk = loading || devicesOffline === 0;

  const insideResidents = stats?.insideResidents ?? 0;
  const insideVisitors = stats?.insideVisitors ?? 0;
  const insideProviders = stats?.insideProviders ?? 0;
  const insideStaff = stats?.insideStaff ?? 0;
  const insideTotal = insideResidents + insideVisitors + insideProviders + insideStaff;

  const occupancyData = [
    { name: 'Moradores', value: insideResidents },
    { name: 'Visitantes', value: insideVisitors },
    { name: 'Prestadores', value: insideProviders },
    { name: 'Funcionários', value: insideStaff },
  ];
  const occupancyChartData = occupancyData.filter(d => d.value > 0);

  const hourlyData = (stats?.hourlyAccess ?? []).filter((_, i) => i <= new Date().getHours());

  return (
    <div className="space-y-6">
      {/* Alertas de Anti-Passagem Dupla — visível para todos os operadores */}
      <PassbackAlertBanner
        alerts={passbackAlerts}
        onRelease={releasePassback}
        onDismiss={dismissPassback}
      />

      {/* Header — Centro de Operações */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Centro de Operações • Visão geral em tempo real</p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
            systemOk
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${systemOk ? 'bg-emerald-500' : 'bg-red-600'} animate-pulse`} />
            {systemOk ? 'Sistema operando normalmente' : `${devicesOffline} dispositivo(s) offline`}
          </span>
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-zinc-800 tabular-nums">
              {clock.toLocaleTimeString('pt-BR')}
            </div>
            <div className="text-[11px] text-zinc-400">
              {clock.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs — linha de 5 */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <EntityStatCard
          title="Acessos Hoje"
          value={stats?.todayAccess ?? 0}
          icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
          loading={loading}
          linkTo="/acessos-hoje"
          highlight
          deltaPct={stats?.accessDeltaPct ?? undefined}
        />
        <EntityStatCard
          title="Moradores Presentes"
          value={insideResidents}
          icon={<Users className="h-5 w-5 text-red-600" />}
          loading={loading}
          subtitle={stats?.occupiedUnits ? `Unidades: ${stats.occupiedUnits}` : undefined}
        />
        <EntityStatCard
          title="Visitantes Presentes"
          value={insideVisitors}
          icon={<UserCheck className="h-5 w-5 text-blue-600" />}
          loading={loading}
          linkTo="/visitas-ativas"
          subtitle={`Cadastrados: ${stats?.totalVisitors ?? 0}`}
        />
        <EntityStatCard
          title="Prestadores Presentes"
          value={insideProviders}
          icon={<Briefcase className="h-5 w-5 text-amber-600" />}
          loading={loading}
          linkTo="/prestadores-atividade"
        />
        <EntityStatCard
          title="Entregas a Retirar"
          value={stats?.pendingDeliveries ?? 0}
          icon={<Package className="h-5 w-5 text-violet-600" />}
          loading={loading}
          linkTo="/entregas?tab=lista"
          subtitle="Aguardando retirada pelo morador"
        />
      </div>

      {/* Cockpit: feed central + coluna lateral */}
      <div className="grid gap-6 xl:grid-cols-3 items-start">
        {/* Coluna central — Eventos em Tempo Real */}
        <div className="xl:col-span-2 space-y-6">
          <Card className="rounded-2xl border-zinc-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-3">
                Eventos em Tempo Real
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-[10px] font-bold uppercase tracking-wider">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
                  Ao vivo
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EventFeed pageSize={20} maxItems={50} onSeeAllHref="/eventos" />
            </CardContent>
          </Card>

          <HourlyTrendChart
            title="Acessos por hora hoje"
            data={hourlyData}
            loading={loading}
            yLabel="Número de acessos"
          />
        </div>

        {/* Coluna direita — presença, dispositivos, alertas, câmeras */}
        <div className="space-y-6">
          {/* Presença no Condomínio */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Presença no Condomínio</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-40">
                  <Skeleton className="h-32 w-32 rounded-full bg-muted" />
                </div>
              ) : insideTotal === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                  <Building2 className="h-10 w-10 opacity-20" />
                  <span>Nenhuma presença registrada hoje</span>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0" style={{ width: 130, height: 130 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={occupancyChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={60}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {occupancyChartData.map((_, index) => (
                            <Cell key={index} fill={OCCUPANCY_COLORS[index % OCCUPANCY_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [value, name]}
                          contentStyle={{ fontSize: 12, borderRadius: 6 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-bold">{insideTotal}</span>
                      <span className="text-[10px] text-muted-foreground">presentes</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-xs flex-1">
                    {occupancyData.map((d, i) => (
                      <span key={d.name} className="flex items-center gap-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: OCCUPANCY_COLORS[i] }} />
                        <span className="text-zinc-500 flex-1">{d.name}</span>
                        <strong className="text-zinc-800">{d.value}</strong>
                      </span>
                    ))}
                    {typeof stats?.occupiedUnits === 'number' && (
                      <span className="text-[11px] text-zinc-400 mt-1 border-t border-zinc-100 pt-2">
                        Unidades ocupadas: {stats.occupiedUnits}{stats.totalUnits ? ` de ${stats.totalUnits}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dispositivos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Dispositivos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
                  </div>
                  <div className="text-2xl font-bold text-zinc-900 mt-0.5">{loading ? '—' : devicesOnline}</div>
                </div>
                <div className={`rounded-lg border px-3 py-2.5 ${devicesOffline > 0 ? 'border-red-200 bg-red-50/60' : 'border-zinc-200 bg-zinc-50/60'}`}>
                  <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${devicesOffline > 0 ? 'text-red-700' : 'text-zinc-500'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${devicesOffline > 0 ? 'bg-red-600' : 'bg-zinc-300'}`} /> Offline
                  </div>
                  <div className="text-2xl font-bold text-zinc-900 mt-0.5">{loading ? '—' : devicesOffline}</div>
                </div>
              </div>
              <Link
                to="/devices-status"
                className="block text-center py-2 rounded-lg bg-zinc-50 border border-zinc-200 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 transition-colors"
              >
                Ver todos os dispositivos
              </Link>
            </CardContent>
          </Card>

          {/* Alertas Recentes */}
          <AlertsPanel />

          {/* Câmeras Principais */}
          <CamerasPanel maxCameras={3} />

          {/* Portões — Nice Guarita IP */}
          <GateControl />
        </div>
      </div>

      {/* Ações rápidas — visível apenas para operadores com editRegistration */}
      {canRegister && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Ações rápidas</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Link to="/residents?action=new" className="block group">
              <Card className="border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Cadastrar Morador</CardTitle>
                  <UserPlus className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Registrar novo morador no sistema com dados e foto.</p>
                </CardContent>
              </Card>
            </Link>

            <Link to="/residents" className="block group">
              <Card className="hover:bg-muted/40 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Editar Moradores</CardTitle>
                  <FileEdit className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Atualizar dados de moradores já cadastrados.</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      )}

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
      </div>
    </div>
  );
}
