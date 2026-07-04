import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';

const TREND_COLOR = '#2563eb';

interface HourlyTrendChartProps {
  title: string;
  data: { hour: number; count: number }[];
  loading?: boolean;
  yLabel?: string;
}

const formatHour = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Rótulo apenas nos pontos com valor > 0 — rotular todos os pontos vira ruído. */
function PointLabel(props: any) {
  const { x, y, value } = props;
  if (!value || value <= 0) return null;
  return (
    <text x={x} y={y - 10} textAnchor="middle" fontSize={11} fill="#52525b">
      {value}
    </text>
  );
}

/**
 * Gráfico de tendência horária (área suave com gradiente), no estilo
 * "Tendência de visita hoje" do HikCentral Professional.
 */
export function HourlyTrendChart({ title, data, loading = false, yLabel = 'Número de pessoas' }: HourlyTrendChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{yLabel}</p>
      </CardHeader>
      <CardContent className="h-64 pt-2">
        {loading ? (
          <Skeleton className="h-full w-full bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 18, right: 12, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="hourly-trend-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TREND_COLOR} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={TREND_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#e4e4e7" strokeWidth={1} />
              <XAxis
                dataKey="hour"
                tickFormatter={formatHour}
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickLine={false}
                axisLine={{ stroke: '#e4e4e7' }}
                interval="preserveStartEnd"
                minTickGap={18}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                labelFormatter={(h: number) => formatHour(h)}
                formatter={(value: number) => [value, 'Pessoas']}
                cursor={{ stroke: '#a1a1aa', strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke={TREND_COLOR}
                strokeWidth={2}
                fill="url(#hourly-trend-fill)"
                dot={{ r: 3, fill: '#ffffff', stroke: TREND_COLOR, strokeWidth: 2 }}
                activeDot={{ r: 5, fill: TREND_COLOR, stroke: '#ffffff', strokeWidth: 2 }}
                label={<PointLabel />}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
