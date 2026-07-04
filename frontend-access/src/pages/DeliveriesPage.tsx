import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import {
  getDeliveries, getDeliveryStats, createDelivery, pickupDelivery,
  getAllResidentsForSelect
} from '@/db/api';
import { uploadImage } from '@/lib/upload';
import { CameraCapture } from '@/components/CameraCapture';
import { ResidentCombobox } from '@/components/ResidentCombobox';
import { TreeView, type TreeNode } from '@/components/TreeView';
import { EntityPageShell } from '@/components/entity/EntityPageShell';
import { EntityStatCard } from '@/components/entity/EntityStatCard';
import { useEntityTab, type EntityTabValue } from '@/hooks/useEntityTab';
import { Package, PackageCheck, PackageOpen, Timer, Search, Camera, Plus, CheckCircle2 } from 'lucide-react';

interface Delivery {
  id: string;
  courierName: string | null;
  company: string | null;
  orderRef: string | null;
  unit: string;
  residentId: string | null;
  status: string;
  photoUrl: string | null;
  notes: string | null;
  receivedAt: string;
  pickedUpAt: string | null;
  pickedUpBy: string | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  awaiting: { label: 'Aguardando retirada', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  picked_up: { label: 'Retirada', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  returned: { label: 'Devolvida', className: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
};

function DeliveriesOverview({ deliveries, loading }: { deliveries: Delivery[]; loading: boolean }) {
  const [stats, setStats] = useState<{ awaiting: number; receivedToday: number; pickedUpToday: number; avgPickupMinutes: number | null } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    getDeliveryStats()
      .then(setStats)
      .catch((e) => console.error('Erro ao carregar estatísticas de entregas:', e))
      .finally(() => setStatsLoading(false));
  }, []);

  const byCompany = useMemo(() => {
    const counts = new Map<string, number>();
    deliveries.forEach((d) => {
      const company = d.company || 'Sem empresa';
      counts.set(company, (counts.get(company) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [deliveries]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <EntityStatCard
          title="Aguardando Retirada"
          value={stats?.awaiting ?? 0}
          icon={<Package className="h-5 w-5 text-violet-600" />}
          loading={statsLoading}
          highlight
        />
        <EntityStatCard
          title="Recebidas Hoje"
          value={stats?.receivedToday ?? 0}
          icon={<PackageOpen className="h-5 w-5 text-blue-600" />}
          loading={statsLoading}
        />
        <EntityStatCard
          title="Retiradas Hoje"
          value={stats?.pickedUpToday ?? 0}
          icon={<PackageCheck className="h-5 w-5 text-emerald-600" />}
          loading={statsLoading}
        />
        <EntityStatCard
          title="Tempo Médio de Retirada"
          value={stats?.avgPickupMinutes != null
            ? stats.avgPickupMinutes >= 60
              ? `${Math.round(stats.avgPickupMinutes / 60)}h`
              : `${stats.avgPickupMinutes}min`
            : '—'}
          icon={<Timer className="h-5 w-5 text-muted-foreground" />}
          loading={statsLoading}
        />
      </div>

      {byCompany.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Entregas por empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {byCompany.map(([company, count]) => (
                <div key={company} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <span className="text-sm text-muted-foreground truncate">{company}</span>
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

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [residents, setResidents] = useState<Array<{ id: string; full_name: string; unit_number: string; block: string | null; tower: string | null; parkingSpaces: number | null }>>([]);
  const [uploading, setUploading] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [pickupTarget, setPickupTarget] = useState<Delivery | null>(null);
  const [pickupName, setPickupName] = useState('');
  const [pickupSaving, setPickupSaving] = useState(false);
  const { tab, setTab } = useEntityTab({ canRegister: true });
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      company: '',
      orderRef: '',
      courierName: '',
      residentId: '',
      unit: '',
      photoUrl: '',
      notes: ''
    }
  });

  const selectedResident = form.watch('residentId');

  useEffect(() => {
    if (!selectedResident) return;
    const res = residents.find(r => r.id === selectedResident);
    if (res) {
      const parts = [res.tower, res.block ? `Bloco ${res.block}` : null, res.unit_number ? `Apto ${res.unit_number}` : null].filter(Boolean);
      form.setValue('unit', parts.join(', '));
    }
  }, [selectedResident]);

  const loadDeliveries = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getDeliveries(1, 100, { q: search });
      setDeliveries(result.data || []);
    } catch (error) {
      console.error('Erro ao carregar entregas:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar as entregas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  useEffect(() => {
    getAllResidentsForSelect().then(setResidents).catch(() => {});
  }, []);

  const handleTabChange = (t: EntityTabValue) => {
    if (t !== 'cadastrar') form.reset();
    setTab(t);
  };

  const onSubmit = async (data: any) => {
    try {
      setUploading(true);
      await createDelivery({
        company: data.company || null,
        orderRef: data.orderRef || null,
        courierName: data.courierName || null,
        residentId: data.residentId || null,
        unit: data.unit,
        photoUrl: data.photoUrl || null,
        notes: data.notes || null,
      });
      toast({ title: 'Sucesso', description: 'Entrega registrada com sucesso' });
      form.reset();
      setTab('lista');
      loadDeliveries();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message || 'Erro ao registrar entrega', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handlePickup = async () => {
    if (!pickupTarget || !pickupName.trim()) return;
    try {
      setPickupSaving(true);
      await pickupDelivery(pickupTarget.id, pickupName.trim());
      toast({ title: 'Retirada registrada', description: `${pickupName.trim()} retirou a encomenda.` });
      setPickupTarget(null);
      setPickupName('');
      loadDeliveries();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message || 'Erro ao registrar retirada', variant: 'destructive' });
    } finally {
      setPickupSaving(false);
    }
  };

  const treeData: TreeNode[] = [
    { id: 'all', name: 'Todas as Entregas', type: 'group' },
    {
      id: 'status_root',
      name: 'Status',
      type: 'group',
      children: [
        { id: 'status_awaiting', name: 'Aguardando retirada', type: 'item' },
        { id: 'status_picked_up', name: 'Retiradas', type: 'item' },
        { id: 'status_returned', name: 'Devolvidas', type: 'item' },
      ]
    }
  ];

  const filteredDeliveries = deliveries.filter(d => !statusFilter || d.status === statusFilter);

  const registerContent = (
    <Card className="border-primary/20 shadow-sm rounded-2xl overflow-hidden p-0 gap-0">
      <CardHeader className="p-6 pb-4 border-b bg-muted/20">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <span className="p-2 bg-violet-50 text-violet-600 rounded-lg">
            <Package className="h-5 w-5" />
          </span>
          Registrar Nova Entrega
        </h2>
        <p className="text-sm text-muted-foreground">
          Registre a encomenda recebida na portaria; o morador poderá retirá-la depois.
        </p>
      </CardHeader>
      <div className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col md:flex-row gap-8">
              {/* Foto do pacote */}
              <div className="w-full md:w-[200px] flex-shrink-0 space-y-4">
                <div className="aspect-square w-full relative group border-4 border-muted rounded-xl bg-muted/30 overflow-hidden flex flex-col items-center justify-center transition-all hover:border-primary/20 shadow-inner">
                  {form.watch('photoUrl') ? (
                    <>
                      <img src={form.watch('photoUrl')} className="w-full h-full object-cover" alt="Foto do pacote" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-all">
                        <Button type="button" size="sm" variant="secondary" onClick={() => setCameraDialogOpen(true)} className="h-8">
                          Trocar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground p-4">
                      <Package className="h-10 w-10 opacity-20" />
                      <span className="text-[10px] uppercase font-bold opacity-40">Sem Foto</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button type="button" size="sm" onClick={() => setCameraDialogOpen(true)} className="w-full bg-primary/10 text-primary hover:bg-primary/20 border-none">
                    <Camera className="mr-2 h-4 w-4" />
                    Fotografar Pacote
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById('delivery-photo-upload')?.click()} className="w-full text-[10px] h-8 border-dashed">
                    enviar foto em arquivo
                  </Button>
                  <input
                    id="delivery-photo-upload"
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          setUploading(true);
                          const url = await uploadImage(file, 'app-9hbwbnibthc3_access_images');
                          form.setValue('photoUrl', url);
                        } catch {
                          toast({ title: 'Erro', description: 'Erro no upload da foto', variant: 'destructive' });
                        } finally {
                          setUploading(false);
                        }
                      }
                    }}
                  />
                </div>
              </div>

              {/* Campos */}
              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Empresa / Transportadora</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: Mercado Livre, iFood, Correios" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="orderRef"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Referência / Pedido</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: Pedido 5894, Vol 2" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="courierName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Entregador</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Opcional" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-zinc-50/50 p-4 rounded-xl border border-zinc-200/60 space-y-4">
                  <Label className="text-zinc-800 font-bold text-xs uppercase tracking-wider block border-b pb-2">Destino</Label>
                  <FormField
                    control={form.control}
                    name="residentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Morador (opcional)</FormLabel>
                        <FormControl>
                          <ResidentCombobox
                            residents={residents}
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder="Selecione para preencher a unidade..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="unit"
                    rules={{ required: 'Unidade de destino é obrigatória' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unidade de Destino *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: Torre A, Apto 804" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Observações adicionais" rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 p-6 border-t bg-muted/20">
              <Button type="button" variant="outline" onClick={() => handleTabChange('lista')}>
                Cancelar
              </Button>
              <Button type="submit" disabled={uploading}>
                {uploading ? 'Enviando...' : 'Registrar Entrega'}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </Card>
  );

  const filtersContent = (
    <div className="h-[calc(100vh-360px)] min-h-[300px] overflow-y-auto">
      <TreeView
        data={treeData}
        selectedId={statusFilter ? `status_${statusFilter}` : 'all'}
        onSelect={(id) => {
          if (id === 'all') setStatusFilter('');
          else if (!id.endsWith('_root')) setStatusFilter(id.replace('status_', ''));
        }}
      />
    </div>
  );

  const listContent = (
    <Card className="border-zinc-200 shadow-sm rounded-2xl overflow-hidden w-full">
      <CardHeader className="bg-white border-b border-zinc-100 p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
            <Input
              placeholder="Buscar por unidade, empresa, pedido ou entregador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 h-12 bg-zinc-50 border-zinc-200 rounded-xl shadow-none focus:ring-primary focus:bg-white transition-all text-base"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Foto</TableHead>
              <TableHead>Empresa / Pedido</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead>Entregador</TableHead>
              <TableHead>Recebida em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Retirada por</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-10 w-10 rounded-lg bg-muted" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32 bg-muted" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24 bg-muted" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24 bg-muted" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28 bg-muted" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24 bg-muted" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20 bg-muted" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-24 bg-muted ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : filteredDeliveries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <Package className="h-10 w-10 text-zinc-200" />
                    Nenhuma entrega encontrada
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredDeliveries.map((delivery) => {
                const badge = STATUS_BADGE[delivery.status] ?? STATUS_BADGE.awaiting;
                return (
                  <TableRow key={delivery.id}>
                    <TableCell>
                      {delivery.photoUrl ? (
                        <img src={delivery.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover border border-zinc-200" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-violet-50 text-violet-500 flex items-center justify-center">
                          <Package className="h-5 w-5" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{delivery.company || 'Encomenda'}</div>
                      {delivery.orderRef && <div className="text-xs text-muted-foreground">{delivery.orderRef}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{delivery.unit}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{delivery.courierName || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(delivery.receivedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{delivery.pickedUpBy || '-'}</TableCell>
                    <TableCell className="text-right">
                      {delivery.status === 'awaiting' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-semibold"
                          onClick={() => { setPickupTarget(delivery); setPickupName(''); }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          Registrar retirada
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <>
      <EntityPageShell
        title="Entregas"
        description="Registre encomendas recebidas na portaria e controle as retiradas"
        tab={tab}
        onTabChange={handleTabChange}
        canRegister
        registerLabel="Registrar Entrega"
        overview={<DeliveriesOverview deliveries={deliveries} loading={loading} />}
        list={listContent}
        register={registerContent}
        filters={filtersContent}
      />

      {/* Dialog de retirada */}
      <Dialog open={!!pickupTarget} onOpenChange={(open) => { if (!open) setPickupTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-emerald-600" />
              Registrar Retirada
            </DialogTitle>
            <DialogDescription>
              {pickupTarget && (
                <>Encomenda <strong>{pickupTarget.company || 'sem empresa'}{pickupTarget.orderRef ? ` (${pickupTarget.orderRef})` : ''}</strong> — {pickupTarget.unit}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pickup-name">Quem está retirando? *</Label>
            <Input
              id="pickup-name"
              value={pickupName}
              onChange={(e) => setPickupName(e.target.value)}
              placeholder="Nome de quem retirou a encomenda"
              onKeyDown={(e) => { if (e.key === 'Enter') handlePickup(); }}
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setPickupTarget(null)}>Cancelar</Button>
            <Button onClick={handlePickup} disabled={!pickupName.trim() || pickupSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {pickupSaving ? 'Salvando...' : 'Confirmar Retirada'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CameraCapture
        open={cameraDialogOpen}
        onOpenChange={setCameraDialogOpen}
        cameraType="facial"
        onCapture={(url) => { form.setValue('photoUrl', url); toast({ title: 'Sucesso', description: 'Foto capturada' }); }}
        defaultTab="webcam"
      />
    </>
  );
}
