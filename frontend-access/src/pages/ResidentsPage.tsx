import { useEffect, useRef, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Pencil, Trash2, User, Camera, FileText, Video,
  Link as LinkIcon, Loader2, Download, RadioTower, X
} from 'lucide-react';
import {
  getResidents, createResident, updateResident, deleteResident,
  generateRecoveryLink, importGuaritaResidents, getGuaritaRecentSerials,
  getAccessAreas, getResidentAccessAreas, setResidentAccessAreas,
  type AccessArea, type GuaritaRecentSerial,
} from '@/db/api';
import { authRequest } from '@/services/authApi';
import { useAuth } from '@/contexts/AuthContext';
import { useForm } from 'react-hook-form';
import { uploadImage } from '@/lib/upload';
import { CameraCapture } from '@/components/CameraCapture';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { urlToBase64, formatAddress } from '@/lib/utils';
import { useCondoConfig } from '@/hooks/useCondoConfig';
import { TreeView, type TreeNode } from '@/components/TreeView';
import { EntityPageShell } from '@/components/entity/EntityPageShell';
import { ResidentsOverview } from '@/components/entity/ResidentsOverview';
import { useEntityTab, type EntityTabValue } from '@/hooks/useEntityTab';
import { ResidentOnboardingDialog, type OnboardingSuccessInfo } from '@/components/ResidentOnboardingDialog';

