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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getResidents, createResident, updateResident, deleteResident, getPersonProperties } from '@/db/api';
import { urlToBase64 } from '@/lib/utils';
import { addPerson, updatePersonSync, reapplyAuthorization, getOrganizations } from '@/services/hikcentral';
import { useAuth } from '@/contexts/AuthContext';
import type { Resident, Tower } from '@/types';
import { Plus, Search, Pencil, Trash2, User, Camera, Link as LinkIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm } from 'react-hook-form';
import { uploadImage } from '@/lib/upload';
import { Dropzone } from '@/components/dropzone';
import { useFileUpload } from '@/hooks/use-file-upload';
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

export default function ResidentsPage() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [towers, setTowers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [editingResident, setEditingResident] = useState<Resident | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [residentToDelete, setResidentToDelete] = useState<Resident | null>(null);
  const [orgIndexCode, setOrgIndexCode] = useState<string>('');
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
      is_owner: true,
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
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os moradores',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (resident?: Resident) => {
    if (resident) {
      setEditingResident(resident);
      form.reset({
        full_name: resident.full_name,
        cpf: resident.cpf,
        phone: resident.phone || '',
        email: resident.email || '',
        unit_number: resident.unit_number,
        block: resident.block || '',
        tower: resident.tower || '',
        photo_url: resident.photo_url || '',
        is_owner: resident.is_owner,
        notes: resident.notes || ''
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
        is_owner: true,
        notes: ''
      });
    }
    setDialogOpen(true);
  };

  const handleCameraCapture = (imageUrl: string) => {
    form.setValue('photo_url', imageUrl);
    toast({
      title: 'Sucesso',
      description: 'Foto capturada com sucesso'
    });
  };

  const openCameraDialog = () => {
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
      let residentId = '';
      if (editingResident) {
        await updateResident(editingResident.id, {
          ...data,
          phone: data.phone || null,
          email: data.email || null,
          block: data.block || null,
          photo_url: data.photo_url || null,
          notes: data.notes || null
        });
        residentId = editingResident.id;
        toast({
          title: 'Sucesso',
          description: 'Morador atualizado com sucesso'
        });
      } else {
        const newResident = await createResident({
          ...data,
          phone: data.phone || null,
          email: data.email || null,
          block: data.block || null,
          photo_url: data.photo_url || null,
          notes: data.notes || null,
          created_by: profile?.id || null
        });
        residentId = newResident.id;
        toast({
          title: 'Sucesso',
          description: 'Morador cadastrado com sucesso'
        });
      }

      // Sincronização com HikCentral
      try {
        const nameParts = data.full_name.trim().split(' ');
        const givenName = nameParts[0];
        const familyName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];

        const syncData: any = {
          personGivenName: givenName,
          personFamilyName: familyName,
          orgIndexCode: orgIndexCode || 'root',
          phoneNo: data.phone || undefined,
          email: data.email || undefined,
        };

        if (data.tower) {
          syncData.personProperties = [
            {
              propertyName: "Torre",
              propertyValue: data.tower
            }
          ];
        }

        if (data.photo_url && data.photo_url.startsWith('data:')) {
          const base64Face = await urlToBase64(data.photo_url);
          syncData.faces = [{ faceData: base64Face }];
        }

        // Se já existe no HikCentral (editando), usar UPDATE. Senão, ADD.
        const existingHikId = editingResident?.hikcentral_person_id;

        if (existingHikId) {
          // UPDATE: pessoa já existe no HikCentral
          syncData.hikPersonId = existingHikId;
          await updatePersonSync(syncData);
          console.log('[HikCentral] Pessoa ATUALIZADA:', existingHikId);
        } else {
          // ADD: nova pessoa no HikCentral
          const hikResponse: any = await addPerson(syncData);
          const hikPersonId = hikResponse?.data?.personId;

          if (hikPersonId) {
            await updateResident(residentId, {
              hikcentral_person_id: hikPersonId
            });
          }
          console.log('[HikCentral] Pessoa CRIADA:', hikPersonId);
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
          description: 'O morador foi salvo localmente, mas houve um erro ao enviar para o Hikcentral: ' + syncError.message,
          variant: 'warning'
        } as any);
      }

      setDialogOpen(false);
      loadResidents();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao salvar morador',
        variant: 'destructive'
      });
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Morador
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingResident ? 'Editar Morador' : 'Novo Morador'}
              </DialogTitle>
              <DialogDescription>
                Preencha os dados do morador
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Foto</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={openCameraDialog}
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
                      <span className="text-sm text-muted-foreground">Foto carregada</span>
                    </div>
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
                        <Input {...field} placeholder="Nome completo do morador" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cpf"
                    rules={{ required: 'CPF é obrigatório' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="000.000.000-00" />
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
                    name="unit_number"
                    rules={{ required: 'Número da unidade é obrigatório' }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unidade *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: 101" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="block"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bloco</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: A" />
                        </FormControl>
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
                          {towers.map((towerName, i) => (
                            <SelectItem key={i} value={towerName}>
                              {towerName}
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
                  name="is_owner"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Proprietário</FormLabel>
                      </div>
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
              placeholder="Buscar por nome, CPF ou unidade..."
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
                <TableHead>CPF</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Torre</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Tipo</TableHead>
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
                    <TableCell><Skeleton className="h-4 w-16 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20 bg-muted" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20 bg-muted ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : residents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Nenhum morador encontrado
                  </TableCell>
                </TableRow>
              ) : (
                residents.map((resident) => (
                  <TableRow key={resident.id}>
                    <TableCell>
                      <Avatar>
                        <AvatarImage src={resident.photo_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                          {resident.full_name
                            ? resident.full_name.split(' ').map((n: string) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                            : <User className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{resident.full_name}</TableCell>
                    <TableCell>{resident.cpf}</TableCell>
                    <TableCell>
                      {resident.block ? `${resident.block}-` : ''}{resident.unit_number}
                    </TableCell>
                    <TableCell>{resident.tower || '-'}</TableCell>
                    <TableCell>{resident.phone || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="default">
                        MORADOR
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {resident.hikcentral_person_id ? (
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
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(resident)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const url = `${window.location.origin}/setup/${resident.id}`;
                            navigator.clipboard.writeText(url);
                            toast({
                              title: 'Link Copiado',
                              description: 'Link do portal do morador copiado para a área de transferência'
                            });
                          }}
                          title="Copiar link do portal"
                        >
                          <LinkIcon className="h-4 w-4" />
                        </Button>
                        {profile?.role === 'admin' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setResidentToDelete(resident);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o morador {residentToDelete?.full_name}?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CameraCapture
        open={cameraDialogOpen}
        onOpenChange={setCameraDialogOpen}
        cameraType="facial"
        onCapture={handleCameraCapture}
      />
    </div >
  );
}
