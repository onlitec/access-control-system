import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getStaff, createStaff } from '@/db/api';
import { Search, ShieldCheck, Plus, Camera, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { uploadImage } from '@/lib/upload';
import { CameraCapture } from '@/components/CameraCapture';

export default function StaffPage() {
    const [staff, setStaff] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
    const { toast } = useToast();

    const form = useForm({
        defaultValues: {
            full_name: '',
            email: '',
            phone: '',
            orgIndexCode: '4', // Default Administração
            photo_url: '',
        }
    });

    useEffect(() => {
        loadStaff();
    }, [search]);

    const loadStaff = async () => {
        try {
            setLoading(true);
            const { data } = await getStaff(search);
            setStaff(data || []);
        } catch (error) {
            console.error('Erro ao carregar staff:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar os dados dos colaboradores',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    };

    const onSubmit = async (data: any) => {
        try {
            setUploading(true);
            await createStaff(data);
            toast({
                title: 'Sucesso',
                description: 'Colaborador cadastrado com sucesso'
            });
            setDialogOpen(false);
            form.reset();
            loadStaff();
        } catch (error: any) {
            toast({
                title: 'Erro',
                description: error.message || 'Erro ao cadastrar colaborador',
                variant: 'destructive'
            });
        } finally {
            setUploading(false);
        }
    };

    const handleCameraCapture = (imageUrl: string) => {
        form.setValue('photo_url', imageUrl);
        toast({
            title: 'Sucesso',
            description: 'Imagem capturada com sucesso'
        });
    };

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

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-primary flex items-center gap-2">
                        <ShieldCheck className="h-8 w-8" />
                        P. Calabasas (Staff)
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Gerenciamento de colaboradores da Administração, Portaria e Condomínio
                    </p>
                </div>

                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-primary hover:bg-primary/90">
                            <Plus className="mr-2 h-4 w-4" />
                            Novo Colaborador
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
                                Cadastrar Novo Colaborador
                            </DialogTitle>
                            <DialogDescription className="ml-11 text-xs text-muted-foreground mt-1">
                                Adicione as informações do novo colaborador para sincronização com o HikCentral.
                            </DialogDescription>
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
                                                            <Button type="button" size="sm" variant="secondary" onClick={() => setCameraDialogOpen(true)} className="h-8">
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
                                                <Button type="button" size="sm" onClick={() => setCameraDialogOpen(true)} className="w-full bg-primary/10 text-primary hover:bg-primary/20 border-none">
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
                                                <Button type="button" size="sm" variant="outline" onClick={() => document.getElementById('staff-photo-upload')?.click()} className="w-full text-[10px] h-8 border-dashed">
                                                    enviar foto em arquivo
                                                </Button>
                                                <input
                                                    id="staff-photo-upload"
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            try {
                                                                setUploading(true);
                                                                const url = await uploadImage(file, 'app-9hbwbnibthc3_staff_images');
                                                                form.setValue('photo_url', url);
                                                            } catch (err) {
                                                                toast({ title: 'Erro', description: 'Erro no upload da foto', variant: 'destructive' });
                                                            } finally {
                                                                setUploading(false);
                                                            }
                                                        }
                                                    }}
                                                />
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
                                                            <Input {...field} placeholder="Ex: Maria Oliveira" />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <FormField
                                                    control={form.control}
                                                    name="email"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>E-mail</FormLabel>
                                                            <FormControl>
                                                                <Input {...field} type="email" placeholder="email@calabasas.com" />
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
                                                name="orgIndexCode"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Departamento *</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Selecione o departamento" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="4">ADMINISTRADORES</SelectItem>
                                                                <SelectItem value="5">PORTARIA</SelectItem>
                                                                <SelectItem value="6">CONDOMINIO</SelectItem>
                                                            </SelectContent>
                                                        </Select>
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
                                            {uploading ? 'Processando...' : 'Concluir Cadastro'}
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="border-primary/10 shadow-sm">
                <CardHeader className="pb-3 text-xl font-semibold bg-muted/10">
                    <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nome, e-mail ou departamento..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="max-w-sm"
                        />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/30">
                                <TableHead className="w-[80px] pl-6">Foto</TableHead>
                                <TableHead>Nome Completo</TableHead>
                                <TableHead>Departamento</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Contato</TableHead>
                                <TableHead className="pr-6">Status HikCentral</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell className="pl-6"><Skeleton className="h-10 w-10 rounded-full bg-muted" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-48 bg-muted" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-32 bg-muted" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-20 bg-muted" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-40 bg-muted" /></TableCell>
                                        <TableCell className="pr-6"><Skeleton className="h-8 w-24 bg-muted" /></TableCell>
                                    </TableRow>
                                ))
                            ) : staff.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-20 text-muted-foreground">
                                        Nenhum colaborador encontrado
                                    </TableCell>
                                </TableRow>
                            ) : (
                                staff.map((p) => (
                                    <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                                        <TableCell className="pl-6 py-4">
                                            <Avatar className="h-10 w-10 border-2 border-primary/5">
                                                <AvatarImage
                                                    src={getProxiedPhotoUrl(p.photo_url)}
                                                    alt={`Foto de ${p.full_name}`}
                                                />
                                                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                                    {p.full_name ? p.full_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'U'}
                                                </AvatarFallback>
                                            </Avatar>
                                        </TableCell>
                                        <TableCell className="font-semibold text-foreground">{p.full_name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="font-normal border-primary/20 bg-primary/5">
                                                {p.department}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                                {p.role}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col text-sm">
                                                <span className="text-foreground">{p.phone || '-'}</span>
                                                <span className="text-muted-foreground text-xs">{p.email || ''}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="pr-6">
                                            {p.hikPersonId ? (
                                                <div className="flex items-center gap-1.5 text-green-600">
                                                    <div className="h-2 w-2 rounded-full bg-green-600 animate-pulse" />
                                                    <span className="text-xs font-medium uppercase">Ativo</span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-slate-400">
                                                    <div className="h-2 w-2 rounded-full bg-slate-100" />
                                                    <span className="text-xs font-medium uppercase text-muted-foreground">Local</span>
                                                </div>
                                            )}
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
                cameraType="facial"
                onCapture={handleCameraCapture}
            />
        </div>
    );
}
