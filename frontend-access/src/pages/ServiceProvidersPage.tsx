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
import { getServiceProviders, createServiceProvider, updateServiceProvider, getAllResidentsForSelect, getActiveTowers } from '@/db/api';
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
      const { data } = await getServiceProviders(1, 100, search);
      setProviders(data);
    } catch (error) {
      console.error('Erro ao carregar prestadores:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os prestadores',
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
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProvider ? 'Editar Prestador' : 'Novo Prestador'}
              </DialogTitle>
              <DialogDescription>
                Preencha os dados do prestador de serviços
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Foto Facial</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openCameraDialog('facial')}
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Capturar da Câmera
                    </Button>
                  </div>
                  <Dropzone {...dropzoneProps} className="min-h-32" />
                  {dropzoneProps.files.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {dropzoneProps.files.map((file, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <span>{file.name}</span>
                          {file.errors.length > 0 && (
                            <span className="text-destructive">{file.errors[0].message}</span>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          if (dropzoneProps.files.length > 0 && dropzoneProps.files[0].errors.length === 0) {
                            await handleFileUpload(dropzoneProps.files);
                          }
                        }}
                        disabled={uploading || dropzoneProps.files[0]?.errors.length > 0}
                      >
                        {uploading ? 'Enviando...' : 'Enviar Foto'}
                      </Button>
                    </div>
                  )}
                  {form.watch('photo_url') && (
                    <div className="flex items-center gap-2">
                      <Avatar>
                        <AvatarImage src={form.watch('photo_url')} />
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-muted-foreground">Foto facial carregada</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Foto do Documento</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openCameraDialog('document')}
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      Capturar da Câmera
                    </Button>
                  </div>
                  {form.watch('document_photo_url') && (
                    <div className="flex items-center gap-2 border rounded-lg p-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Documento carregado</span>
                    </div>
                  )}
                  {!form.watch('document_photo_url') && (
                    <p className="text-sm text-muted-foreground">
                      Clique em "Capturar da Câmera" para fotografar o documento
                    </p>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="full_name"
                  rules={{ required: 'Nome completo é obrigatório' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nome completo do prestador" />
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
                        <Input {...field} placeholder="Nome da empresa (se aplicável)" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="document"
                    rules={{ required: 'Documento é obrigatório' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF/CNPJ *</FormLabel>
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

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={uploading}>
                    {uploading ? 'Enviando...' : 'Salvar'}
                  </Button>
                </div>
              </form>
            </Form>
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
                <TableHead>Empresa</TableHead>
                <TableHead>Tipo de Serviço</TableHead>
                <TableHead>Torre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>HikCentral</TableHead>
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
                    <TableCell><Skeleton className="h-4 w-24 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24 bg-muted" /></TableCell>
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
                providers.map((provider) => (
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
                    <TableCell>{provider.company_name || '-'}</TableCell>
                    <TableCell>{provider.service_type}</TableCell>
                    <TableCell>{provider.tower || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={provider.provider_type === 'fixed' ? 'default' : 'secondary'}>
                        {provider.provider_type === 'fixed' ? 'Fixo' : 'Eventual'}
                      </Badge>
                    </TableCell>
                    <TableCell>{provider.phone || '-'}</TableCell>
                    <TableCell>
                      {provider.hikcentral_person_id ? (
                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                          Sincronizado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground border-slate-200">
                          Não Sincronizado
                        </Badge>
                      )}
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
