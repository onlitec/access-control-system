import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EntityStatCard } from '@/components/entity/EntityStatCard';
import { HourlyTrendChart } from '@/components/entity/HourlyTrendChart';
import { getDashboardStats } from '@/db/api';
import type { DashboardStats } from '@/types';
import { Briefcase, Activity, Wrench, CalendarClock } from 'lucide-react';

interface ProvidersOverviewProps {
  providers: any[];
  loading: boolean;
}

export function ProvidersOverview({ providers, loading }: ProvidersOverviewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((e) => console.error('Erro ao carregar estatísticas:', e))
      .finally(() => setStatsLoading(false));
  }, []);

  const fixed = useMemo(
    () => providers.filter((p) => p.provider_type === 'fixed').length,
    [providers]
  );

  const byServiceType = useMemo(() => {
    const counts = new Map<string, number>();
    providers.forEach((p) => {
      const type = p.service_type || 'Sem tipo';
      counts.set(type, (counts.get(type) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [providers]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <EntityStatCard
          title="Prestadores Cadastrados"
          value={stats?.totalProviders ?? providers.length}
          icon={<Briefcase className="h-5 w-5 text-primary" />}
          loading={statsLoading && loading}
          highlight
        />
        <EntityStatCard
          title="Em Atividade Agora"
          value={stats?.insideProviders ?? 0}
          icon={<Activity className="h-5 w-5 text-green-600" />}
          loading={statsLoading}
          linkTo="/prestadores-atividade"
        />
        <EntityStatCard
          title="Fixos"
          value={fixed}
          icon={<Wrench className="h-5 w-5 text-muted-foreground" />}
          loading={loading}
          subtitle={`${providers.length - fixed} eventuais na lista`}
        />
        <EntityStatCard
          title="Agendamentos na Lista"
          value={providers.length}
          icon={<CalendarClock className="h-5 w-5 text-muted-foreground" />}
          loading={loading}
        />
      </div>

      <HourlyTrendChart
        title="Tendência de acessos hoje"
        data={stats?.hourlyAccess ?? []}
        loading={statsLoading}
      />

      {byServiceType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Prestadores por tipo de serviço</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {byServiceType.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <span className="text-sm text-muted-foreground truncate">{type}</span>
                  <span className="text-xl font-bold ml-2">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
