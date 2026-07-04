import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EntityStatCard } from '@/components/entity/EntityStatCard';
import { HourlyTrendChart } from '@/components/entity/HourlyTrendChart';
import { getDashboardStats } from '@/db/api';
import type { DashboardStats } from '@/types';
import { Users, Activity, CheckCircle2, CalendarClock } from 'lucide-react';

interface VisitorsOverviewProps {
  visitors: any[];
  loading: boolean;
}

export function VisitorsOverview({ visitors, loading }: VisitorsOverviewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((e) => console.error('Erro ao carregar estatísticas:', e))
      .finally(() => setStatsLoading(false));
  }, []);

  const byStatus = useMemo(() => {
    const counts = new Map<string, number>();
    visitors.forEach((v) => {
      const status = v.appoint_status_text || 'Agendado';
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [visitors]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <EntityStatCard
          title="Visitantes Cadastrados"
          value={stats?.totalVisitors ?? visitors.length}
          icon={<Users className="h-5 w-5 text-primary" />}
          loading={statsLoading && loading}
          highlight
        />
        <EntityStatCard
          title="No Condomínio Agora"
          value={stats?.activeVisits ?? 0}
          icon={<Activity className="h-5 w-5 text-green-600" />}
          loading={statsLoading}
          linkTo="/visitas-ativas"
        />
        <EntityStatCard
          title="Visitas Concluídas"
          value={stats?.completedVisits ?? 0}
          icon={<CheckCircle2 className="h-5 w-5 text-muted-foreground" />}
          loading={statsLoading}
          linkTo="/visitas-concluidas"
        />
        <EntityStatCard
          title="Agendamentos na Lista"
          value={visitors.length}
          icon={<CalendarClock className="h-5 w-5 text-muted-foreground" />}
          loading={loading}
        />
      </div>

      <HourlyTrendChart
        title="Tendência de visita hoje"
        data={stats?.hourlyAccess ?? []}
        loading={statsLoading}
      />

      {byStatus.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Visitas por status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {byStatus.map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <span className="text-sm text-muted-foreground">{status}</span>
                  <span className="text-xl font-bold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
