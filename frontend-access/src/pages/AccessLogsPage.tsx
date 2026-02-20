import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getAccessLogs } from '@/db/api';
import type { AccessLog } from '@/types';
import { History, Filter, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AccessLogsPage() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [personType, setPersonType] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadLogs();

    const intervalId = setInterval(() => {
      loadLogs(false);
    }, 5000); // 5 sec live polling

    return () => clearInterval(intervalId);
  }, [personType, startDate, endDate]);

  const loadLogs = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const filters: any = {};

      if (personType !== 'all') {
        filters.personType = personType;
      }

      if (startDate) {
        filters.startDate = new Date(startDate).toISOString();
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filters.endDate = end.toISOString();
      }

      const { data } = await getAccessLogs(1, 100, filters);
      setLogs(data as any);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os logs de acesso',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getPersonTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      resident: 'Morador',
      visitor: 'Visitante',
      provider: 'Prestador'
    };
    return labels[type] || type;
  };

  const getDirectionIcon = (direction: string) => {
    return direction === 'entry' ? (
      <ArrowDownCircle className="h-4 w-4 text-chart-2" />
    ) : (
      <ArrowUpCircle className="h-4 w-4 text-chart-4" />
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Histórico de Acesso</h1>
        <p className="text-muted-foreground mt-1">
          Visualize todos os registros de entrada e saída
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Pessoa</Label>
              <Select value={personType} onValueChange={setPersonType}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="resident">Moradores</SelectItem>
                  <SelectItem value="visitor">Visitantes</SelectItem>
                  <SelectItem value="provider">Prestadores</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data Inicial</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Data Final</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Registros de Acesso
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Direção</TableHead>
                <TableHead>Ponto de Acesso</TableHead>
                <TableHead>Observações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32 bg-muted" /></TableCell>
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum registro encontrado
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {new Date(log.access_time).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>{log.person_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getPersonTypeLabel(log.person_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getDirectionIcon(log.direction)}
                        <span className="text-sm">
                          {log.direction === 'entry' ? 'Entrada' : 'Saída'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{log.access_point || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
