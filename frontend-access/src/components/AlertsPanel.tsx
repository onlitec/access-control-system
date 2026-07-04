import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDashboardAlerts } from '@/db/api';
import type { DashboardAlert } from '@/types';
import { AlertTriangle, Ban, Repeat } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const KIND_VISUAL: Record<DashboardAlert['kind'], { icon: React.ReactNode; bg: string; label: string }> = {
  passback: { icon: <Repeat className="h-4 w-4" />, bg: 'bg-amber-50 text-amber-600', label: 'Anti-passback' },
  denied: { icon: <Ban className="h-4 w-4" />, bg: 'bg-red-100 text-red-700', label: 'Acesso negado' },
  alarm: { icon: <AlertTriangle className="h-4 w-4" />, bg: 'bg-red-100 text-red-700', label: 'Alarme' },
};

export function AlertsPanel({ refreshInterval = 30000 }: { refreshInterval?: number }) {
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      getDashboardAlerts(6)
        .then(setAlerts)
        .catch((e) => console.error('Erro ao carregar alertas:', e))
        .finally(() => setLoading(false));
    };
    load();
    const timer = setInterval(load, refreshInterval);
    return () => clearInterval(timer);
  }, [refreshInterval]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">Alertas Recentes</CardTitle>
        <Link to="/eventos" className="text-xs font-semibold text-red-600 hover:text-red-700">
          Ver todos
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full bg-zinc-100" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32 bg-zinc-100" />
                <Skeleton className="h-3 w-24 bg-zinc-100" />
              </div>
            </div>
          ))
        ) : alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum alerta recente</p>
        ) : (
          alerts.map((alert) => {
            const visual = KIND_VISUAL[alert.kind] ?? KIND_VISUAL.alarm;
            return (
              <div key={alert.id} className="flex items-start gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${visual.bg}`}>
                  {visual.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-red-600 truncate">{visual.label}</div>
                  <div className="text-xs text-zinc-600 truncate">{alert.description}</div>
                  {alert.deviceName && (
                    <div className="text-[10px] text-zinc-400 truncate">{alert.deviceName}</div>
                  )}
                </div>
                <span className="text-[10px] text-zinc-400 shrink-0 mt-0.5">
                  {formatDistanceToNow(new Date(alert.occurredAt), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
