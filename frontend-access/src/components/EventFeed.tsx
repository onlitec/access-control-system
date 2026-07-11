import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { getAccessEvents } from '@/db/api';
import { useEventStream, type SystemEvent } from '@/hooks/useEventStream';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  User, UserCheck, Briefcase, Package, DoorOpen, AlertTriangle,
  Monitor, Search, LogIn, LogOut, ShieldCheck
} from 'lucide-react';

// ── Filtros por categoria (pills) ─────────────────────────────────────────────
type FeedFilter = 'all' | 'residents' | 'visitors' | 'providers' | 'deliveries' | 'gates' | 'alarms';

const FILTERS: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'residents', label: 'Moradores' },
  { id: 'visitors', label: 'Visitantes' },
  { id: 'providers', label: 'Prestadores' },
  { id: 'deliveries', label: 'Entregas' },
  { id: 'gates', label: 'Portões' },
  { id: 'alarms', label: 'Alarmes' },
];

function filterToParams(filter: FeedFilter): Record<string, string> {
  switch (filter) {
    case 'residents': return { category: 'access', personType: 'resident' };
    case 'visitors': return { category: 'access', personType: 'visitor' };
    case 'providers': return { category: 'access', personType: 'provider_condo,provider_resident' };
    case 'deliveries': return { category: 'delivery' };
    case 'gates': return { category: 'gate' };
    case 'alarms': return { category: 'alarm' };
    default: return {};
  }
}

function eventMatchesFilter(event: SystemEvent, filter: FeedFilter): boolean {
  const params = filterToParams(filter);
  if (params.category && event.category !== params.category) return false;
  if (params.personType && !params.personType.split(',').includes(event.personType)) return false;
  return true;
}

// ── Aparência por categoria/tipo (tema claro, fundos suaves) ─────────────────
function eventVisual(event: SystemEvent): { icon: React.ReactNode; bg: string } {
  if (event.category === 'delivery') return { icon: <Package className="h-4 w-4" />, bg: 'bg-violet-50 text-violet-600' };
  if (event.category === 'gate') return { icon: <DoorOpen className="h-4 w-4" />, bg: 'bg-zinc-100 text-zinc-600' };
  if (event.category === 'alarm') return { icon: <AlertTriangle className="h-4 w-4" />, bg: 'bg-red-100 text-red-700' };
  if (event.category === 'device' || event.category === 'system') return { icon: <Monitor className="h-4 w-4" />, bg: 'bg-sky-50 text-sky-600' };
  if (event.status === 'denied') return { icon: <AlertTriangle className="h-4 w-4" />, bg: 'bg-red-100 text-red-700' };
  if (event.direction === 'out') return { icon: <LogOut className="h-4 w-4" />, bg: 'bg-emerald-50 text-emerald-600' };
  switch (event.personType) {
    case 'resident': return { icon: <LogIn className="h-4 w-4" />, bg: 'bg-red-50 text-red-600' };
    case 'visitor': return { icon: <UserCheck className="h-4 w-4" />, bg: 'bg-blue-50 text-blue-600' };
    case 'provider_condo':
    case 'provider_resident': return { icon: <Briefcase className="h-4 w-4" />, bg: 'bg-amber-50 text-amber-600' };
    case 'staff': return { icon: <ShieldCheck className="h-4 w-4" />, bg: 'bg-red-50 text-red-600' };
    default: return { icon: <LogIn className="h-4 w-4" />, bg: 'bg-emerald-50 text-emerald-600' };
  }
}

const PERSON_TYPE_LABEL: Record<string, string> = {
  resident: 'Morador',
  visitor: 'Visitante',
  provider_condo: 'Prestador',
  provider_resident: 'Prestador',
  staff: 'Funcionário',
  system: 'Sistema',
};

const SOURCE_LABEL: Record<string, string> = {
  hikcentral: 'HikCentral',
  guarita: 'Guarita IP',
  controle_rf: 'Controle RF',
  videoporteiro: 'Videoporteiro',
  qr_code: 'QR Code',
  manual: 'Cadastro manual',
};

