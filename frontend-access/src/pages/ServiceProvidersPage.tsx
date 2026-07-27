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
import { getHikcentralPrestadores, createServiceProvider, updateServiceProvider, getAllResidentsForSelect, getActiveTowers, getJobFunctions } from '@/db/api';
import { urlToBase64, formatAddress } from '@/lib/utils';
import { addPerson, createAppointment, reapplyAuthorization, getOrganizations } from '@/services/hikcentral';
import { useAuth } from '@/contexts/AuthContext';
import type { ServiceProvider, Tower } from '@/types';
import { Plus, Search, Pencil, User, Camera, FileText, Video } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { uploadImage } from '@/lib/upload';
import { Dropzone } from '@/components/dropzone';
import { useFileUpload } from '@/hooks/use-file-upload';
import { CameraCapture } from '@/components/CameraCapture';
import { ResidentCombobox } from '@/components/ResidentCombobox';
import { useCondoConfig } from '@/hooks/useCondoConfig';
import { TreeView, type TreeNode } from '@/components/TreeView';
import { EntityPageShell } from '@/components/entity/EntityPageShell';
import { ProvidersOverview } from '@/components/entity/ProvidersOverview';
import { useEntityTab, type EntityTabValue } from '@/hooks/useEntityTab';

export default function ServiceProvidersPage() {
  const {
    labels,
    isHorizontal,
    getFieldStatus,
    getBlacklistEntry,
    isTimeAllowed,
    towers: condoTowers,
    units: condoUnits
  } = useCondoConfig();
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [residents, setResidents] = useState<Array<{ id: string; full_name: string; unit_number: string; block: string | null; tower: string | null; parkingSpaces: number | null }>>([]);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [jobFunctions, setJobFunctions] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { tab, setTab } = useEntityTab({ canRegister: true });
  const [editingProvider, setEditingProvider] = useState<ServiceProvider | null>(null);
  const [existingQuery, setExistingQuery] = useState('');
  const [existingOpen, setExistingOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [cameraType, setCameraType] = useState<'facial' | 'document'>('facial');
  const [cameraDefaultTab, setCameraDefaultTab] = useState<'webcam' | 'doorbell'>('webcam');
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
      visiting_block: '',
      visiting_resident: '',
      valid_from: '',
      valid_until: '',
      notes: '',
      plateNo: '',
      cnpj: '',
      visiting_unit: '',
      job_function_id: ''
    }
  });

  const selectedTower = form.watch('tower');
  const selectedBlock = form.watch('visiting_block');
  const selectedResident = form.watch('visiting_resident');

  const selectedTowerObj = condoTowers.find((t) => t.name === selectedTower);
  const availableBlocks = selectedTowerObj?.blocks || [];

  const selectedBlockObj = availableBlocks.find((b: any) => b.name === selectedBlock);
  const availableUnits = condoUnits.filter((u: any) => {
    if (selectedBlockObj) {
      return u.towerId === selectedTowerObj?.id && u.blockId === selectedBlockObj.id;
    }
    return u.towerId === selectedTowerObj?.id && !u.blockId;
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

  useEffect(() => {
    getJobFunctions().then(setJobFunctions).catch(() => setJobFunctions([]));
  }, []);

  // Auto-fill tower/block/unit when a resident is selected
  useEffect(() => {
    if (!selectedResident) return;
    const res = residents.find((r) => r.id === selectedResident);
    if (!res) return;
    form.setValue('tower', res.tower || '');
    form.setValue('visiting_block', res.block || '');
    form.setValue('visiting_unit', res.unit_number || '');
  }, [selectedResident]);

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
        photo_url: p.photo_url || null,
        document_photo_url: null,
        tower: p.tower || null,
        visiting_block: p.visiting_block || null,
        visiting_unit: p.visiting_unit || null,
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
        notes: provider.notes || '',
        job_function_id: provider.job_function_id || ''
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
        notes: '',
        job_function_id: ''
      });
    }
    if (!provider) {
      setExistingQuery('');
      setExistingOpen(false);
    }
    setTab('cadastrar');
  };

  const handleTabChange = (t: EntityTabValue) => {
    if (t === 'cadastrar') {
      handleOpenDialog();
      return;
    }
    setEditingProvider(null);
    setExistingQuery('');
    form.reset();
    setTab(t);
  };

  const fillFromExistingProvider = (provider: ServiceProvider) => {
    form.reset({
      full_name: provider.full_name,
      company_name: provider.company_name || '',
      document: provider.document,
      phone: provider.phone || '',
      email: provider.email || '',
      service_type: provider.service_type || '',
      provider_type: (provider.provider_type as 'fixed' | 'temporary') || 'temporary',
      photo_url: provider.photo_url || '',
      document_photo_url: provider.document_photo_url || '',
      tower: provider.tower || '',
      visiting_block: provider.visiting_block || '',
      visiting_unit: provider.visiting_unit || '',
      valid_from: '',
      valid_until: '',
      notes: provider.notes || '',
      job_function_id: provider.job_function_id || ''
    });
    setExistingQuery('');
    setExistingOpen(false);
  };

  const existingProviderMatches = existingQuery.trim().length >= 2
    ? providers.filter(p => {
        const q = existingQuery.toLowerCase();
        return p.full_name.toLowerCase().includes(q) || (p.document || '').includes(q) || (p.company_name || '').toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

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

  const openCameraDialog = (type: 'facial' | 'document', tab: 'webcam' | 'doorbell' = 'webcam') => {
    setCameraType(type);
    setCameraDefaultTab(tab);
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
      const blacklistEntry = getBlacklistEntry(data.document || '');
      if (blacklistEntry) {
        toast({
          title: 'Bloqueio de Segurança (Blacklist)',
          description: `Bloqueio Total: Esta pessoa está na blacklist! Motivo: ${blacklistEntry.reason}. Cadastro não permitido.`,
          variant: 'destructive',
        });
        return;
      }

      const photoStatus = getFieldStatus('provider', 'photo');
      if (photoStatus === 'required' && !data.photo_url) {
        toast({
          title: 'Foto Obrigatória',
          description: 'A foto do prestador é obrigatória conforme as diretrizes do condomínio.',
          variant: 'destructive',
        });
        return;
      }

      let scheduleNotes = '';
      if (!editingProvider) {
        const timeCheck = isTimeAllowed('provider');
        if (!timeCheck.allowed) {
          const justification = window.prompt(`Atenção: Acesso fora do horário permitido para prestadores! Motivo: ${timeCheck.reason}\n\nPara liberar o acesso emergencial, digite uma justificativa obrigatória:`);
          if (justification === null) return;
          if (!justification.trim()) {
            toast({
              title: 'Justificativa Obrigatória',
              description: 'Você precisa digitar uma justificativa para liberar o acesso fora de horário.',
              variant: 'destructive',
            });
            return;
          }
          scheduleNotes = `[Liberação de Emergência - Fora de Horário: ${justification.trim()} (Operador: ${profile?.username || 'Portaria'})]`;
        }
      }

      const finalNotes = data.notes
        ? `${data.notes} ${scheduleNotes}`.trim()
        : scheduleNotes;

      const providerData = {
        ...data,
        company_name: data.company_name || null,
        phone: data.phone || null,
        email: data.email || null,
        photo_url: data.photo_url || null,
        document_photo_url: data.document_photo_url || null,
        valid_from: data.valid_from || null,
        valid_until: data.valid_until || null,
        notes: finalNotes || null,
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

      } catch (syncError: any) {
        console.error('Erro na sincronização:', syncError);
      }

      form.reset();
      setEditingProvider(null);
      setTab('lista');
      loadProviders();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar prestador',
        variant: 'destructive'
      });
    }
  };

  const providerGroups = Array.from(new Set(providers.map(p => p.service_type))).filter(Boolean);
  const treeData: TreeNode[] = [
    {
      id: 'all',
      name: 'Todos os Prestadores',
      type: 'group'
    }
  ];

  if (providerGroups.length > 0) {
    treeData.push({
      id: 'groups_root',
      name: 'Grupos / Tipos',
      type: 'group',
      children: providerGroups.map(g => ({
        id: `group_${g}`,
        name: g,
        type: 'item'
      }))
    });
  }

  const [groupFilter, setGroupFilter] = useState<string>('');

  const registerContent = (
    <Card className="border-primary/20 shadow-sm rounded-2xl overflow-hidden p-0 gap-0">
      <CardHeader className="p-6 pb-4 border-b bg-muted/20">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <span className="p-2 bg-primary/10 text-primary rounded-lg">
            {editingProvider ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          </span>
          {editingProvider ? 'Editar Prestador' : 'Novo Prestador'}
        </h2>
        <p className="text-sm text-muted-foreground">
          Formulário para registro e gerenciamento de prestadores de serviço.
        </p>
      </CardHeader>
      <div className="p-6">
              {/* Buscar prestador já cadastrado */}
              {!editingProvider && (
                <div className="relative mb-4">
                  <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/30">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      placeholder="Buscar prestador já cadastrado por nome, documento ou empresa..."
                      className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      value={existingQuery}
                      onChange={e => { setExistingQuery(e.target.value); setExistingOpen(true); }}
                      onFocus={() => setExistingOpen(true)}
                      onBlur={() => setTimeout(() => setExistingOpen(false), 150)}
                    />
                    {existingQuery && (
                      <button type="button" onClick={() => { setExistingQuery(''); setExistingOpen(false); }} className="text-muted-foreground hover:text-foreground">✕</button>
                    )}
                  </div>
                  {existingOpen && existingProviderMatches.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden">
                      {existingProviderMatches.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left border-b last:border-0"
                          onMouseDown={() => fillFromExistingProvider(p)}
                        >
                          {p.photo_url && <img src={p.photo_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />}
                          {!p.photo_url && <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-4 w-4 text-muted-foreground" /></div>}
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{p.full_name}</div>
                            <div className="text-xs text-muted-foreground">{p.company_name || p.document}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
                              <Button type="button" size="sm" variant="secondary" onClick={() => openCameraDialog('facial', 'webcam')} className="h-8">
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
                        <Button type="button" size="sm" onClick={() => openCameraDialog('facial', 'webcam')} className="w-full bg-primary/10 text-primary hover:bg-primary/20 border-none">
                          <Camera className="mr-2 h-4 w-4" />
                          Câmera Local
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => openCameraDialog('facial', 'doorbell')} className="w-full text-[11px] h-9 gap-2 border-primary/30 text-primary hover:bg-primary/5">
                          <Video className="h-4 w-4" />
                          Dispositivo
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
                        {form.watch('document_photo_url') ? (
                          <div className="relative mb-2">
                            <img
                              src={form.watch('document_photo_url')}
                              alt="documento"
                              className="w-full rounded border border-border object-cover"
                              style={{ maxHeight: 80 }}
                            />
                            <button
                              type="button"
                              className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-black/80"
                              onClick={() => form.setValue('document_photo_url', '')}
                            >✕</button>
                          </div>
                        ) : null}
                        <div className="flex flex-col gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full h-8 text-[10px] gap-2"
                            onClick={() => openCameraDialog('document')}
                          >
                            <FileText className="h-3 w-3" />
                            {form.watch('document_photo_url') ? 'Recapturar Documento' : 'Câmera — Documento'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full text-[10px] h-8 border-dashed"
                            onClick={() => document.getElementById('provider-doc-upload')?.click()}
                          >
                            enviar arquivo — documento
                          </Button>
                          <input
                            id="provider-doc-upload"
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const url = await uploadImage(file);
                                form.setValue('document_photo_url', url);
                              }
                              e.target.value = '';
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Fields Section */}
                    <div className="flex-1 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {getFieldStatus('provider', 'fullName') !== 'hidden' && (
                          <FormField
                            control={form.control}
                            name="full_name"
                            rules={{ required: getFieldStatus('provider', 'fullName') === 'required' ? 'Nome completo é obrigatório' : false }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Nome Completo {getFieldStatus('provider', 'fullName') === 'required' ? '*' : ''}</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Ex: João Silva" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {getFieldStatus('provider', 'company') !== 'hidden' && (
                          <FormField
                            control={form.control}
                            name="company_name"
                            rules={{ required: getFieldStatus('provider', 'company') === 'required' ? 'Empresa é obrigatória' : false }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Empresa {getFieldStatus('provider', 'company') === 'required' ? '*' : ''}</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Nome da empresa" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {getFieldStatus('provider', 'cpf') !== 'hidden' && (
                          <FormField
                            control={form.control}
                            name="document"
                            rules={{ required: getFieldStatus('provider', 'cpf') === 'required' ? 'Documento é obrigatório' : false }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Documento (RG/CPF) {getFieldStatus('provider', 'cpf') === 'required' ? '*' : ''}</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Número do documento" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {getFieldStatus('provider', 'phone') !== 'hidden' && (
                          <FormField
                            control={form.control}
                            name="phone"
                            rules={{ required: getFieldStatus('provider', 'phone') === 'required' ? 'Telefone é obrigatório' : false }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Telefone {getFieldStatus('provider', 'phone') === 'required' ? '*' : ''}</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="(00) 00000-0000" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>

                      {getFieldStatus('provider', 'cnpj') !== 'hidden' && (
                        <FormField
                          control={form.control}
                          name="cnpj"
                          rules={{ required: getFieldStatus('provider', 'cnpj') === 'required' ? 'CNPJ é obrigatório' : false }}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CNPJ {getFieldStatus('provider', 'cnpj') === 'required' ? '*' : ''}</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="00.000.000/0000-00" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

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
                        name="job_function_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Função</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione a função (opcional)" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {jobFunctions.map((fn) => (
                                  <SelectItem key={fn.id} value={fn.id}>{fn.name}</SelectItem>
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

                      {/* Parking info shown after resident is selected */}
                      {selectedResident && (() => {
                        const res = residents.find(r => r.id === selectedResident);
                        if (!res) return null;
                        return (
                          <div className="flex items-center gap-2 text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
                            <span className="font-semibold text-zinc-700">{res.tower}{res.block ? ` — Bloco ${res.block}` : ''} — Unidade {res.unit_number}</span>
                            {res.parkingSpaces != null && (
                              <span className="ml-auto font-bold text-zinc-600">🅿 {res.parkingSpaces} {res.parkingSpaces === 1 ? 'vaga' : 'vagas'}</span>
                            )}
                          </div>
                        );
                      })()}

                      <div className="bg-zinc-50/50 p-4 rounded-xl border border-zinc-200/60 space-y-4">
                        <Label className="text-zinc-800 font-bold text-xs uppercase tracking-wider block border-b pb-2">Destino no Condomínio</Label>

                        <FormField
                          control={form.control}
                          name="tower"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{labels.tower}</FormLabel>
                              <FormControl>
                                <Input placeholder={`Ex: Bloco A, Rua 10...`} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="visiting_block"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{labels.block}</FormLabel>
                                <FormControl>
                                  <Input placeholder={`Ex: 1, A...`} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="visiting_unit"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{labels.unit}</FormLabel>
                                <FormControl>
                                  <Input placeholder={`Ex: 101, Ap 2B...`} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

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
                    <Button type="button" variant="outline" onClick={() => handleTabChange('lista')}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={uploading}>
                      {uploading ? 'Enviando...' : 'Concluir Cadastro'}
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
        selectedId={groupFilter || 'all'}
        onSelect={(id) => {
          if (id === 'all') setGroupFilter('');
          else if (!id.endsWith('_root')) setGroupFilter(id.replace('group_', ''));
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
                placeholder="Buscar por nome, empresa ou tipo de serviço..."
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
                <TableHead>Nome</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Localização</TableHead>
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
                providers
                  .filter(p => !groupFilter || p.service_type === groupFilter)
                  .map((provider: any) => (
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
                    <TableCell className="text-xs text-zinc-600">{formatAddress(provider.tower, provider.visiting_block, provider.visiting_unit)}</TableCell>
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
  );

  return (
    <>
      <EntityPageShell
        title="Prestadores de Serviços"
        description="Gerencie prestadores fixos e eventuais"
        tab={tab}
        onTabChange={handleTabChange}
        canRegister
        overview={<ProvidersOverview providers={providers} loading={loading} />}
        list={listContent}
        register={registerContent}
        filters={filtersContent}
      />

      <CameraCapture
        open={cameraDialogOpen}
        onOpenChange={setCameraDialogOpen}
        cameraType={cameraType}
        onCapture={handleCameraCapture}
        defaultTab={cameraDefaultTab}
      />
    </>
  );
}
