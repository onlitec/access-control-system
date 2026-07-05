import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { getHikcentralVisitantesFinalizados } from '@/db/api';
import { formatAddress } from '@/lib/utils';
import { Search, User, CheckCircle2 } from 'lucide-react';

export default function CompletedVisitsPage() {
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadVisits();
  }, []);

  const loadVisits = async () => {
    try {
      setLoading(true);
      const { data } = await getHikcentralVisitantesFinalizados();
      setVisits(data || []);
    } catch (error) {
      console.error('Erro ao carregar visitas concluídas:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as visitas concluídas',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const filtered = search.trim()
    ? visits.filter((v) => {
        const q = search.toLowerCase();
        return (v.visitor_name || '').toLowerCase().includes(q)
          || (v.certificate_no || '').includes(search)
          || (v.visiting_unit || '').toLowerCase().includes(q);
      })
    : visits;

  const fmtDate = (value?: string | null) =>
    value
      ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '-';

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="p-2 rounded-lg bg-green-100 text-green-600">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">Visitas Concluídas</h1>
          <p className="text-sm text-muted-foreground">
            Visitantes cujo período de visita já foi encerrado
          </p>
        </div>
      </div>

      <Card className="border-zinc-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-white border-b border-zinc-100 p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
              <Input
                placeholder="Buscar por nome, documento ou unidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 h-12 bg-zinc-50 border-zinc-200 rounded-xl shadow-none focus:ring-primary focus:bg-white transition-all text-base"
              />
            </div>
            {!loading && (
              <Badge variant="outline" className="text-sm">
                {filtered.length} {filtered.length === 1 ? 'visita concluída' : 'visitas concluídas'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Foto</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-10 w-10 rounded-full bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 bg-muted" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    Nenhuma visita concluída encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <Avatar>
                        <AvatarImage src={v.photo_url || undefined} />
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{v.visitor_name}</TableCell>
                    <TableCell>{v.certificate_no || '-'}</TableCell>
                    <TableCell className="text-xs text-zinc-600">
                      {formatAddress(v.tower, v.visiting_block, v.visiting_unit)}
                    </TableCell>
                    <TableCell>{v.phone_num || '-'}</TableCell>
                    <TableCell>{v.plate_no || '-'}</TableCell>
                    <TableCell className="text-xs text-zinc-600">{v.visitor_group_name || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-muted-foreground">
                        <span>De: {fmtDate(v.appoint_start_time)}</span>
                        <span>Até: {fmtDate(v.appoint_end_time)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-200">
                        Concluída
                      </Badge>
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
