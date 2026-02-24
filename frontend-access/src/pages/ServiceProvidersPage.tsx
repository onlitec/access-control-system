import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { getHikcentralPrestadores, createServiceProvider, updateServiceProvider, getAllResidentsForSelect, getActiveTowers } from '@/db/api';
import { urlToBase64 } from '@/lib/utils';
import { addPerson, createAppointment, reapplyAuthorization, getOrganizations } from '@/services/hikcentral';
import { useAuth } from '@/contexts/AuthContext';
import type { ServiceProvider, Tower } from '@/types';
import { Plus, Search, Pencil, User, Camera, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { uploadImage } from '@/lib/upload';
import { Dropzone } from '@/components/dropzone';
import { useFileUpload } from '@/hooks/use-file-upload';
import { CameraCapture } from '@/components/CameraCapture';
import { ResidentCombobox } from '@/components/ResidentCombobox';

export default function ServiceProvidersPage() {
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [residents, setResidents] = useState<Array<{ id: string; full_name: string; unit_number: string; block: string | null; tower: string | null }>>([]);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ServiceProvider | null>(null);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [cameraType, setCameraType] = useState<'facial' | 'document'>('facial');
  const [orgIndexCode, setOrgIndexCode] = useState<string>('');
  const { profile } = useAuth();
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      full_name: '',
      company_name: '',
      document: '',
      phone: '',
      email: '',
      service_type: '',
      provider_type: 'temporary' as 'fixed' | 'temporary',
      photo_url: '',
      document_photo_url: '',
      tower: '',
      visiting_resident: '',
      valid_from: '',
      valid_until: '',
      notes: ''
    }
  });

  const [uploading, setUploading] = useState(false);

  // @ts-ignore - Ignore type differences for now
  const dropzoneProps = useFileUpload({
    maxFiles: 1,
    maxFileSize: 1024 * 1024
  });

  useEffect(() => {
    loadProviders();
    loadResidents();
    loadTowers();
    loadOrganizations();
  }, [search]);

  const loadOrganizations = async () => {
    try {
      const data: any = await getOrganizations();
      if (data?.data?.list?.length > 0) {
        setOrgIndexCode(data.data.list[0].orgIndexCode);
      }
    } catch (error) {
      console.error('Erro ao carregar organizações do Hikcentral:', error);
    }
  };

  const loadTowers = async () => {
    try {
      const data = await getActiveTowers();
      setTowers(data);
    } catch (error) {
      console.error('Erro ao carregar torres:', error);
    }
  };

  const loadResidents = async () => {
    try {
      const data = await getAllResidentsForSelect();
      setResidents(data);
    } catch (error) {
      console.error('Erro ao carregar moradores:', error);
    }
  };

  const loadProviders = async () => {
    try {
      setLoading(true);
      const { data } = await getHikcentralPrestadores();
      
      // Mapear dados do HikCentral para o formato esperado pelo frontend
      const mappedProviders = (data || []).map((p: any) => ({
        id: p.id || p.visitor_id,
        full_name: p.visitor_name || 'Sem nome',
        company_name: null,
        document: p.certificate_no || '-',
        phone: p.phone_num || null,
        email: null,
        service_type: p.visitor_group_name || 'Prestação de Serviço',
        provider_type: 'temporary' as const,
        photo_url: null,
        document_photo_url: null,
        tower: null,
        visiting_resident: null,
        valid_from: p.appoint_start_time?.split('T')[0] || null,
        valid_until: p.appoint_end_time?.split('T')[0] || null,
        notes: null,
        hikcentral_person_id: p.visitor_id || null,
        // Campos adicionais do HikCentral
        appoint_status: p.appoint_status,
        appoint_status_text: p.appoint_status_text,
        appoint_start_time: p.appoint_start_time,
        appoint_end_time: p.appoint_end_time,
        plate_no: p.plate_no,
      }));
      
      // Filtrar por busca se necessário
      const filtered = search 
        ? mappedProviders.filter((p: any) => 
            p.full_name?.toLowerCase().includes(search.toLowerCase()) ||
            p.service_type?.toLowerCase().includes(search.toLowerCase())
          )
        : mappedProviders;
      
      setProviders(filtered);
    } catch (error) {
      console.error('Erro ao carregar prestadores:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os prestadores do HikCentral',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (provider?: ServiceProvider) => {
    if (provider) {
      setEditingProvider(provider);
      form.reset({
        full_name: provider.full_name,
        company_name: provider.company_name || '',
        document: provider.document,
        phone: provider.phone || '',
        email: provider.email || '',
        service_type: provider.service_type,
        provider_type: provider.provider_type,
        photo_url: provider.photo_url || '',
        document_photo_url: provider.document_photo_url || '',
        tower: provider.tower || '',
        visiting_resident: provider.visiting_resident || '',
        valid_from: provider.valid_from || '',
        valid_until: provider.valid_until || '',
        notes: provider.notes || ''
      });
    } else {
      setEditingProvider(null);
      form.reset({
        full_name: '',
        company_name: '',
        document: '',
        phone: '',
        email: '',
        service_type: '',
        provider_type: 'temporary',
        photo_url: '',
        document_photo_url: '',
        tower: '',
        visiting_resident: '',
        valid_from: '',
        valid_until: '',
        notes: ''
      });
    }
    setDialogOpen(true);
  };

  const handleCameraCapture = (imageUrl: string) => {
    if (cameraType === 'facial') {
      form.setValue('photo_url', imageUrl);
    } else {
      form.setValue('document_photo_url', imageUrl);
    }
    toast({
      title: 'Sucesso',
      description: 'Imagem capturada com sucesso'
    });
  };

  const openCameraDialog = (type: 'facial' | 'document') => {
    setCameraType(type);
    setCameraDialogOpen(true);
  };

  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return;

    try {
      setUploading(true);
      const url = await uploadImage(files[0], 'app-9hbwbnibthc3_access_images');
      form.setValue('photo_url', url);
      toast({
        title: 'Sucesso',
        description: 'Foto enviada com sucesso'
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao enviar foto',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data: any) => {
    try {
      const providerData = {
        ...data,
        company_name: data.company_name || null,
        phone: data.phone || null,
        email: data.email || null,
        photo_url: data.photo_url || null,
        document_photo_url: data.document_photo_url || null,
        valid_from: data.valid_from || null,
        valid_until: data.valid_until || null,
        notes: data.notes || null,
        authorized_units: null
      };

      let providerId = '';
      if (editingProvider) {
        await updateServiceProvider(editingProvider.id, providerData);
        providerId = editingProvider.id;
        toast({
          title: 'Sucesso',
          description: 'Prestador atualizado com sucesso'
        });
      } else {
        const newProvider = await createServiceProvider({
          ...providerData,
          created_by: profile?.id || null
        });
        providerId = newProvider.id;
        toast({
          title: 'Sucesso',
          description: 'Prestador cadastrado com sucesso'
        });
      }

      // Sincronização com HikCentral
      try {
        const nameParts = data.full_name.trim().split(' ');
        const givenName = nameParts[0];
        const familyName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];

        if (data.provider_type === 'fixed') {
          // Prestador fixo -> addPerson
          const syncData: any = {
            personGivenName: givenName,
            personFamilyName: familyName,
            orgIndexCode: orgIndexCode || 'root',
            phoneNo: data.phone || undefined,
            email: data.email || undefined,
          };

          if (data.photo_url) {
            const base64Face = await urlToBase64(data.photo_url);
            syncData.faces = [{ faceData: base64Face }];
          }

          const hikResponse: any = await addPerson(syncData);
          const hikPersonId = hikResponse?.data?.personId;

          if (hikPersonId && providerId) {
            await updateServiceProvider(providerId, {
              hikcentral_person_id: hikPersonId
            });
          }
        } else {
          // Prestador eventual -> createAppointment
          const selectedResident = residents.find((r: any) => r.id === data.visiting_resident);

          const startTime = new Date();
          const endTime = new Date();
          if (data.valid_until) {
            const end = new Date(data.valid_until);
            endTime.setFullYear(end.getFullYear(), end.getMonth(), end.getDate());
            endTime.setHours(23, 59, 59);
          } else {
            endTime.setHours(endTime.getHours() + 12); // 12h padrão
          }

          const appointmentData: any = {
            receptionistId: (selectedResident as any)?.hikcentral_person_id || undefined,
            appointStartTime: startTime.toISOString(),
            appointEndTime: endTime.toISOString(),
            visitReasonType: 3, // Prestação de Serviço
            visitorInfoList: [{
              visitorGivenName: givenName,
              visitorFamilyName: familyName,
              phoneNo: data.phone || undefined,
            }]
          };

          if (data.photo_url) {
            const base64Face = await urlToBase64(data.photo_url);
            appointmentData.visitorInfoList[0].faces = [{ faceData: base64Face }];
          }

          await createAppointment(appointmentData);
        }

        await reapplyAuthorization();

        toast({
          title: 'Sincronização',
          description: 'Dados sincronizados com Hikcentral com sucesso'
        });
      } catch (syncError: any) {
        console.error('Erro na sincronização Hikcentral:', syncError);
        toast({
          title: 'Erro de Sincronização',
          description: 'O prestador foi salvo localmente, mas houve um erro ao enviar para o Hikcentral: ' + syncError.message,
          variant: 'warning'
        } as any);
      }

      setDialogOpen(false);
      loadProviders();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar prestador',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Prestadores de Serviços</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie prestadores fixos e eventuais
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Prestador
            </Button>
          </DialogTrigger>
          <DialogContent
            className="w-[95vw] max-h-[95vh] overflow-y-auto p-0 gap-0 border-primary/20 shadow-2xl"
            style={{ maxWidth: '1200px' }}
          >
            <DialogHeader className="p-6 pb-2 border-b bg-muted/20">
              <DialogTitle className="text-xl flex items-center gap-2">
                <span className="p-2 bg-primary/10 text-primary rounded-lg">
                  {editingProvider ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </span>
                {editingProvider ? 'Editar Prestador' : 'Novo Prestador'}
              </DialogTitle>
            </DialogHeader>
            <div className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="flex flex-col md:flex-row gap-8">
                    {/* Photo Section */}
                    <div className="w-full md:w-[200px] flex-shrink-0 space-y-4">
                      <div className="aspect-square w-full relative group border-4 border-muted rounded-xl bg-muted/30 overflow-hidden flex flex-col items-center justify-center transition-all hover:border-primary/20 shadow-inner">
                        {form.watch('photo_url') ? (
                          <>
                            <img
                              src={form.watch('photo_url')}
                              className="w-full h-full object-cover"
                              alt="Face capture"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-all">
                              <Button type="button" size="sm" variant="secondary" onClick={() => openCameraDialog('facial')} className="h-8">
                                Trocar
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-muted-foreground p-4">
                            <Camera className="h-10 w-10 opacity-20" />
                            <span className="text-[10px] uppercase font-bold opacity-40">Sem Foto</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button type="button" size="sm" onClick={() => openCameraDialog('facial')} className="w-full bg-primary/10 text-primary hover:bg-primary/20 border-none">
                          <Camera className="mr-2 h-4 w-4" />
                          Capturar pela Facial
                        </Button>
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-muted" />
                          </div>
                          <div className="relative flex justify-center text-[8px] uppercase font-bold text-muted-foreground">
                            <span className="bg-background px-2">ou</span>
                          </div>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById('provider-photo-upload')?.click()} className="w-full text-[10px] h-8 border-dashed">
                          enviar foto em arquivo
                        </Button>
                        <input
                          id="provider-photo-upload"
                          type="file"
                          className="hidden"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const url = await uploadImage(file);
                              form.setValue('photo_url', url);
                            }
                          }}
                        />
                      </div>

                      <div className="pt-4 border-t">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-2 block text-center">Documento</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full h-8 text-[10px] gap-2"
                          onClick={() => openCameraDialog('document')}
                        >
                          <FileText className="h-3 w-3" />
                          {form.watch('document_photo_url') ? 'Anexo Ok' : 'Foto Documento'}
                        </Button>
                      </div>
                    </div>

                    {/* Fields Section */}
                    <div className="flex-1 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="full_name"
                          rules={{ required: 'Nome completo é obrigatório' }}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nome Completo *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Ex: João Silva" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="company_name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Empresa</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Nome da empresa" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="document"
                          rules={{ required: 'Documento é obrigatório' }}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Documento (RG/CPF) *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Número do documento" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Telefone</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="(00) 00000-0000" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>E-mail</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" placeholder="email@exemplo.com" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="service_type"
                          rules={{ required: 'Tipo de serviço é obrigatório' }}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tipo de Serviço *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Ex: Encanador, Eletricista" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="provider_type"
                          rules={{ required: 'Tipo de prestador é obrigatório' }}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tipo de Prestador *</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione o tipo" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="fixed">Fixo</SelectItem>
                                  <SelectItem value="temporary">Eventual</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="tower"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Torre</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione a torre" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {towers.map((tower) => (
                                  <SelectItem key={tower.id} value={tower.name}>
                                    {tower.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="visiting_resident"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Morador para Prestação de Serviço</FormLabel>
                            <FormControl>
                              <ResidentCombobox
                                residents={residents}
                                value={field.value}
                                onValueChange={field.onChange}
                                placeholder="Selecione o morador..."
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="valid_from"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Válido De</FormLabel>
                              <FormControl>
                                <Input {...field} type="date" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="valid_until"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Válido Até</FormLabel>
                              <FormControl>
                                <Input {...field} type="date" />
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
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={uploading}>
                      {uploading ? 'Enviando...' : 'Concluir Cadastro'}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, empresa ou tipo de serviço..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Foto</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-10 w-10 rounded-full bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20 bg-muted ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : providers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Nenhum prestador encontrado
                  </TableCell>
                </TableRow>
              ) : (
                providers.map((provider: any) => (
                  <TableRow key={provider.id}>
                    <TableCell>
                      <Avatar>
                        <AvatarImage src={provider.photo_url || undefined} />
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{provider.full_name}</TableCell>
                    <TableCell>{provider.document}</TableCell>
                    <TableCell>{provider.phone || '-'}</TableCell>
                    <TableCell>{provider.plate_no || '-'}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={provider.appoint_status === 2 ? 'default' : provider.appoint_status === 1 ? 'secondary' : 'outline'}
                        className={provider.appoint_status === 2 ? 'bg-green-600 text-white' : provider.appoint_status === 1 ? 'bg-gray-200 text-gray-700' : 'text-blue-600 border-blue-200 bg-blue-50'}
                      >
                        {provider.appoint_status_text || 'Agendado'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-muted-foreground">
                        {provider.appoint_start_time && (
                          <span>De: {new Date(provider.appoint_start_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                        {provider.appoint_end_time && (
                          <span>Até: {new Date(provider.appoint_end_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(provider)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CameraCapture
        open={cameraDialogOpen}
        onOpenChange={setCameraDialogOpen}
        cameraType={cameraType}
        onCapture={handleCameraCapture}
      />
    </div>
  );
}
