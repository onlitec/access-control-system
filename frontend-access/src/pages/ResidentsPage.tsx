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
  Plus, Search, Pencil, Trash2, User, Camera, FileText,
  Link as LinkIcon, Copy, CheckCircle2, MessageSquare, Mail, Send, Loader2
} from 'lucide-react';
import {
  getResidents, createResident, updateResident, deleteResident,
  syncResidents, getPersonProperties, generateRecoveryLink,
  getHikcentralAccessLevels
} from '@/db/api';
import { getOrganizations } from '@/services/hikcentral';
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
import { urlToBase64 } from '@/lib/utils';

export default function ResidentsPage() {
  const [residents, setResidents] = useState<any[]>([]);
  const [towers, setTowers] = useState<string[]>([]);
  const [accessLevelsList, setAccessLevelsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [cameraType, setCameraType] = useState<'facial' | 'document'>('facial');
  const [editingResident, setEditingResident] = useState<any | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [residentToDelete, setResidentToDelete] = useState<any | null>(null);
  const [orgIndexCode, setOrgIndexCode] = useState<string>('');
  const [showSuccessState, setShowSuccessState] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState<string | null>(null);
  const { profile } = useAuth();
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      full_name: '',
      cpf: '',
      phone: '',
      email: '',
      unit_number: '',
      block: '',
      tower: '',
      photo_url: '',
      document_photo_url: '',
      notes: '',
      access_levels: [] as string[],
      is_owner: true
    }
  });

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
    loadTowers();
    loadOrganizations();
    loadAccessLevels();
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

  const loadAccessLevels = async () => {
    try {
      const resp = await getHikcentralAccessLevels();
      if (resp?.success && resp.data?.list) {
        setAccessLevelsList(resp.data.list);
      }
    } catch (e) {
      console.error('Erro ao carregar Níveis de Acesso:', e);
    }
  };

  const loadTowers = async () => {
    try {
      const data = await getPersonProperties();
      if (data?.options) {
        setTowers(data.options);
      }
    } catch (error) {
      console.error('Erro ao carregar torres:', error);
    }
  };

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

  const handleAfterSuccess = (onboarding_url: string) => {
    setOnboardingUrl(onboarding_url);
    setShowSuccessState(true);
    setDialogOpen(true);
  };

  const handleGenerateRecoveryLink = async (id: string) => {
    try {
      setGeneratingLink(id);
      const response = await generateRecoveryLink(id);
      if (response && response.onboarding_url) {
        handleAfterSuccess(response.onboarding_url);
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

  const handleCopyLink = () => {
    if (onboardingUrl) {
      navigator.clipboard.writeText(onboardingUrl);
      toast({
        title: 'Copiado!',
        description: 'Link copiado para a área de transferência',
      });
    }
  };

  const handleWhatsAppShare = () => {
    if (onboardingUrl) {
      const message = `Olá! Seu cadastro de morador foi concluído no Calabasas. Acesse o link abaixo para registrar seus visitantes e prestadores: ${onboardingUrl}`;
      window.open(`https://wa.me/${form.getValues('phone').replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  const handleOpenDialog = (resident?: any) => {
    if (resident) {
      setEditingResident(resident);
      form.reset({
        full_name: resident.full_name,
        cpf: resident.cpf || '',
        phone: resident.phone || '',
        email: resident.email || '',
        unit_number: resident.unit_number || '',
        block: resident.block || '',
        tower: resident.tower || '',
        photo_url: resident.photo_url || '',
        document_photo_url: resident.document_photo_url || '',
        notes: resident.notes || '',
        access_levels: resident.accessLevels || [],
        is_owner: resident.is_owner ?? true
      });
    } else {
      setEditingResident(null);
      form.reset({
        full_name: '',
        cpf: '',
        phone: '',
        email: '',
        unit_number: '',
        block: '',
        tower: '',
        photo_url: '',
        document_photo_url: '',
        notes: '',
        access_levels: [],
        is_owner: true
      });
    }
    setShowSuccessState(false);
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
      description: 'Foto capturada com sucesso'
    });
  };

  const onSubmit = async (data: any) => {
    try {
      setUploading(true);

      let residentId = '';
      if (editingResident) {
        await updateResident(editingResident.id, {
          ...data,
          orgIndexCode: orgIndexCode || '7'
        });
        residentId = editingResident.id;
        toast({
          title: 'Sucesso',
          description: 'Morador atualizado com sucesso'
        });
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
          orgIndexCode: orgIndexCode || '1',
          photoBase64: photoBase64 || undefined,
          access_levels: data.access_levels?.length ? data.access_levels : undefined,
        });
        residentId = response.id;
        toast({
          title: 'Sucesso',
          description: 'Morador cadastrado com sucesso'
        });

        if (response.onboarding_url) {
          handleAfterSuccess(response.onboarding_url);
        } else {
          setDialogOpen(false);
        }
      }

      if (editingResident) {
        setDialogOpen(false);
      }
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Moradores</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os moradores do condomínio
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            try {
              toast({ title: 'Sincronizando...', description: 'Aguarde enquanto buscamos os dados do HikCentral' });
              const res = await syncResidents();
              toast({ title: 'Sincronizado', description: `${res.count} moradores sincronizados` });
              loadResidents();
            } catch (err: any) {
              toast({ title: 'Erro', description: err.message, variant: 'destructive' });
            }
          }}>
            <Search className="mr-2 h-4 w-4" />
            Sincronizar HikCentral
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Morador
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          setShowSuccessState(false);
          setOnboardingUrl(null);
        }
      }}>
        <DialogContent
          className="w-[95vw] max-h-[90vh] overflow-hidden p-0 gap-0 border-none shadow-2xl rounded-2xl flex flex-col bg-zinc-50"
          style={{ maxWidth: '1200px' }}
        >
          {showSuccessState ? (
            <div className="flex-1 flex flex-col justify-center items-center bg-white p-12 overflow-y-auto">
              {/* Success content unchanged */}
              <div className="text-center space-y-6 animate-in fade-in zoom-in duration-300">
                <div className="h-24 w-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="h-14 w-14" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-zinc-900">Convite Pronto!</h2>
                  <p className="text-muted-foreground mt-3 max-w-sm mx-auto text-lg">
                    Compartilhe o link abaixo para que o morador configure sua senha.
                  </p>
                </div>
                <div className="w-full max-w-lg bg-zinc-50 p-5 rounded-2xl border border-dashed border-zinc-200 flex flex-col gap-5 mx-auto">
                  <div className="flex items-center justify-between gap-2 overflow-hidden bg-white p-4 rounded-xl border">
                    <span className="text-base font-mono truncate text-zinc-600 flex-1 text-left">
                      {onboardingUrl}
                    </span>
                    <Button variant="ghost" size="icon" onClick={handleCopyLink} className="shrink-0 h-10 w-10">
                      <Copy className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Button variant="outline" className="flex flex-col h-auto py-4 gap-3 border-zinc-100 hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all font-bold" onClick={handleWhatsAppShare}>
                      <MessageSquare className="h-6 w-6" />
                      <span className="text-[11px] uppercase tracking-wider">WhatsApp</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col h-auto py-4 gap-3 border-zinc-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all font-bold" onClick={() => window.open(`mailto:${form.getValues('email')}?subject=Bem-vindo! Acesse seu App Visitor&body=Olá! Acesse o link para configurar seu acesso: ${onboardingUrl}`, '_blank')}>
                      <Mail className="h-6 w-6" />
                      <span className="text-[11px] uppercase tracking-wider">E-mail</span>
                    </Button>
                    <Button variant="outline" className="flex flex-col h-auto py-4 gap-3 border-zinc-100 hover:bg-slate-50 hover:text-slate-600 hover:border-slate-200 transition-all font-bold">
                      <Send className="h-6 w-6" />
                      <span className="text-[11px] uppercase tracking-wider">SMS</span>
                    </Button>
                  </div>
                </div>
                <Button variant="link" onClick={() => setDialogOpen(false)} className="text-zinc-500 font-medium text-lg mt-4">
                  Fechar Dialog
                </Button>
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 bg-white overflow-hidden">
                {/* Header */}
                <DialogHeader className="px-7 py-4 border-b bg-white rounded-t-2xl flex-shrink-0">
                  <DialogTitle className="text-xl font-bold flex gap-2.5 items-center text-zinc-800">
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                      <User className="h-4 w-4 text-red-600" />
                    </div>
                    {editingResident ? 'Editar Morador' : 'Cadastrar Novo Morador'}
                  </DialogTitle>
                </DialogHeader>

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
                              <Button type="button" size="sm" variant="secondary" onClick={() => { setCameraType('facial'); setCameraDialogOpen(true); }} className="h-8 text-xs font-bold px-3 rounded-lg">
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
                        onClick={() => { setCameraType('facial'); setCameraDialogOpen(true); }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white h-9 text-xs font-bold rounded-xl transition-all shadow-sm"
                      >
                        <Camera className="mr-1.5 h-3.5 w-3.5" />
                        Cap. via Facial
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
                        onClick={() => { setCameraType('document'); setCameraDialogOpen(true); }}
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
                          <FormField
                            control={form.control}
                            name="full_name"
                            rules={{ required: 'Nome completo é obrigatório' }}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">Nome Completo *</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="Ex: João Silva" className="h-10 bg-white border-zinc-200 rounded-lg focus:ring-red-500 focus:border-red-400 transition-all text-sm px-3" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="cpf"
                              rules={{ required: 'Documento é obrigatório' }}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">Documento (RG/CPF) *</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="Número do documento" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3" />
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
                                  <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">Telefone Celular</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="(00) 00000-0000" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3" />
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
                                <FormLabel className="text-zinc-600 font-semibold text-xs uppercase tracking-wide">E-mail</FormLabel>
                                <FormControl>
                                  <Input {...field} type="email" placeholder="email@exemplo.com" className="h-10 bg-white border-zinc-200 rounded-lg text-sm px-3" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TabsContent>

                        {/* 2. LOCAL */}
                        <TabsContent value="local" className="mt-0 space-y-8 animate-in slide-in-from-right-4 duration-500 fade-in">
                          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
                            <h3 className="text-lg font-bold text-zinc-800 border-b pb-4">Endereço no Condomínio</h3>

                            <FormField
                              control={form.control}
                              name="tower"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-zinc-800 font-bold text-sm">Local / Torre (Integrado HikCentral)</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger className="h-12 bg-white border-zinc-200 rounded-xl text-zinc-700 text-base px-4">
                                        <SelectValue placeholder="Selecione o local de acesso..." />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="rounded-xl border-zinc-100">
                                      {towers.length > 0 ? towers.map((tower, idx) => (
                                        <SelectItem key={idx} value={tower}>{tower}</SelectItem>
                                      )) : (
                                        <div className="p-3 text-sm text-zinc-500 italic">Nenhuma torre carregada da integração.</div>
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
                                    <FormLabel className="text-zinc-800 font-bold text-sm">Bloco</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Ex: A" className="h-12 bg-white border-zinc-200 rounded-xl text-base px-4" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="unit_number"
                                rules={{ required: 'Unidade é obrigatória' }}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-zinc-800 font-bold text-sm">Unidade / Apto *</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Ex: 101" className="h-12 bg-white border-zinc-200 rounded-xl text-base px-4" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        </TabsContent>

                        {/* 3. ACESSO */}
                        <TabsContent value="acesso" className="mt-0 space-y-6 animate-in slide-in-from-right-4 duration-500 fade-in">
                          <div className="bg-white p-6 border border-zinc-200 rounded-2xl shadow-sm">
                            <div className="mb-6">
                              <h3 className="text-lg font-bold text-zinc-800">Grupos de Acesso (HikCentral)</h3>
                              <p className="text-sm text-zinc-500 mt-1">Selecione os perfis de acesso liberados para o morador entrar no condomínio.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {accessLevelsList.length > 0 ? accessLevelsList.map((level) => {
                                const isChecked = form.watch('access_levels').includes(level.accessLevelId);
                                return (
                                  <div
                                    key={level.accessLevelId}
                                    className={`flex items-start space-x-3 p-4 rounded-xl border transition-all cursor-pointer ${isChecked ? 'bg-red-50/50 border-red-200' : 'bg-white border-zinc-200 hover:bg-zinc-50'}`}
                                    onClick={() => {
                                      const current = form.getValues('access_levels') || [];
                                      if (isChecked) {
                                        form.setValue('access_levels', current.filter(id => id !== level.accessLevelId));
                                      } else {
                                        form.setValue('access_levels', [...current, level.accessLevelId]);
                                      }
                                    }}
                                  >
                                    <Checkbox
                                      checked={isChecked}
                                      className="mt-1 data-[state=checked]:bg-red-600 data-[state=checked]:border-red-600"
                                      onCheckedChange={(checked) => {
                                        const current = form.getValues('access_levels') || [];
                                        if (!checked) {
                                          form.setValue('access_levels', current.filter(id => id !== level.accessLevelId));
                                        } else {
                                          form.setValue('access_levels', [...current, level.accessLevelId]);
                                        }
                                      }}
                                    />
                                    <div className="space-y-1 select-none">
                                      <Label className="font-bold text-zinc-800 cursor-pointer">{level.accessLevelName}</Label>
                                      {level.description && <p className="text-xs text-zinc-500">{level.description}</p>}
                                    </div>
                                  </div>
                                );
                              }) : (
                                <div className="col-span-full py-8 text-center bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                                  <p className="text-zinc-500">Nenhum nível de acesso sincronizado com o HikCentral.</p>
                                  <Button variant="outline" size="sm" className="mt-4" onClick={(e) => { e.preventDefault(); loadAccessLevels(); }}>
                                    Buscar Níveis
                                  </Button>
                                </div>
                              )}
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
                    onClick={() => setDialogOpen(false)}
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
          )}
        </DialogContent>
      </Dialog>

      <Card className="border-zinc-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-white border-b border-zinc-100 p-6">
          <div className="flex items-center gap-4">
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
                residents.map((resident) => (
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
                      <Badge variant="outline" className="font-bold bg-white border-zinc-200 text-zinc-700 px-3 py-1">
                        {resident.block ? `${resident.block}-` : ''}{resident.unit_number}
                        {resident.tower && ` (${resident.tower})`}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-zinc-600">{resident.phone || '-'}</TableCell>
                    <TableCell>
                      {resident.hikcentral_person_id ? (
                        <div className="flex items-center gap-2 text-green-600 font-bold text-[11px] uppercase tracking-wider bg-green-50 px-2 py-1 rounded-md inline-flex border border-green-100">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Sincronizado
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-zinc-500 font-bold text-[11px] uppercase tracking-wider bg-zinc-100 px-2 py-1 rounded-md inline-flex border border-zinc-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                          Local
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(resident)}
                          className="hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 h-9 w-9 rounded-lg"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
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
                        {profile?.role === 'admin' && (
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
      />
    </div>
  );
}