export default function ResidentsPage() {
  const {
    labels,
    isHorizontal,
    getFieldStatus,
    getBlacklistEntry,
    towers: condoTowers,
    units: condoUnits
  } = useCondoConfig();

  const [residents, setResidents] = useState<any[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; color?: string; hasAddresses?: boolean }>>([]);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [cameraType, setCameraType] = useState<'facial' | 'document'>('facial');
  const [cameraDefaultTab, setCameraDefaultTab] = useState<'webcam' | 'doorbell'>('webcam');
  const openCameraDialog = (type: 'facial' | 'document', tab: 'webcam' | 'doorbell' = 'webcam') => {
    setCameraType(type); setCameraDefaultTab(tab); setCameraDialogOpen(true);
  };
  const [editingResident, setEditingResident] = useState<any | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [residentToDelete, setResidentToDelete] = useState<any | null>(null);
  const [successInfo, setSuccessInfo] = useState<OnboardingSuccessInfo | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);
  // Captura de serial pelo acionamento (módulo Guarita)
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturedSerials, setCapturedSerials] = useState<GuaritaRecentSerial[]>([]);
  const captureStartRef = useRef<number>(0);
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const ADMIN_ROLES = ['admin_master', 'gestor_condominio', 'ADMIN', 'admin'];
  const isAdmin = ADMIN_ROLES.includes(user?.role || '');
  const canEdit = isAdmin || user?.permissions?.editRegistration === true;
  const canDelete = isAdmin || user?.permissions?.deleteRegistration === true;

  const { tab, setTab } = useEntityTab({ canRegister: canEdit });

  const form = useForm({
    defaultValues: {
      full_name: '',
      cpf: '',
      rg: '',
      phone: '',
      email: '',
      unit_number: '',
      block: '',
      tower: '',
      photo_url: '',
      document_photo_url: '',
      notes: '',
      access_levels: [] as string[],
      is_owner: true,
      parkingSpaces: '',
      vehiclePlate: '',
      department_id: ''
    }
  });

  const selectedTower = form.watch('tower');
  const selectedBlock = form.watch('block');

  const selectedTowerObj = condoTowers.find((t) => t.name === selectedTower);
  const availableBlocks = selectedTowerObj?.blocks || [];

  const selectedBlockObj = availableBlocks.find((b: any) => b.name === selectedBlock);
  const availableUnits = condoUnits.filter((u) => {
    if (!selectedTowerObj) return false;
    if (selectedBlockObj) {
      return u.towerId === selectedTowerObj.id && u.blockId === selectedBlockObj.id;
    }
    // Quadra não selecionada → mostra todas as unidades da rua
    return u.towerId === selectedTowerObj.id;
  });

  useEffect(() => {
    if (tab === 'cadastrar') {
      // Clear cascading sub-fields when tower changes only if user is actively filling form
      form.setValue('block', '');
      form.setValue('unit_number', '');
    }
  }, [selectedTower]);

  useEffect(() => {
    if (tab === 'cadastrar') {
      form.setValue('unit_number', '');
    }
  }, [selectedBlock]);

  // Polling da captura de serial: enquanto o painel está aberto, consulta o
  // buffer de acionamentos do módulo a cada 2s e mostra o que chegou depois
  // da abertura (operador aperta o botão do controle e o serial aparece).
  useEffect(() => {
    if (!captureOpen) return;
    captureStartRef.current = Date.now() - 3000; // pequena folga pra trás
    setCapturedSerials([]);
    const timer = setInterval(async () => {
      try {
        const { serials } = await getGuaritaRecentSerials();
        setCapturedSerials(serials.filter(s => new Date(s.dateTime).getTime() >= captureStartRef.current));
      } catch { /* módulo/api fora: painel só fica vazio */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [captureOpen]);

  const selectedDepartmentId = form.watch('department_id');
  const selectedDepartment = departments.find(d => d.id === selectedDepartmentId);
  const showAddresses = selectedDepartment ? selectedDepartment.hasAddresses !== false : true;

  const [accessAreas, setAccessAreas] = useState<AccessArea[]>([]);
  const [uploading, setUploading] = useState(false);

  // Helper para anexar token às URLs de fotos proxied
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

  useEffect(() => {
    loadResidents();
  }, [search]);

  useEffect(() => {
    getAccessAreas().then(setAccessAreas).catch(() => {});
    authRequest<any>('/departments').then(res => {
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      setDepartments(list);
    }).catch(() => {});
  }, []);

  const loadResidents = async () => {
    try {
      setLoading(true);
      const { data } = await getResidents(1, 100, search);
      setResidents(data);
    } catch (error) {
      console.error('Erro ao carregar moradores:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRecoveryLink = async (id: string) => {
    try {
      setGeneratingLink(id);
      const response = await generateRecoveryLink(id);
      if (response && response.onboarding_url) {
        const resident = residents.find((r) => r.id === id);
        setSuccessInfo({
          url: response.onboarding_url,
          phone: resident?.phone || '',
          email: resident?.email || ''
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.response?.data?.error || 'Falha ao gerar link de acesso.',
        variant: 'destructive',
      });
    } finally {
      setGeneratingLink(null);
    }
  };

  const handleOpenDialog = (resident?: any) => {
    if (resident) {
      setEditingResident(resident);
      form.reset({
        full_name: resident.full_name,
        cpf: resident.cpf || '',
        rg: resident.rg || '',
        phone: resident.phone || '',
        email: resident.email || '',
        unit_number: resident.unit_number || '',
        block: resident.block || '',
        tower: resident.tower || '',
        photo_url: resident.photo_url || '',
        document_photo_url: resident.document_photo_url || '',
        notes: resident.notes || '',
        access_levels: [],
        is_owner: resident.is_owner ?? true,
        parkingSpaces: resident.parkingSpaces !== null && resident.parkingSpaces !== undefined ? String(resident.parkingSpaces) : '',
        vehiclePlate: resident.vehiclePlate || '',
        cardSerial: resident.cardSerial || '',
        txSerial: resident.txSerial || '',
        department_id: resident.department?.id || resident.department_id || ''
      });
      getResidentAccessAreas(resident.id).then(areaIds => {
        form.setValue('access_levels', areaIds);
      }).catch(() => {});
    } else {
      setEditingResident(null);
      form.reset({
        full_name: '',
        cpf: '',
        rg: '',
        phone: '',
        email: '',
        unit_number: '',
        block: '',
        tower: '',
        photo_url: '',
        document_photo_url: '',
        notes: '',
        access_levels: [],
        is_owner: true,
        parkingSpaces: '',
        vehiclePlate: '',
        cardSerial: '',
        txSerial: '',
        department_id: ''
      });
    }
    setTab('cadastrar');
  };

  const handleTabChange = (t: EntityTabValue) => {
    if (t === 'cadastrar') {
      handleOpenDialog();
      return;
    }
    setEditingResident(null);
    form.reset();
    setTab(t);
  };

  const handleCameraCapture = (imageUrl: string) => {
    if (cameraType === 'facial') {
      form.setValue('photo_url', imageUrl);
    } else {
      form.setValue('document_photo_url', imageUrl);
    }
    toast({
      title: 'Sucesso',
      description: 'Foto capturada com sucesso'
    });
  };

  const onSubmit = async (data: any) => {
    try {
      const blacklistEntry = getBlacklistEntry(data.cpf || '');
      if (blacklistEntry) {
        toast({
          title: 'Bloqueio de Segurança (Blacklist)',
          description: `Bloqueio Total: Esta pessoa está na blacklist! Motivo: ${blacklistEntry.reason}. Cadastro não permitido.`,
          variant: 'destructive',
        });
        return;
      }

      const photoStatus = getFieldStatus('resident', 'photo');
      if (photoStatus === 'required' && !data.photo_url) {
        toast({
          title: 'Foto Obrigatória',
          description: 'A foto de perfil do morador é obrigatória conforme as diretrizes do condomínio.',
          variant: 'destructive',
        });
        return;
      }

      setUploading(true);

      // Toast com o resultado do push pro módulo Guarita (tag/controle)
      const notifyGuaritaSync = (sync: { attempted: boolean; ok: boolean; message: string } | undefined) => {
        if (!sync?.attempted) return;
        toast({
          title: sync.ok ? 'Módulo Guarita atualizado' : 'Falha ao gravar no módulo Guarita',
          description: sync.message,
          variant: sync.ok ? 'default' : 'destructive',
        });
      };

      let residentId = '';
      if (editingResident) {
        const updateResp: any = await updateResident(editingResident.id, data);
        residentId = editingResident.id;
        await setResidentAccessAreas(residentId, data.access_levels || []).catch(() => {});
        toast({
          title: 'Sucesso',
          description: 'Morador atualizado com sucesso'
        });
        notifyGuaritaSync(updateResp?.guaritaSync);
      } else {
        // Converter photo_url para base64 antes de enviar ao backend
        let photoBase64: string | undefined = undefined;
        if (data.photo_url) {
          try {
            photoBase64 = await urlToBase64(data.photo_url);
          } catch (e) {
            console.warn('Não foi possível converter foto para base64:', e);
          }
        }

        const response: any = await createResident({
          ...data,
          photoBase64: photoBase64 || undefined,
        });
        residentId = response.id;
        if (data.access_levels?.length) {
          await setResidentAccessAreas(residentId, data.access_levels).catch(() => {});
        }
        toast({
          title: 'Sucesso',
          description: 'Morador cadastrado com sucesso'
        });
        notifyGuaritaSync(response?.guaritaSync);

        if (response.onboarding_url) {
          setSuccessInfo({
            url: response.onboarding_url,
            phone: data.phone || '',
            email: data.email || ''
          });
        }
      }

      form.reset();
      setEditingResident(null);
      setTab('lista');
      loadResidents();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar morador',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!residentToDelete) return;

    try {
      await deleteResident(residentToDelete.id);
      toast({
        title: 'Sucesso',
        description: 'Morador excluído com sucesso'
      });
      setDeleteDialogOpen(false);
      setResidentToDelete(null);
      loadResidents();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao excluir morador',
        variant: 'destructive'
      });
    }
  };

  const handleImportGuarita = async () => {
    try {
      setIsImporting(true);
      const res = await importGuaritaResidents('default');
      toast({
        title: 'Importação Concluída',
        description: `Foram importados ${res.imported} novos moradores de um total de ${res.totalFound} dispositivos.`,
      });
      loadResidents();
    } catch (error: any) {
      toast({
        title: 'Erro na importação',
        description: error.message || 'Erro ao comunicar com o Guarita IP',
        variant: 'destructive'
      });
    } finally {
      setIsImporting(false);
    }
  };

  const treeData: TreeNode[] = [
    {
      id: 'all',
      name: 'Todos os Moradores',
      type: 'group'
    }
  ];

  if (departments && departments.length > 0) {
    departments.forEach(d => {
      const deptNode: TreeNode = {
        id: `dept___${d.id}`,
        name: d.name,
        type: 'group',
        children: []
      };

      if (d.hasAddresses !== false && condoTowers && condoTowers.length > 0) {
        condoTowers.forEach((t: any) => {
          const towerNode: TreeNode = {
            id: `dept___${d.id}___tower___${t.name}`,
            name: `${labels.tower} ${t.name}`,
            type: 'group',
            children: []
          };

          if (t.blocks && t.blocks.length > 0) {
            t.blocks.forEach((b: any) => {
              towerNode.children!.push({
                id: `dept___${d.id}___tower___${t.name}___block___${b.name}`,
                name: `${labels.block} ${b.name}`,
                type: 'item'
              });
            });
          } else {
            // If no blocks, the tower itself is a selectable leaf
            towerNode.type = 'item';
            delete towerNode.children;
          }

          deptNode.children!.push(towerNode);
        });
      } else {
        deptNode.type = 'item';
        delete deptNode.children;
      }

      treeData.push(deptNode);
    });
  } else if (condoTowers && condoTowers.length > 0) {
    const rootNode: TreeNode = {
      id: 'towers_root',
      name: labels.towers,
      type: 'group',
      children: []
    };
    condoTowers.forEach((t: any) => {
      const towerNode: TreeNode = {
        id: `tower___${t.name}`,
        name: `${labels.tower} ${t.name}`,
        type: t.blocks?.length > 0 ? 'group' : 'item',
        children: []
      };
      
      if (t.blocks && t.blocks.length > 0) {
        t.blocks.forEach((b: any) => {
          towerNode.children!.push({
            id: `tower___${t.name}___block___${b.name}`,
            name: `${labels.block} ${b.name}`,
            type: 'item'
          });
        });
      } else {
        delete towerNode.children;
      }
      rootNode.children!.push(towerNode);
    });
    treeData.push(rootNode);
  }

  const headerActions = canEdit ? (
    <Button variant="outline" onClick={handleImportGuarita} disabled={isImporting}>
      {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
      Importar do Guarita IP
    </Button>
  ) : undefined;

  const registerContent = (
    <Card className="border-zinc-200 shadow-sm rounded-2xl overflow-hidden p-0 gap-0">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 bg-white overflow-hidden">
                {/* Header */}
                <div className="px-7 py-4 border-b bg-white flex-shrink-0">
                  <h2 className="text-xl font-bold flex gap-2.5 items-center text-zinc-800">
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                      <User className="h-4 w-4 text-red-600" />
                    </div>
                    {editingResident ? 'Editar Morador' : 'Cadastrar Novo Morador'}
                  </h2>
                  <p className="sr-only">
                    Formulário para cadastro ou edição de dados de moradores.
                  </p>
                </div>

                <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
                  {/* Left Column (Photo & Document) - Sidebar Style */}
                  <div className="w-full md:w-[260px] flex-shrink-0 bg-zinc-50/60 border-r border-zinc-100 px-5 py-6 overflow-y-auto flex flex-col gap-4">
                    {/* Foto facial */}
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest mb-1">Foto Facial</span>
                      <div className="w-full aspect-square relative group border-2 border-zinc-200 rounded-2xl bg-white overflow-hidden flex flex-col items-center justify-center transition-all hover:border-red-300 shadow-sm">
                        {form.watch('photo_url') ? (
                          <>
                            <img
                              src={getProxiedPhotoUrl(form.watch('photo_url'))}
                              className="w-full h-full object-cover"
                              alt="Face capture"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                              <Button type="button" size="sm" variant="secondary" onClick={() => openCameraDialog('facial', 'webcam')} className="h-8 text-xs font-bold px-3 rounded-lg">
                                Trocar
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-zinc-300">
                            <Camera className="h-10 w-10" />
                            <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">Sem foto</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Botões de captura */}
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        onClick={() => openCameraDialog('facial', 'webcam')}
                        className="w-full bg-red-600 hover:bg-red-700 text-white h-9 text-xs font-bold rounded-xl transition-all shadow-sm"
                      >
                        <Camera className="mr-1.5 h-3.5 w-3.5" />
                        Câmera Local
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openCameraDialog('facial', 'doorbell')}
                        className="w-full h-9 text-xs gap-2 rounded-xl font-semibold border-red-200 text-red-700 hover:bg-red-50 transition-all"
                      >
                        <Video className="h-3.5 w-3.5" />
                        Dispositivo
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('res-photo-upload')?.click()}
                        className="w-full text-xs h-9 border-zinc-200 font-semibold text-zinc-500 hover:bg-white hover:text-zinc-800 rounded-xl transition-all"
                      >
                        Enviar em Arquivo
                      </Button>
                      <input
                        id="res-photo-upload"
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            try {
                              setUploading(true);
                              const url = await uploadImage(file, 'app-9hbwbnibthc3_access_images');
                              form.setValue('photo_url', url);
                            } catch (err) {
                              toast({ title: 'Erro', description: 'Erro no upload', variant: 'destructive' });
                            } finally {
                              setUploading(false);
                            }
                          }
                        }}
                      />
                    </div>

                    {/* Divisor */}
                    <div className="border-t border-zinc-200 pt-4">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-widest block text-center mb-3">Documento (Opc.)</span>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openCameraDialog('document', 'webcam')}
                        className={`w-full h-9 text-xs gap-2 rounded-xl font-semibold uppercase tracking-wide transition-all ${
                          form.watch('document_photo_url')
                            ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                            : 'border-zinc-200 text-zinc-500 hover:bg-white'
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {form.watch('document_photo_url') ? 'Doc. Salvo ✓' : 'Foto Documento'}
                      </Button>
                    </div>
                  </div>

                  {/* Right Column (Tabs & Settings) - Form Fields */}
                  <div className="flex-1 overflow-hidden flex flex-col bg-white">
                    <Tabs defaultValue="dados" className="h-full flex flex-col">
                      <TabsList className="flex w-full justify-start h-12 bg-zinc-50 rounded-none px-6 gap-1 border-b border-zinc-200 shrink-0 overflow-x-auto">
                        <TabsTrigger value="dados" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-red-600 data-[state=active]:border data-[state=active]:border-zinc-200 rounded-lg px-4 h-8 font-semibold text-xs text-zinc-500 transition-all">
                          Dados Básicos
                        </TabsTrigger>
                        <TabsTrigger value="local" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-red-600 data-[state=active]:border data-[state=active]:border-zinc-200 rounded-lg px-4 h-8 font-semibold text-xs text-zinc-500 transition-all">
                          Local / Bloco
                        </TabsTrigger>
                        <TabsTrigger value="acesso" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-red-600 data-[state=active]:border data-[state=active]:border-zinc-200 rounded-lg px-4 h-8 font-semibold text-xs text-zinc-500 transition-all">
                          Níveis de Acesso
                        </TabsTrigger>
                        <TabsTrigger value="outros" className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-red-600 data-[state=active]:border data-[state=active]:border-zinc-200 rounded-lg px-4 h-8 font-semibold text-xs text-zinc-500 transition-all">
                          Outros / Atributos
                        </TabsTrigger>
                      </TabsList>

                      <div className="flex-1 overflow-y-auto px-7 py-5 relative">
                        {/* 1. DADOS BÁSICOS */}
                        <TabsContent value="dados" className="mt-0 space-y-4 animate-in fade-in duration-200">
                          {getFieldStatus('resident', 'fullName') !== 'hidden' && (
                            <FormField
                              control={form.control}
                              name="full_name"
                              rules={{ required: getFieldStatus('resident', 'fullName') === 'required' ? 'Nome completo é obrigatório' : false }}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">
                                    Nome Completo {getFieldStatus('resident', 'fullName') === 'required' ? '*' : ''}
                                  </FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Ex: João Silva" className="h-10 bg-white border-zinc-200 rounded-lg focus:ring-red-500 focus:border-red-400 transition-all text-sm px-3" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          <div className="grid grid-cols-2 gap-4">
                            {getFieldStatus('resident', 'cpf') !== 'hidden' && (
                              <FormField
                                control={form.control}
                                name="cpf"
                                rules={{ required: getFieldStatus('resident', 'cpf') === 'required' ? 'CPF é obrigatório' : false }}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">
                                      CPF {getFieldStatus('resident', 'cpf') === 'required' ? '*' : ''}
                                    </FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="000.000.000-00" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {getFieldStatus('resident', 'rg') !== 'hidden' && (
                              <FormField
                                control={form.control}
                                name="rg"
                                rules={{ required: getFieldStatus('resident', 'rg') === 'required' ? 'RG é obrigatório' : false }}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">
                                      RG {getFieldStatus('resident', 'rg') === 'required' ? '*' : ''}
                                    </FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Número do RG" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            {getFieldStatus('resident', 'phone') !== 'hidden' && (
                              <FormField
                                control={form.control}
                                name="phone"
                                rules={{ required: getFieldStatus('resident', 'phone') === 'required' ? 'Telefone é obrigatório' : false }}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">
                                      Telefone Celular {getFieldStatus('resident', 'phone') === 'required' ? '*' : ''}
                                    </FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="(00) 00000-0000" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {getFieldStatus('resident', 'email') !== 'hidden' && (
                              <FormField
                                control={form.control}
                                name="email"
                                rules={{ required: getFieldStatus('resident', 'email') === 'required' ? 'E-mail é obrigatório' : false }}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">
                                      E-mail {getFieldStatus('resident', 'email') === 'required' ? '*' : ''}
                                    </FormLabel>
                                    <FormControl>
                                      <Input {...field} type="email" placeholder="email@exemplo.com" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            {getFieldStatus('resident', 'vehiclePlate') !== 'hidden' && (
                              <FormField
                                control={form.control}
                                name="vehiclePlate"
                                rules={{ required: getFieldStatus('resident', 'vehiclePlate') === 'required' ? 'Placa do veículo é obrigatória' : false }}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">
                                      Placa do Veículo {getFieldStatus('resident', 'vehiclePlate') === 'required' ? '*' : ''}
                                    </FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Ex: ABC-1234" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}

                            {getFieldStatus('resident', 'parkingSpaces') !== 'hidden' && (
                              <FormField
                                control={form.control}
                                name="parkingSpaces"
                                rules={{ required: getFieldStatus('resident', 'parkingSpaces') === 'required' ? 'Vagas de garagem é obrigatório' : false }}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">
                                      {labels.garageLabel} {getFieldStatus('resident', 'parkingSpaces') === 'required' ? '*' : ''}
                                    </FormLabel>
                                    <FormControl>
                                      <Input {...field} type="number" placeholder="Ex: 2" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            )}
                          </div>
                        </TabsContent>

                        {/* 2. LOCAL */}
                        <TabsContent value="local" className="mt-0 space-y-8 animate-in slide-in-from-right-4 duration-500 fade-in">
                          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
                            <h3 className="text-lg font-bold text-zinc-800 border-b pb-4">Endereço / Alocação</h3>

                            <FormField
                              control={form.control}
                              name="department_id"
                              rules={{ required: 'Departamento é obrigatório' }}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-800 font-bold text-sm">Departamento *</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value || ''}>
                                    <FormControl>
                                      <SelectTrigger className="h-12 bg-white border-zinc-200 rounded-xl text-zinc-700 text-base px-4">
                                        <SelectValue placeholder="Selecione o departamento..." />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="rounded-xl border-zinc-100">
                                      {departments.map((d) => (
                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {showAddresses && (
                              <>
                                <FormField
                              control={form.control}
                              name="tower"
                              rules={{ required: `${labels.tower} é obrigatória` }}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-800 font-bold text-sm">{labels.tower} *</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger className="h-12 bg-white border-zinc-200 rounded-xl text-zinc-700 text-base px-4">
                                        <SelectValue placeholder={`Selecione a ${labels.tower.toLowerCase()}...`} />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="rounded-xl border-zinc-100">
                                      {condoTowers.length > 0 ? condoTowers.map((t, idx) => (
                                        <SelectItem key={idx} value={t.name}>{t.name}</SelectItem>
                                      )) : (
                                        <div className="p-3 text-sm text-zinc-500 italic">Nenhuma {labels.tower.toLowerCase()} cadastrada.</div>
                                      )}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="grid grid-cols-2 gap-6">
                              <FormField
                                control={form.control}
                                name="block"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-800 font-bold text-sm">{labels.block} <span className="text-zinc-400 font-normal text-xs">(opcional)</span></FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedTower}>
                                      <FormControl>
                                        <SelectTrigger className="h-12 bg-white border-zinc-200 rounded-xl text-zinc-700 text-base px-4">
                                          <SelectValue placeholder={selectedTower ? `Selecione o ${labels.block.toLowerCase()}...` : 'Selecione a rua primeiro'} />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="rounded-xl border-zinc-100">
                                        {availableBlocks.length > 0 ? availableBlocks.map((b: any, idx: number) => (
                                          <SelectItem key={idx} value={b.name}>{b.name}</SelectItem>
                                        )) : (
                                          <div className="p-3 text-sm text-zinc-500 italic">Nenhum {labels.block.toLowerCase()} cadastrado.</div>
                                        )}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="unit_number"
                                rules={{ required: `${labels.unit} é obrigatória` }}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-800 font-bold text-sm">{labels.unit} *</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value} disabled={!selectedTowerObj}>
                                      <FormControl>
                                        <SelectTrigger className="h-12 bg-white border-zinc-200 rounded-xl text-zinc-700 text-base px-4">
                                          <SelectValue placeholder={selectedTowerObj ? `Selecione a ${labels.unit.toLowerCase()}...` : 'Selecione a rua primeiro'} />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent className="rounded-xl border-zinc-100">
                                        {availableUnits.length > 0 ? availableUnits.map((u: any, idx: number) => (
                                          <SelectItem key={idx} value={u.number}>{u.number} {isHorizontal ? '' : `(${u.floor || 0}º andar)`}</SelectItem>
                                        )) : (
                                          <div className="p-3 text-sm text-zinc-500 italic">Nenhuma {labels.unit.toLowerCase()} cadastrada.</div>
                                        )}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            </>
                          )}
                          </div>
                        </TabsContent>

                        {/* 3. ACESSO */}
                        <TabsContent value="acesso" className="mt-0 space-y-4 animate-in slide-in-from-right-4 duration-500 fade-in">
                          <div className="bg-white p-5 border border-zinc-200 rounded-2xl shadow-sm">
                            <p className="text-sm font-semibold text-zinc-700 mb-1">Áreas do condomínio</p>
                            <p className="text-xs text-zinc-400 mb-4">Selecione as áreas que este morador tem permissão de acesso.</p>
                            {accessAreas.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                                <FileText className="h-8 w-8 text-zinc-300" />
                                <p className="text-sm text-zinc-400">Nenhuma área configurada. Acesse o painel admin para cadastrar as áreas do condomínio.</p>
                              </div>
                            ) : (
                              <FormField
                                control={form.control}
                                name="access_levels"
                                render={({ field }) => (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {accessAreas.map(area => {
                                      const checked = (field.value || []).includes(area.id);
                                      return (
                                        <label
                                          key={area.id}
                                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none ${
                                            checked
                                              ? 'border-red-400 bg-red-50 text-red-700'
                                              : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300'
                                          }`}
                                        >
                                          <Checkbox
                                            checked={checked}
                                            onCheckedChange={v => {
                                              const current = field.value || [];
                                              field.onChange(
                                                v ? [...current, area.id] : current.filter((id: string) => id !== area.id)
                                              );
                                            }}
                                            className="h-4 w-4 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                                          />
                                          <span className="text-lg leading-none">{area.icon}</span>
                                          <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-medium truncate">{area.name}</span>
                                            {area.description && (
                                              <span className="text-xs text-zinc-400 truncate">{area.description}</span>
                                            )}
                                          </div>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              />
                            )}
                          </div>

                          <div className="bg-white p-5 border border-zinc-200 rounded-2xl shadow-sm mt-4">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-semibold text-zinc-700">Dispositivos Físicos (Nice Guarita)</p>
                              <Button
                                type="button"
                                variant={captureOpen ? 'destructive' : 'outline'}
                                size="sm"
                                className="h-8 text-xs gap-1.5"
                                onClick={() => setCaptureOpen(v => !v)}
                              >
                                {captureOpen ? <X className="h-3.5 w-3.5" /> : <RadioTower className="h-3.5 w-3.5" />}
                                {captureOpen ? 'Parar captura' : 'Capturar acionamento'}
                              </Button>
                            </div>
                            <p className="text-xs text-zinc-400 mb-4">
                              Cadastre as tags e controles remotos do morador (hexadecimal) — ao salvar, o sistema grava
                              automaticamente no módulo. Ou use "Capturar acionamento" e pressione o botão do controle
                              perto do receptor para preencher o serial sem digitar.
                            </p>
                            {captureOpen && (
                              <div className="mb-4 p-4 rounded-xl border border-blue-200 bg-blue-50/60">
                                <p className="text-xs font-medium text-blue-700 mb-2 flex items-center gap-1.5">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Pressione o botão do controle (ou aproxime a tag) agora...
                                </p>
                                {capturedSerials.length === 0 ? (
                                  <p className="text-xs text-blue-500/70">
                                    Aguardando acionamento. Se o serial não aparecer, o receptor pode não encaminhar
                                    dispositivos ainda não cadastrados — nesse caso, digite o serial impresso no controle.
                                  </p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {capturedSerials.map((s, i) => (
                                      <div key={`${s.serial}-${s.dateTime}-${i}`} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-blue-100 px-3 py-1.5">
                                        <div className="min-w-0">
                                          <span className="text-xs font-mono font-semibold text-zinc-800">{s.serial}</span>
                                          <span className="text-[11px] text-zinc-400 ml-2">
                                            {new Date(s.dateTime).toLocaleTimeString('pt-BR')}
                                            {s.knownPerson ? ` · já vinculado a ${s.knownPerson}` : ' · não cadastrado'}
                                          </span>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                                            onClick={() => { form.setValue('txSerial', s.serial); setCaptureOpen(false); }}>
                                            → Controle
                                          </Button>
                                          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                                            onClick={() => { form.setValue('cardSerial', s.serial); setCaptureOpen(false); }}>
                                            → Tag
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name="cardSerial"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">
                                      Serial do Cartão / Tag Ativa
                                    </FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Ex: 1A2B3C" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3 uppercase" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name="txSerial"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">
                                      Serial do Controle de Portão (TX)
                                    </FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Ex: A1B2C3D" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3 uppercase" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        </TabsContent>

                        {/* 4. OUTROS */}
                        <TabsContent value="outros" className="mt-0 space-y-6 animate-in slide-in-from-right-4 duration-500 fade-in">
                          <div className="bg-white p-6 border border-zinc-200 rounded-2xl shadow-sm space-y-6">
                            <FormField
                              control={form.control}
                              name="is_owner"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-4 space-y-0 p-5 border border-zinc-200 rounded-xl bg-zinc-50/50">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      className="h-5 w-5 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600 mt-0.5"
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel className="text-base font-bold text-zinc-800 cursor-pointer select-none">Proprietário do Imóvel</FormLabel>
                                    <p className="text-sm text-zinc-500">Marque se este morador é o dono responsável pela unidade.</p>
                                  </div>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="notes"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-800 font-bold text-sm">Observações e Informações Adicionais</FormLabel>
                                  <FormControl>
                                    <Textarea {...field} placeholder="Observações..." rows={5} className="bg-white border-zinc-200 rounded-xl resize-none p-4 text-base focus:ring-red-500" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          {departments.length > 0 && (
                            <div className="mt-4">
                              <label className="text-zinc-800 font-bold text-sm block mb-1">Departamento</label>
                              <select
                                className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-base bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                                value={form.watch('department_id')}
                                onChange={e => form.setValue('department_id', e.target.value)}
                              >
                                <option value="">Sem departamento</option>
                                {departments.map(d => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </TabsContent>
                      </div>
                    </Tabs>
                  </div>
                </div>

                {/* Footer Action Bar */}
                <div className="flex justify-end gap-3 px-7 py-4 border-t border-zinc-200 bg-zinc-50 shrink-0 rounded-b-2xl">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleTabChange('lista')}
                    className="h-10 px-8 rounded-xl font-semibold text-zinc-500 hover:bg-zinc-100 border-zinc-200"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={uploading}
                    className="h-10 px-8 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-md shadow-red-600/20 min-w-[180px] transition-all"
                  >
                    {uploading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        SALVANDO...
                      </span>
                    ) : (
                      editingResident ? 'SALVAR ALTERAÇÕES' : 'CONCLUIR CADASTRO'
                    )}
                  </Button>
                </div>
              </form>
            </Form>
    </Card>
  );

  const filtersContent = (
    <div className="h-[calc(100vh-360px)] min-h-[300px] overflow-y-auto">
      <TreeView
        data={treeData}
        selectedId={departmentFilter || 'all'}
        onSelect={(id) => {
          if (id === 'all') setDepartmentFilter('');
          else if (!id.endsWith('_root')) setDepartmentFilter(id);
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
                  placeholder="Buscar moradores..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-12 h-12 bg-zinc-50 border-zinc-200 rounded-xl shadow-none focus:ring-red-600 focus:bg-white transition-all text-base"
                />
              </div>
            </div>
          </CardHeader>
        <CardContent className="p-0 bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50/80 border-b-zinc-200">
                <TableHead className="w-[80px] pl-8">Foto</TableHead>
                <TableHead className="font-bold text-zinc-600">Nome do Morador</TableHead>
                <TableHead className="font-bold text-zinc-600">Documento</TableHead>
                <TableHead className="font-bold text-zinc-600">Local</TableHead>
                <TableHead className="font-bold text-zinc-600">Departamento</TableHead>
                <TableHead className="font-bold text-zinc-600">Contato</TableHead>
                <TableHead className="font-bold text-zinc-600">Status Integ.</TableHead>
                <TableHead className="text-right pr-8 font-bold text-zinc-600">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-8"><Skeleton className="h-12 w-12 rounded-full bg-zinc-100" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40 bg-zinc-100" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32 bg-zinc-100" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16 bg-zinc-100" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28 bg-zinc-100" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 bg-zinc-100" /></TableCell>
                    <TableCell className="text-right pr-8"><Skeleton className="h-10 w-24 bg-zinc-100 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : residents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-24 text-zinc-400">
                    <div className="flex flex-col items-center gap-3">
                      <User className="h-12 w-12 text-zinc-200" />
                      <p className="text-base font-medium">Nenhum morador encontrado.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                residents
                .filter(r => {
                  if (!departmentFilter || departmentFilter === 'all') return true;
                  
                  // Parse composite filter: dept___X___tower___Y___block___Z
                  const parts = departmentFilter.split('___');
                  let match = true;
                  for (let i = 0; i < parts.length; i += 2) {
                    const key = parts[i];
                    const val = parts[i + 1];
                    if (key === 'dept') {
                      if (r.department?.id !== val && r.department_id !== val) match = false;
                    } else if (key === 'tower') {
                      if (r.tower !== val) match = false;
                    } else if (key === 'block') {
                      if (r.block !== val) match = false;
                    }
                  }
                  return match;
                })
                .map((resident) => (
                  <TableRow key={resident.id} className="hover:bg-zinc-50 transition-colors border-zinc-100 group">
                    <TableCell className="pl-8 py-4">
                      <Avatar className="h-12 w-12 border border-zinc-200 shadow-sm">
                        <AvatarImage
                          src={getProxiedPhotoUrl(resident.photo_url)}
                          alt={resident.full_name}
                        />
                        <AvatarFallback className="bg-zinc-100 text-zinc-400 font-bold">
                          {resident.full_name?.substring(0, 2).toUpperCase() || <User className="h-5 w-5" />}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-zinc-900 text-base">{resident.full_name}</div>
                      {resident.is_owner ? (
                        <div className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mt-0.5">Proprietário</div>
                      ) : (
                        <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-400 mt-0.5">Morador</div>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500 font-mono text-sm">{resident.cpf || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="font-bold bg-white border-zinc-200 text-zinc-700 px-3 py-1 w-fit text-xs">
                          {formatAddress(resident.tower, resident.block, resident.unit_number)}
                        </Badge>
                        {resident.parkingSpaces != null && resident.parkingSpaces > 0 && (
                          <span className="text-[10px] text-zinc-400 font-semibold">🅿 {resident.parkingSpaces} {resident.parkingSpaces === 1 ? 'vaga' : 'vagas'}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {resident.department ? (
                        <Badge variant="outline" className="text-xs border-blue-200 text-blue-700 bg-blue-50">
                          {resident.department.name}
                        </Badge>
                      ) : <span className="text-zinc-400 text-xs">-</span>}
                    </TableCell>
                    <TableCell className="text-zinc-600">{resident.phone || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-green-600 font-bold text-[11px] uppercase tracking-wider bg-green-50 px-2 py-1 rounded-md inline-flex border border-green-100">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Ativo
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(resident)}
                            className="hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 h-9 w-9 rounded-lg"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleGenerateRecoveryLink(resident.id)}
                          title="Gerar Link de Acesso"
                          disabled={generatingLink === resident.id}
                          className="hover:bg-red-50 text-zinc-400 hover:text-red-600 h-9 w-9 rounded-lg"
                        >
                          {generatingLink === resident.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <LinkIcon className="h-4 w-4" />
                          )}
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setResidentToDelete(resident);
                              setDeleteDialogOpen(true);
                            }}
                            className="hover:bg-red-50 text-zinc-400 hover:text-red-600 h-9 w-9 rounded-lg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
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
        title="Moradores"
        description="Gerencie os moradores do condomínio"
        tab={tab}
        onTabChange={handleTabChange}
        canRegister={canEdit}
        headerActions={headerActions}
        overview={<ResidentsOverview residents={residents} loading={loading} />}
        list={listContent}
        register={registerContent}
        filters={filtersContent}
      />

      <ResidentOnboardingDialog
        open={!!successInfo}
        onOpenChange={(open) => { if (!open) setSuccessInfo(null); }}
        info={successInfo}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl font-black text-red-600">Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-600 text-base">
              Tem certeza que deseja excluir permanentemente o morador <strong>{residentToDelete?.full_name}</strong>? Esta ação revogará qualquer acesso existente de imediato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3">
            <AlertDialogCancel className="font-bold rounded-xl border-zinc-200 h-12 px-6">CANCELAR</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white font-black rounded-xl h-12 px-6">EXCLUIR AGORA</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
