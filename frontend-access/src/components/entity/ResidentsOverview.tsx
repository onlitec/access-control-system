import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EntityStatCard } from '@/components/entity/EntityStatCard';
import { HourlyTrendChart } from '@/components/entity/HourlyTrendChart';
import { getDashboardStats } from '@/db/api';
import type { DashboardStats } from '@/types';
import { Users, Home, TrendingUp, KeyRound } from 'lucide-react';

interface ResidentsOverviewProps {
  residents: any[];
  loading: boolean;
}

export function ResidentsOverview({ residents, loading }: ResidentsOverviewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((e) => console.error('Erro ao carregar estatísticas:', e))
      .finally(() => setStatsLoading(false));
  }, []);

  // Proprietário pode não residir: só quem tem is_resident conta como morador
  const owners = useMemo(
    () => residents.filter((r) => r.is_owner).length,
    [residents]
  );
  const residing = useMemo(
    () => residents.filter((r) => r.is_resident !== false).length,
    [residents]
  );
  const ownersNotResiding = useMemo(
    () => residents.filter((r) => r.is_owner && r.is_resident === false).length,
    [residents]
  );

  const byDepartment = useMemo(() => {
    const counts = new Map<string, number>();
    residents.forEach((r) => {
      const dep = r.department?.name || 'Sem departamento';
      counts.set(dep, (counts.get(dep) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [residents]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <EntityStatCard
          title="Moradores Cadastrados"
          value={stats?.totalResidents ?? residing}
          icon={<Users className="h-5 w-5 text-primary" />}
          loading={statsLoading && loading}
          highlight
        />
        <EntityStatCard
          title="No Condomínio Agora"
          value={stats?.insideResidents ?? 0}
          icon={<Home className="h-5 w-5 text-green-600" />}
          loading={statsLoading}
        />
        <EntityStatCard
          title="Proprietários"
          value={stats?.totalOwners ?? owners}
          icon={<KeyRound className="h-5 w-5 text-muted-foreground" />}
          loading={loading}
          subtitle={
            (stats?.totalOwners !== undefined && stats?.ownersResiding !== undefined)
              ? `${stats.totalOwners - stats.ownersResiding} não residem no condomínio`
              : `${ownersNotResiding} não residem no condomínio`
          }
        />
        <EntityStatCard
          title="Acessos Hoje (geral)"
          value={stats?.todayAccess ?? 0}
          icon={<TrendingUp className="h-5 w-5 text-muted-foreground" />}
          loading={statsLoading}
          linkTo="/acessos-hoje"
        />
      </div>

      <HourlyTrendChart
        title="Tendência de acessos hoje"
        data={stats?.hourlyAccess ?? []}
        loading={statsLoading}
      />

      {byDepartment.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Moradores por departamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {byDepartment.map(({ name, count }) => (
                <div key={name} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <span className="text-sm text-muted-foreground truncate">{name}</span>
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
