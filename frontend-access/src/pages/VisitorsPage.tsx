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
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { getHikcentralVisitantes, createVisitor, updateVisitor, createVisitLog, getAllResidentsForSelect, getActiveTowers } from '@/db/api';
import { urlToBase64, formatAddress } from '@/lib/utils';
import { createAppointment, reapplyAuthorization, getAccessLevels, authorizeHikPerson } from '@/services/hikcentral';
import { useAuth } from '@/contexts/AuthContext';
import type { Visitor, Tower } from '@/types';
import { Plus, Search, User, Clock, Camera, FileText, Video, Pencil } from 'lucide-react';
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
import { VisitorsOverview } from '@/components/entity/VisitorsOverview';
import { useEntityTab, type EntityTabValue } from '@/hooks/useEntityTab';

export default function VisitorsPage() {
  const {
    labels,
    isHorizontal,
    getFieldStatus,
    getBlacklistEntry,
    isTimeAllowed,
    towers: condoTowers,
    units: condoUnits
  } = useCondoConfig();

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [residents, setResidents] = useState<Array<{ id: string; full_name: string; unit_number: string; block: string | null; tower: string | null; parkingSpaces: number | null }>>([]);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [accessLevels, setAccessLevels] = useState<{ accessLevelIndexCode: string; accessLevelName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { tab, setTab } = useEntityTab({ canRegister: true });
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null);
  const [existingQuery, setExistingQuery] = useState('');
  const [existingOpen, setExistingOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [cameraType, setCameraType] = useState<'facial' | 'document'>('facial');
  const [cameraDefaultTab, setCameraDefaultTab] = useState<'webcam' | 'doorbell'>('webcam');
  const { profile } = useAuth();
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      full_name: '',
      document: '',
      phone: '',
      photo_url: '',
      document_photo_url: '',
      visiting_unit: '',
      visiting_block: '',
      tower: '',
      visiting_resident: '',
      purpose: '',
      notes: '',
      accessLevelIndexCode: '0',
      plateNo: ''
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

  // Auto-fill tower/block/unit when a resident is selected
  useEffect(() => {
    if (!selectedResident) return;
    const res = residents.find((r) => r.id === selectedResident);
    if (!res) return;
    form.setValue('tower', res.tower || '');
    form.setValue('visiting_block', res.block || '');
    form.setValue('visiting_unit', res.unit_number || '');
  }, [selectedResident]);

  useEffect(() => {
    if (tab === 'cadastrar' && !selectedResident) {
      form.setValue('visiting_block', '');
      form.setValue('visiting_unit', '');
    }
  }, [selectedTower]);

  useEffect(() => {
    if (tab === 'cadastrar' && !selectedResident) {
      form.setValue('visiting_unit', '');
    }
  }, [selectedBlock]);

  const [uploading, setUploading] = useState(false);

  // @ts-ignore - Ignore type differences for now
  const dropzoneProps = useFileUpload({
    maxFiles: 1,
    maxFileSize: 1024 * 1024
  });

  useEffect(() => {
    loadVisitors();
    loadResidents();
    loadTowers();
    loadAccessLevels();
  }, [search]);

  const loadAccessLevels = async () => {
    try {
      const res: any = await getAccessLevels();
      if (res?.data?.list) {
        setAccessLevels([{ accessLevelIndexCode: '0', accessLevelName: 'Nenhum' }, ...res.data.list]);
      }
    } catch (e) {
      console.warn("Failed to load access levels:", e);
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

  const loadVisitors = async () => {
    try {
      setLoading(true);
      const { data } = await getHikcentralVisitantes();
      
      // Mapear dados do HikCentral para o formato esperado pelo frontend
      const mappedVisitors = (data || []).map((v: any) => ({
        id: v.id || v.visitor_id,
        full_name: v.visitor_name || 'Sem nome',
        document: v.certificate_no || '-',
        phone: v.phone_num || null,
        photo_url: v.photo_url || null,
        visiting_unit: v.visiting_unit || null,
        visiting_block: v.visiting_block || null,
        tower: v.tower || null,
        purpose: v.visitor_group_name || 'Visita',
        notes: null,
        created_at: v.appoint_start_time || new Date().toISOString(),
        // Campos adicionais do HikCentral
        appoint_status: v.appoint_status,
        appoint_status_text: v.appoint_status_text,
        appoint_start_time: v.appoint_start_time,
        appoint_end_time: v.appoint_end_time,
        plate_no: v.plate_no,
      }));
      
      // Filtrar por busca se necessário
      const filtered = search 
        ? mappedVisitors.filter((v: any) => 
            v.full_name?.toLowerCase().includes(search.toLowerCase()) ||
            v.document?.includes(search)
          )
        : mappedVisitors;
      
      setVisitors(filtered);
    } catch (error) {
      console.error('Erro ao carregar visitantes:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os visitantes',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const goToRegisterNew = () => {
    setEditingVisitor(null);
    setExistingQuery('');
    form.reset();
    setTab('cadastrar');
  };

  const handleTabChange = (t: EntityTabValue) => {
    if (t === 'cadastrar') {
      goToRegisterNew();
      return;
    }
    setEditingVisitor(null);
    setExistingQuery('');
    form.reset();
    setTab(t);
  };

  const goToRegisterEdit = (visitor: any) => {
    setEditingVisitor(visitor);
    form.reset({
      full_name: visitor.full_name,
      document: visitor.document,
      phone: visitor.phone || '',
      photo_url: visitor.photo_url || '',
      document_photo_url: visitor.document_photo_url || '',
      tower: visitor.tower || '',
      visiting_block: visitor.visiting_block || '',
      visiting_unit: visitor.visiting_unit || '',
      visiting_resident: visitor.visiting_resident || '',
      purpose: visitor.purpose || '',
      notes: visitor.notes || '',
      accessLevelIndexCode: '0',
      plateNo: visitor.plate_no || ''
    });
    setTab('cadastrar');
  };

  const treeData: TreeNode[] = [
    { id: 'all', name: 'Todos os Visitantes', type: 'group' }
  ];
  if (condoTowers && condoTowers.length > 0) {
    const rootNode: TreeNode = {
      id: 'towers_root',
      name: `Destino (${labels.towers})`,
      type: 'group',
      children: []
    };
    condoTowers.forEach((t: any) => {
      const towerNode: TreeNode = {
        id: `tower___${t.name || t}`,
        name: `${labels.tower} ${t.name || t}`,
        type: t.blocks && t.blocks.length > 0 ? 'group' : 'item',
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
  const [towerFilter, setTowerFilter] = useState('');

  const fillFromExisting = (visitor: any) => {
    form.reset({
      full_name: visitor.full_name || visitor.visitor_name || '',
      document: visitor.document || visitor.certificate_no || '',
      phone: visitor.phone || visitor.phone_num || '',
      photo_url: visitor.photo_url || '',
      document_photo_url: visitor.document_photo_url || '',
      visiting_unit: visitor.visiting_unit || '',
      visiting_block: visitor.visiting_block || '',
      tower: visitor.tower || '',
      visiting_resident: visitor.visiting_resident || '',
      purpose: visitor.purpose || visitor.visitor_group_name || '',
      notes: visitor.notes || '',
      accessLevelIndexCode: '0',
      plateNo: visitor.plate_no || ''
    });
    setExistingQuery('');
    setExistingOpen(false);
  };

  const existingMatches = existingQuery.trim().length >= 2
    ? visitors.filter(v => {
        const q = existingQuery.toLowerCase();
        return (v.full_name || (v as any).visitor_name || '').toLowerCase().includes(q)
          || ((v as any).document || (v as any).certificate_no || '').includes(q);
      }).slice(0, 6)
    : [];

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

      const photoStatus = getFieldStatus('visitor', 'photo');
      if (photoStatus === 'required' && !data.photo_url) {
        toast({
          title: 'Foto Obrigatória',
          description: 'A foto do visitante é obrigatória conforme as diretrizes do condomínio.',
          variant: 'destructive',
        });
        return;
      }

      const timeCheck = isTimeAllowed('visitor');
      let scheduleNotes = '';
      if (!timeCheck.allowed) {
        const justification = window.prompt(`Atenção: Acesso fora do horário permitido! Motivo: ${timeCheck.reason}\n\nPara liberar o acesso emergencial, digite uma justificativa obrigatória:`);
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

      const visitorNotes = data.notes
        ? `${data.notes} ${scheduleNotes}`.trim()
        : scheduleNotes;

      const visitorPayload = {
        ...data,
        phone: data.phone || null,
        photo_url: data.photo_url || null,
        document_photo_url: data.document_photo_url || null,
        purpose: data.purpose || null,
        notes: visitorNotes || null,
        visiting_resident: null,
        created_by: profile?.id || null
      };

      let visitor: any;
      if (editingVisitor) {
        visitor = await updateVisitor((editingVisitor as any).id, visitorPayload);
        toast({ title: 'Sucesso', description: 'Visitante atualizado com sucesso' });
        form.reset();
        setEditingVisitor(null);
        setTab('lista');
        loadVisitors();
        return;
      } else {
        visitor = await createVisitor(visitorPayload);
      }

      // Criar log de visita automaticamente
      if (visitor) {
        await createVisitLog({
          visitor_id: visitor.id,
          entry_time: new Date().toISOString(),
          exit_time: null,
          status: 'in_progress',
          authorized_by: profile?.id || null,
          notes: null
        });

        // Sincronização com HikCentral
        try {
          const nameParts = data.full_name.trim().split(' ');
          const givenName = nameParts[0];
          const familyName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];

          // Encontrar o morador para pegar o hikcentral_person_id
          const selectedResident = residents.find((r: any) => r.id === data.visiting_resident);

          const startTime = new Date();
          const endTime = new Date();
          endTime.setHours(endTime.getHours() + 24); // 24h de validade para portaria

          const appointmentData: any = {
            receptionistId: (selectedResident as any)?.hikcentral_person_id || undefined,
            appointStartTime: startTime.toISOString(),
            appointEndTime: endTime.toISOString(),
            visitReasonType: 2,
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

          const hikResult: any = await createAppointment(appointmentData);

          if (data.accessLevelIndexCode && data.accessLevelIndexCode !== '0' && hikResult?.data?.visitorId) {
            await authorizeHikPerson(hikResult.data.visitorId, [data.accessLevelIndexCode]);
          }

          await reapplyAuthorization();

        } catch (syncError: any) {
          console.error('Erro na sincronização:', syncError);
        }
      }

      toast({
        title: 'Sucesso',
        description: 'Visitante registrado com sucesso'
      });
      form.reset();
      setTab('lista');
      loadVisitors();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao registrar visitante',
        variant: 'destructive'
      });
    }
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

  const openCameraDialog = (type: 'facial' | 'document', tab: 'webcam' | 'doorbell' = 'webcam') => {
    setCameraType(type);
    setCameraDefaultTab(tab);
    setCameraDialogOpen(true);
  };

  const registerContent = (
    <Card className="border-primary/20 shadow-sm rounded-2xl overflow-hidden p-0 gap-0">
      <CardHeader className="p-6 pb-4 border-b bg-muted/20">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <span className={`p-2 rounded-lg ${editingVisitor ? 'bg-orange-100 text-orange-600' : 'bg-primary/10 text-primary'}`}>
            {editingVisitor ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          </span>
          {editingVisitor ? 'Editar Visitante' : 'Registrar Novo Visitante'}
        </h2>
        <p className="text-sm text-muted-foreground">
          Preencha o formulário abaixo para registrar ou editar um visitante.
        </p>
      </CardHeader>
      <div className="p-6">
              {/* Buscar visitante já cadastrado */}
              {!editingVisitor && (
                <div className="relative mb-4">
                  <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/30">
                    <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      placeholder="Buscar visitante já cadastrado por nome ou documento..."
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
                  {existingOpen && existingMatches.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg overflow-hidden">
                      {existingMatches.map((v: any) => (
                        <button
                          key={v.id}
                          type="button"
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 text-left border-b last:border-0"
                          onMouseDown={() => fillFromExisting(v)}
                        >
                          {v.photo_url && <img src={v.photo_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />}
                          {!v.photo_url && <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-4 w-4 text-muted-foreground" /></div>}
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{v.full_name || (v as any).visitor_name}</div>
                            <div className="text-xs text-muted-foreground">{(v as any).document || (v as any).certificate_no || ''}</div>
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
                        <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById('visitor-photo-upload')?.click()} className="w-full text-[10px] h-8 border-dashed">
                          enviar foto em arquivo
                        </Button>
                        <input
                          id="visitor-photo-upload"
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
                      {getFieldStatus('visitor', 'fullName') !== 'hidden' && (
                        <FormField
                          control={form.control}
                          name="full_name"
                          rules={{ required: getFieldStatus('visitor', 'fullName') === 'required' ? 'Nome completo é obrigatório' : false }}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nome Completo {getFieldStatus('visitor', 'fullName') === 'required' ? '*' : ''}</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Ex: João Silva" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {getFieldStatus('visitor', 'cpf') !== 'hidden' && (
                          <FormField
                            control={form.control}
                            name="document"
                            rules={{ required: getFieldStatus('visitor', 'cpf') === 'required' ? 'Documento é obrigatório' : false }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Documento (RG/CPF) {getFieldStatus('visitor', 'cpf') === 'required' ? '*' : ''}</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Número do documento" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        {getFieldStatus('visitor', 'phone') !== 'hidden' && (
                          <FormField
                            control={form.control}
                            name="phone"
                            rules={{ required: getFieldStatus('visitor', 'phone') === 'required' ? 'Telefone é obrigatório' : false }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Telefone {getFieldStatus('visitor', 'phone') === 'required' ? '*' : ''}</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="(00) 00000-0000" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}
                      </div>

                      {getFieldStatus('visitor', 'vehiclePlate') !== 'hidden' && (
                        <FormField
                          control={form.control}
                          name="plateNo"
                          rules={{ required: getFieldStatus('visitor', 'vehiclePlate') === 'required' ? 'Placa do veículo é obrigatória' : false }}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Placa do Veículo {getFieldStatus('visitor', 'vehiclePlate') === 'required' ? '*' : ''}</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Ex: ABC-1234" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        control={form.control}
                        name="visiting_resident"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Morador Visitado</FormLabel>
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
                          rules={{ required: `${labels.tower} é obrigatória` }}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{labels.tower} *</FormLabel>
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
                                  <Input placeholder={`Ex: 1, A, Bloco 2...`} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="visiting_unit"
                            rules={{ required: `${labels.unit} é obrigatória` }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{labels.unit} *</FormLabel>
                                <FormControl>
                                  <Input placeholder={`Ex: 101, Ap 2B...`} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <FormField
                        control={form.control}
                        name="purpose"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Motivo da Visita</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Ex: Visita social, entrega, etc." />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="accessLevelIndexCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nível de Acesso</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {accessLevels.map((al) => (
                                  <SelectItem key={al.accessLevelIndexCode} value={al.accessLevelIndexCode}>
                                    {al.accessLevelName}
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
                    <Button type="submit" disabled={uploading} className={editingVisitor ? 'bg-orange-600 hover:bg-orange-700' : ''}>
                      {uploading ? 'Enviando...' : editingVisitor ? 'Salvar Alterações' : 'Concluir Cadastro'}
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
        selectedId={towerFilter || 'all'}
        onSelect={(id) => {
          if (id === 'all' || id === 'towers_root') setTowerFilter('');
          else setTowerFilter(id);
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
                placeholder="Buscar por nome, documento ou unidade..."
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
                  </TableRow>
                ))
              ) : visitors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum visitante encontrado
                  </TableCell>
                </TableRow>
              ) : (
                visitors
                  .filter(v => {
                    if (!towerFilter || towerFilter === 'all') return true;
                    const parts = towerFilter.split('___');
                    let match = true;
                    for (let i = 0; i < parts.length; i += 2) {
                      const key = parts[i];
                      const val = parts[i + 1];
                      if (key === 'tower') {
                        if (v.tower !== val) match = false;
                      } else if (key === 'block') {
                        if (v.visiting_block !== val) match = false;
                      }
                    }
                    return match;
                  })
                  .map((visitor: any) => (
                  <TableRow key={visitor.id}>
                    <TableCell>
                      <Avatar>
                        <AvatarImage src={visitor.photo_url || undefined} />
                        <AvatarFallback>
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{visitor.full_name}</TableCell>
                    <TableCell>{visitor.document}</TableCell>
                    <TableCell className="text-xs text-zinc-600">{formatAddress(visitor.tower, visitor.visiting_block, visitor.visiting_unit)}</TableCell>
                    <TableCell>{visitor.phone || '-'}</TableCell>
                    <TableCell>{visitor.plate_no || '-'}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={visitor.appoint_status === 2 ? 'default' : visitor.appoint_status === 1 ? 'secondary' : 'outline'}
                        className={visitor.appoint_status === 2 ? 'bg-green-600 text-white' : visitor.appoint_status === 1 ? 'bg-gray-200 text-gray-700' : 'text-blue-600 border-blue-200 bg-blue-50'}
                      >
                        {visitor.appoint_status_text || 'Agendado'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-muted-foreground">
                        {visitor.appoint_start_time && (
                          <span>De: {new Date(visitor.appoint_start_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                        {visitor.appoint_end_time && (
                          <span>Até: {new Date(visitor.appoint_end_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => goToRegisterEdit(visitor)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
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
        title="Visitantes"
        description="Registre e gerencie visitantes do condomínio"
        tab={tab}
        onTabChange={handleTabChange}
        canRegister
        overview={<VisitorsOverview visitors={visitors} loading={loading} />}
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
