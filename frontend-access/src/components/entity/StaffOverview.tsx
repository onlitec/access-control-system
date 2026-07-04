import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EntityStatCard } from '@/components/entity/EntityStatCard';
import { HourlyTrendChart } from '@/components/entity/HourlyTrendChart';
import { getDashboardStats } from '@/db/api';
import type { DashboardStats } from '@/types';
import { ShieldCheck, TrendingUp, Building2, CheckCircle2 } from 'lucide-react';

interface StaffOverviewProps {
  staff: any[];
  loading: boolean;
}

export function StaffOverview({ staff, loading }: StaffOverviewProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then(setStats)
      .catch((e) => console.error('Erro ao carregar estatísticas:', e))
      .finally(() => setStatsLoading(false));
  }, []);

  const synced = useMemo(
    () => staff.filter((p) => p.hikPersonId).length,
    [staff]
  );

  const byDepartment = useMemo(() => {
    const counts = new Map<string, number>();
    staff.forEach((p) => {
      const dep = p.department || 'Sem departamento';
      counts.set(dep, (counts.get(dep) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [staff]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <EntityStatCard
          title="Colaboradores Cadastrados"
          value={stats?.totalStaff ?? staff.length}
          icon={<ShieldCheck className="h-5 w-5 text-primary" />}
          loading={statsLoading && loading}
          highlight
        />
        <EntityStatCard
          title="Sincronizados HikCentral"
          value={synced}
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          loading={loading}
          subtitle={`${staff.length - synced} apenas locais`}
        />
        <EntityStatCard
          title="Departamentos"
          value={byDepartment.length}
          icon={<Building2 className="h-5 w-5 text-muted-foreground" />}
          loading={loading}
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
            <CardTitle className="text-sm font-medium">Colaboradores por departamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {byDepartment.map(([dep, count]) => (
                <div key={dep} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <span className="text-sm text-muted-foreground truncate">{dep}</span>
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
