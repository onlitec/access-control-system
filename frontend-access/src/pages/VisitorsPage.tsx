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
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { getHikcentralVisitantes, createVisitor, createVisitLog, getAllResidentsForSelect, getActiveTowers } from '@/db/api';
import { urlToBase64 } from '@/lib/utils';
import { createAppointment, reapplyAuthorization, getAccessLevels, authorizeHikPerson } from '@/services/hikcentral';
import { useAuth } from '@/contexts/AuthContext';
import type { Visitor, Tower } from '@/types';
import { Plus, Search, User, Clock, Camera, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { uploadImage } from '@/lib/upload';
import { Dropzone } from '@/components/dropzone';
import { useFileUpload } from '@/hooks/use-file-upload';
import { CameraCapture } from '@/components/CameraCapture';
import { ResidentCombobox } from '@/components/ResidentCombobox';

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [residents, setResidents] = useState<Array<{ id: string; full_name: string; unit_number: string; block: string | null; tower: string | null }>>([]);
  const [towers, setTowers] = useState<Tower[]>([]);
  const [accessLevels, setAccessLevels] = useState<{ accessLevelIndexCode: string; accessLevelName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [cameraType, setCameraType] = useState<'facial' | 'document'>('facial');
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
      tower: '',
      visiting_resident: '',
      purpose: '',
      notes: '',
      accessLevelIndexCode: '0'
    }
  });

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
        photo_url: null, // HikCentral não retorna foto na lista
        visiting_unit: '-',
        tower: '-',
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
        description: 'Não foi possível carregar os visitantes do HikCentral',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
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
      const visitor = await createVisitor({
        ...data,
        phone: data.phone || null,
        photo_url: data.photo_url || null,
        document_photo_url: data.document_photo_url || null,
        purpose: data.purpose || null,
        notes: data.notes || null,
        visiting_resident: null,
        created_by: profile?.id || null
      });

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

          toast({
            title: 'Sincronização',
            description: 'Visitante sincronizado com Hikcentral'
          });
        } catch (syncError: any) {
          console.error('Erro na sincronização Hikcentral:', syncError);
          toast({
            title: 'Erro de Sincronização',
            description: 'Visitante salvo localmente, mas houve erro no Hikcentral: ' + syncError.message,
            variant: 'warning'
          } as any);
        }
      }

      toast({
        title: 'Sucesso',
        description: 'Visitante registrado com sucesso'
      });
      setDialogOpen(false);
      form.reset();
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

  const openCameraDialog = (type: 'facial' | 'document') => {
    setCameraType(type);
    setCameraDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Visitantes</h1>
          <p className="text-muted-foreground mt-1">
            Registre e gerencie visitantes do condomínio
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Registrar Visitante
            </Button>
          </DialogTrigger>
          <DialogContent
            className="w-[95vw] max-h-[95vh] overflow-y-auto p-0 gap-0 border-primary/20 shadow-2xl"
            style={{ maxWidth: '1200px' }}
          >
            <DialogHeader className="p-6 pb-2 border-b bg-muted/20">
              <DialogTitle className="text-xl flex items-center gap-2">
                <span className="p-2 bg-primary/10 text-primary rounded-lg">
                  <Plus className="h-5 w-5" />
                </span>
                Registrar Novo Visitante
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

                      <FormField
                        control={form.control}
                        name="visiting_unit"
                        rules={{ required: 'Unidade visitada é obrigatória' }}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unidade Visitada *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Ex: 101" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

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
              placeholder="Buscar por nome, documento ou unidade..."
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
                visitors.map((visitor: any) => (
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