function eventTitle(event: SystemEvent): { title: string; danger: boolean } {
  if (event.status === 'denied') return { title: `Acesso negado — ${event.personName}`, danger: true };
  if (event.category === 'gate') return { title: event.personName, danger: false };
  if (event.category === 'delivery') return { title: event.personName, danger: false };
  if (event.category === 'alarm') return { title: event.personName, danger: true };
  const verb = event.direction === 'out' ? 'saiu' : 'entrou';
  return { title: `${event.personName} ${verb}`, danger: false };
}

function statusBadge(status: string) {
  if (status === 'denied') return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Negado</Badge>;
  if (status === 'pending') return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pendente</Badge>;
  return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Autorizado</Badge>;
}

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return '';
  }
}

// ── Componente ────────────────────────────────────────────────────────────────
interface EventFeedProps {
  pageSize?: number;
  maxItems?: number;       // limite de itens mantidos na lista (tempo real)
  showFilters?: boolean;
  showSearch?: boolean;
  showDateFilters?: boolean; // filtros por ano, data e faixa de horário
  className?: string;
  onSeeAllHref?: string;   // link "Ver todos os eventos" (para o feed embutido)
}

/** Data local de hoje em YYYY-MM-DD (sem cair no fuso UTC do toISOString) */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function EventFeed({
  pageSize = 50,
  maxItems = 200,
  showFilters = true,
  showSearch = true,
  showDateFilters = false,
  className = '',
  onSeeAllHref
}: EventFeedProps) {
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [year, setYear] = useState('');
  const [date, setDate] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const filterRef = useRef(filter);
  filterRef.current = filter;

  // Faixa [início, fim] derivada dos filtros de ano/data/horário:
  //  - data escolhida → aquele dia (recortado pela faixa de horário, se houver)
  //  - só horário → hoje, naquela faixa
  //  - só ano → o ano inteiro
  const dateRange = useMemo((): { start?: Date; end?: Date } => {
    if (date || timeFrom || timeTo) {
      const day = date || localToday();
      return {
        start: new Date(`${day}T${timeFrom || '00:00'}:00`),
        end: new Date(`${day}T${timeTo || '23:59'}:59.999`),
      };
    }
    if (year) {
      const y = Number(year);
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999) };
    }
    return {};
  }, [year, date, timeFrom, timeTo]);
  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (targetPage: number, append: boolean) => {
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const filters: any = { ...filterToParams(filterRef.current) };
      if (debouncedSearch) filters.q = debouncedSearch;
      const range = dateRangeRef.current;
      if (range.start) filters.startDate = range.start.toISOString();
      if (range.end) filters.endDate = range.end.toISOString();
      const result = await getAccessEvents(targetPage, pageSize, filters);
      setTotalPages(result.totalPages || 1);
      setEvents(prev => append ? [...prev, ...(result.data || [])] : (result.data || []));
    } catch (e) {
      console.error('Erro ao carregar eventos:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearch, pageSize]);

  useEffect(() => {
    setPage(1);
    load(1, false);
  }, [filter, debouncedSearch, dateRange, load]);

  // Tempo real: prepend de eventos novos que casam com o filtro ativo
  useEventStream(useCallback((event: SystemEvent) => {
    if (!eventMatchesFilter(event, filterRef.current)) return;
    const range = dateRangeRef.current;
    const at = new Date(event.occurredAt);
    if (range.start && at < range.start) return;
    if (range.end && at > range.end) return;
    setEvents(prev => {
      if (prev.some(e => e.id === event.id)) return prev;
      return [event, ...prev].slice(0, maxItems);
    });
  }, [maxItems]));

  // Sempre do mais recente para o mais antigo, mesmo misturando página + tempo real
  const visibleEvents = useMemo(
    () => [...events].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
    [events]
  );

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const list: string[] = [];
    for (let y = current; y >= 2024; y--) list.push(String(y));
    return list;
  }, []);
  const hasDateFilter = !!(year || date || timeFrom || timeTo);

  return (
    <div className={className}>
      {(showFilters || showSearch) && (
        <div className="flex flex-col gap-3 mb-4">
          {showFilters && (
            <div className="flex flex-wrap gap-2">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`px-3.5 h-8 rounded-full text-xs font-semibold transition-all border ${
                    filter === f.id
                      ? 'bg-red-600 text-white border-red-600 shadow-sm'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {showSearch && (
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Buscar evento, pessoa, unidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10 bg-zinc-50 border-zinc-200 rounded-xl shadow-none focus:bg-white transition-all"
              />
            </div>
          )}
          {showDateFilters && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Ano</label>
                <select
                  value={year}
                  onChange={(e) => { setYear(e.target.value); if (e.target.value) setDate(''); }}
                  className="h-10 px-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-700 focus:bg-white transition-all"
                >
                  <option value="">Todos</option>
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Data</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); if (e.target.value) setYear(''); }}
                  className="h-10 w-40 bg-zinc-50 border-zinc-200 rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Das</label>
                <Input
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  className="h-10 w-28 bg-zinc-50 border-zinc-200 rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block">Até</label>
                <Input
                  type="time"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  className="h-10 w-28 bg-zinc-50 border-zinc-200 rounded-xl"
                />
              </div>
              {hasDateFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setYear(''); setDate(''); setTimeFrom(''); setTimeTo(''); }}
                  className="h-10 text-zinc-500 font-semibold"
                >
                  Limpar período
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="h-9 w-9 rounded-full bg-zinc-100" />
              <Skeleton className="h-11 w-11 rounded-full bg-zinc-100" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48 bg-zinc-100" />
                <Skeleton className="h-3 w-32 bg-zinc-100" />
              </div>
              <Skeleton className="h-5 w-20 bg-zinc-100" />
            </div>
          ))
        ) : visibleEvents.length === 0 ? (
          <div className="py-16 text-center text-zinc-400">
            <User className="h-10 w-10 mx-auto mb-3 text-zinc-200" />
            <p className="text-sm font-medium">Nenhum evento encontrado</p>
          </div>
        ) : (
          visibleEvents.map(event => {
            const visual = eventVisual(event);
            const { title, danger } = eventTitle(event);
            const personTypeLabel = PERSON_TYPE_LABEL[event.personType] || '';
            const sourceLabel = event.source ? (SOURCE_LABEL[event.source] || event.source) : null;
            const photo = event.photoUrl || event.picUri || undefined;
            return (
              <div key={event.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-50 transition-colors">
                <div className="flex flex-col items-center w-16 shrink-0">
                  <span className="text-[11px] font-semibold text-zinc-500">
                    {new Date(event.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="text-[10px] text-zinc-400 text-center leading-tight">{relativeTime(event.occurredAt)}</span>
                </div>
                <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${visual.bg}`}>
                  {visual.icon}
                </div>
                <Avatar className="h-11 w-11 border border-zinc-200 shrink-0">
                  <AvatarImage src={photo} alt={event.personName} />
                  <AvatarFallback className="bg-zinc-100 text-zinc-400">
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-sm truncate ${danger ? 'text-red-600' : 'text-zinc-900'}`}>
                    {title}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {[personTypeLabel, event.unit].filter(Boolean).join(' • ')}
                    {event.notes ? ` • ${event.notes}` : ''}
                  </div>
                </div>
                <div className="hidden md:flex flex-col items-end gap-1 shrink-0 text-right">
                  <span className="text-xs font-medium text-zinc-600 truncate max-w-[180px]">{event.deviceName || '-'}</span>
                  {sourceLabel && <span className="text-[10px] text-zinc-400">{sourceLabel}</span>}
                </div>
                <div className="shrink-0">{statusBadge(event.status)}</div>
              </div>
            );
          })
        )}

        {!loading && (onSeeAllHref ? (
          <Link to={onSeeAllHref} className="block text-center py-3 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-colors">
            Ver todos os eventos
          </Link>
        ) : page < totalPages ? (
          <div className="text-center py-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={loadingMore}
              onClick={() => { const next = page + 1; setPage(next); load(next, true); }}
              className="font-semibold text-zinc-600"
            >
              {loadingMore ? 'Carregando...' : 'Carregar mais eventos'}
            </Button>
          </div>
        ) : null)}
      </div>
    </div>
  );
}
