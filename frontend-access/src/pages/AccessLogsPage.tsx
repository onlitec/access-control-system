import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getAccessEvents } from '@/db/api';
import { Filter, ArrowUpCircle, ArrowDownCircle, Download, FileText, Search, User, Camera, Calendar, LogOut } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AccessLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [personType, setPersonType] = useState<string>('all');
  const [personName, setPersonName] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState('');
  const [deviceName, setDeviceName] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const { toast } = useToast();

  useEffect(() => {
    loadLogs();
  }, [page, personType, startDate, endDate]);

  const loadLogs = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      
      const filters: any = {};
      if (personType !== 'all') filters.personType = personType;
      if (startDate) filters.startDate = new Date(startDate).toISOString();
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filters.endDate = end.toISOString();
      }
      if (personName) filters.personName = personName;
      if (deviceName) filters.deviceName = deviceName;

      const result = await getAccessEvents(page, 50, filters);
      setLogs(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotal(result.total || 0);
    } catch (error) {
      console.error('Erro ao carregar eventos:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os registros',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadLogs();
  };

  const exportCSV = () => {
    if (logs.length === 0) {
      toast({ title: 'Aviso', description: 'Nenhum dado para exportar.' });
      return;
    }

    const headers = ['Data/Hora', 'Nome', 'Tipo', 'Dispositivo', 'Direção', 'Status'];
    const rows = logs.map(log => [
      new Date(log.occurredAt || log.eventTime).toLocaleString('pt-BR'),
      log.personName || 'Desconhecido',
      getPersonTypeLabel(log.personType),
      log.deviceName || log.doorName || '-',
      log.direction === 'entry' ? 'Entrada' : (log.direction === 'exit' ? 'Saída' : 'Desconhecido'),
      log.status === 'authorized' ? 'Autorizado' : 'Negado'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio-acessos-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getPersonTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      resident: 'Morador',
      visitor: 'Visitante',
      provider: 'Prestador',
      provider_condo: 'Prestador Condomínio',
      provider_resident: 'Prestador Morador',
    };
    return labels[type?.toLowerCase()] || type || 'Desconhecido';
  };

  const getProxiedPhotoUrl = (url: string | null | undefined) => {
    if (!url) return undefined;
    if (url.startsWith('/api/hikcentral/person-photo/')) {
      const token = localStorage.getItem('auth_token');
      if (!token || token === 'null') return undefined;
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}token=${token}`;
    }
    return url;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Relatório de Eventos</h1>
          <p className="text-zinc-500 mt-1">
            Consulte o histórico completo de entradas e saídas do condomínio
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={exportCSV} variant="outline" className="gap-2 rounded-xl">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Barra Superior - Filtros Rápidos */}
      <Card className="rounded-2xl border-zinc-200 shadow-sm overflow-visible">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 space-y-1.5 w-full">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Busca por Nome</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input 
                placeholder="Ex: João Silva..." 
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(e)}
                className="pl-9 h-11 bg-zinc-50 border-zinc-200 rounded-xl"
              />
            </div>
          </div>
          
          <div className="flex-1 space-y-1.5 w-full">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tipo</Label>
            <Select value={personType} onValueChange={setPersonType}>
              <SelectTrigger className="h-11 bg-zinc-50 border-zinc-200 rounded-xl">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="resident">Moradores</SelectItem>
                <SelectItem value="visitor">Visitantes</SelectItem>
                <SelectItem value="provider">Prestadores</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-1.5 w-full">
            <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data Inicial</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-9 h-11 bg-zinc-50 border-zinc-200 rounded-xl"
              />
            </div>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="h-11 px-5 rounded-xl gap-2 bg-zinc-50/50">
                <Filter className="h-4 w-4" />
                Mais Filtros
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px]">
              <SheetHeader className="mb-6">
                <SheetTitle>Filtros Avançados</SheetTitle>
                <SheetDescription>Refine a busca no histórico de acessos.</SheetDescription>
              </SheetHeader>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Data Final</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Porta / Dispositivo</Label>
                  <Input
                    placeholder="Ex: Catraca Principal..."
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>

                <Button onClick={handleSearch} className="w-full h-11 rounded-xl mt-4">
                  Aplicar Filtros
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <Button onClick={handleSearch} className="h-11 px-6 rounded-xl hidden md:flex">
            Buscar
          </Button>
        </CardContent>
      </Card>

      {/* Tabela de Eventos */}
      <Card className="rounded-2xl border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-zinc-50/80">
              <TableRow className="border-b-zinc-200 hover:bg-transparent">
                <TableHead className="w-[80px] text-center font-semibold text-zinc-600">Foto</TableHead>
                <TableHead className="font-semibold text-zinc-600">Data e Hora</TableHead>
                <TableHead className="font-semibold text-zinc-600">Pessoa</TableHead>
                <TableHead className="font-semibold text-zinc-600">Dispositivo</TableHead>
                <TableHead className="font-semibold text-zinc-600 text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-10 w-10 rounded-full mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20 mx-auto rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-zinc-400 gap-3">
                      <FileText className="h-12 w-12 text-zinc-300" />
                      <p>Nenhum registro encontrado para estes filtros.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-zinc-50/50 transition-colors">
                    <TableCell className="text-center">
                      {log.photoUrl || log.picUri ? (
                        <div className="relative w-10 h-10 mx-auto rounded-full overflow-hidden border border-zinc-200 shadow-sm">
                          <img 
                            src={getProxiedPhotoUrl(log.photoUrl || log.picUri)} 
                            alt={log.personName}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                          <div className="hidden absolute inset-0 bg-zinc-100 flex items-center justify-center">
                            <User className="h-5 w-5 text-zinc-400" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-10 h-10 mx-auto rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                          <User className="h-5 w-5 text-zinc-400" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-zinc-700">
                      {new Date(log.occurredAt || log.eventTime).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold text-zinc-900">{log.personName || 'Desconhecido'}</span>
                        <span className="text-xs text-zinc-500">{getPersonTypeLabel(log.personType)} {log.unit ? `• ${log.unit}` : ''}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-zinc-600">
                        <Camera className="h-4 w-4 text-zinc-400" />
                        {log.deviceName || log.doorName || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {log.status === 'denied' ? (
                        <Badge variant="destructive" className="bg-red-50 text-red-700 border-red-200">
                          Negado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 px-2.5">
                          {log.direction === 'exit' ? <LogOut className="h-3 w-3" /> : <LogOut className="h-3 w-3 rotate-180" />}
                          Autorizado
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination Footer */}
        {!loading && totalPages > 1 && (
          <div className="p-4 border-t border-zinc-200 bg-zinc-50/50 flex items-center justify-between text-sm text-zinc-500">
            <div>
              Mostrando página {page} de {totalPages} ({total} registros)
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Anterior
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
