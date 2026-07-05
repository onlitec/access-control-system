import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Inbox } from 'lucide-react';

export interface ListColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DashboardListPageProps<T> {
  title: string;
  subtitle: string;
  columns: ListColumn<T>[];
  fetchRows: () => Promise<T[]>;
  rowKey: (row: T, index: number) => string;
  emptyMessage: string;
}

/**
 * Página de listagem usada pelos drill-downs dos cards da dashboard
 * (Acessos Hoje, Moradores/Visitantes/Prestadores Presentes). A lista vem de
 * endpoints que usam exatamente o mesmo critério dos contadores dos cards.
 */
export default function DashboardListPage<T>({
  title, subtitle, columns, fetchRows, rowKey, emptyMessage,
}: DashboardListPageProps<T>) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchRows());
    } catch (e: any) {
      console.error(`Erro ao carregar "${title}":`, e);
      setError(e?.message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">{emptyMessage}</p>
              <p className="text-sm text-muted-foreground">A lista usa o mesmo critério do contador da dashboard.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    {columns.map(col => (
                      <th key={col.header} className={`px-4 py-3 font-semibold text-muted-foreground ${col.className ?? ''}`}>
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={rowKey(row, i)} className="border-b last:border-0 hover:bg-muted/30">
                      {columns.map(col => (
                        <td key={col.header} className={`px-4 py-3 ${col.className ?? ''}`}>
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && rows.length > 0 && (
        <p className="text-sm text-muted-foreground">{rows.length} registro(s)</p>
      )}
    </div>
  );
}
