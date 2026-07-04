import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface EntityStatCardProps {
  title: string;
  value: ReactNode;
  icon: ReactNode;
  loading?: boolean;
  linkTo?: string;
  highlight?: boolean;
  subtitle?: string;
  /** Variação percentual vs período anterior (verde ↑ / vermelho ↓). */
  deltaPct?: number | null;
  deltaLabel?: string;
}

export function EntityStatCard({
  title,
  value,
  icon,
  loading = false,
  linkTo,
  highlight = false,
  subtitle,
  deltaPct,
  deltaLabel = 'vs ontem'
}: EntityStatCardProps) {
  const card = (
    <Card className={`h-full ${highlight ? 'border-primary/20 bg-primary/5' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-20 bg-muted" />
        ) : (
          <div className="text-4xl font-bold tracking-tight">{value}</div>
        )}
        {typeof deltaPct === 'number' && !loading && (
          <p className={`text-xs font-semibold mt-1 ${deltaPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {deltaPct >= 0 ? '↑' : '↓'} {Math.abs(deltaPct)}% {deltaLabel}
          </p>
        )}
        {subtitle && !loading && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} className="block h-full">
        {card}
      </Link>
    );
  }
  return card;
}
