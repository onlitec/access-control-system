import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { getAccessEvents } from '@/db/api';
import {
  RefreshCw,
  Search,
  User,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle2,
  XCircle,
  TrendingUp
} from 'lucide-react';

export default function TodayAccessesPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadEvents();
  }, [page]);

  const loadEvents = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const result = await getAccessEvents(page, 50, {
        startDate: startOfDay.toISOString(),
      });
      setEvents(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('Erro ao carregar acessos de hoje:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os acessos de hoje',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return events;
    const s = search.toLowerCase();
    return events.filter((e) =>
      (e.personName || '').toLowerCase().includes(s) ||
      (e.deviceName || '').toLowerCase().includes(s) ||
      (e.unit || '').toLowerCase().includes(s)
    );
  }, [events, search]);

  const authorized = useMemo(() => events.filter((e) => e.status === 'authorized').length, [events]);
  const denied = useMemo(() => events.filter((e) => e.status === 'denied').length, [events]);
  const entries = useMemo(() => events.filter((e) => e.direction === 'in' || e.direction === 'entry').length, [events]);
  const exits = useMemo(() => events.filter((e) => e.direction === 'out' || e.direction === 'exit').length, [events]);

  const personTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      resident: 'Morador',
      visitor: 'Visitante',
      provider: 'Prestador',
      provider_condo: 'Prestador',
      provider_resident: 'Prestador',
      system: 'Sistema',
    };
    return labels[type?.toLowerCase()] || type || '-';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Acessos Hoje</h1>
          <p className="text-zinc-500 mt-1">
            Todos os eventos de acesso registrados hoje no condomínio
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => loadEvents()}
          disabled={loading}
          className="gap-2 rounded-xl"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Resumo do dia */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-primary shrink-0" />
            <div>
              <p className="text-2xl font-bold text-zinc-900">{loading ? '—' : total}</p>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Total de eventos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-zinc-900">{loading ? '—' : authorized}</p>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Autorizados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-500 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-zinc-900">{loading ? '—' : denied}</p>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Negados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-200 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex flex-col items-center shrink-0">
              <ArrowDownCircle className="h-4 w-4 text-green-600" />
              <ArrowUpCircle className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-zinc-900">
                {loading ? '—' : `${entries} / ${exits}`}
              </p>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Entradas / Saídas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <Card className="rounded-2xl border-zinc-200 shadow-sm">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Filtrar por nome, dispositivo ou unidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 bg-zinc-50 border-zinc-200 rounded-xl"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="rounded-2xl border-zinc-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-zinc-50 hover:bg-zinc-50 border-zinc-100">
              <TableHead className="pl-6 w-16"></TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Horário</TableHead>
              <TableHead>Dispositivo</TableHead>
              <TableHead>Direção</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-6"><Skeleton className="h-10 w-10 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16 text-zinc-500">
                  {events.length === 0
                    ? 'Nenhum acesso registrado hoje.'
                    : 'Nenhum resultado para a busca.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((event) => (
                <TableRow key={event.id} className="hover:bg-zinc-50 transition-colors border-zinc-100">
                  <TableCell className="pl-6 py-3">
                    <Avatar className="h-10 w-10 border border-zinc-200">
                      <AvatarImage src={event.photoUrl || undefined} alt={event.personName} />
                      <AvatarFallback className="bg-zinc-100 text-zinc-400">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-zinc-900">{event.personName || 'Desconhecido'}</div>
                    {event.unit && <div className="text-xs text-zinc-500">{event.unit}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs bg-white border-zinc-200 text-zinc-600">
                      {personTypeLabel(event.personType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-zinc-600">
                    {new Date(event.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600">{event.deviceName || '-'}</TableCell>
                  <TableCell>
                    {event.direction === 'in' || event.direction === 'entry' ? (
                      <span className="flex items-center gap-1.5 text-green-700 text-sm">
                        <ArrowDownCircle className="h-4 w-4" /> Entrada
                      </span>
                    ) : event.direction === 'out' || event.direction === 'exit' ? (
                      <span className="flex items-center gap-1.5 text-orange-600 text-sm">
                        <ArrowUpCircle className="h-4 w-4" /> Saída
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {event.status === 'authorized' ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Autorizado</Badge>
                    ) : event.status === 'denied' ? (
                      <Badge variant="destructive">Negado</Badge>
                    ) : (
                      <Badge variant="outline">{event.status || '-'}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-100">
            <span className="text-sm text-zinc-500">Página {page} de {totalPages} — {total} eventos</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
