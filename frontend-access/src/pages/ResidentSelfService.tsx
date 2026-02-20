import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getResident } from '@/db/api';
import { createAppointment } from '@/services/hikcentral';
import { urlToBase64 } from '@/lib/utils';
import { User, Camera, CheckCircle2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { uploadImage } from '@/lib/upload';

export default function ResidentSelfService() {
    const { id } = useParams<{ id: string }>();
    const [resident, setResident] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const { toast } = useToast();

    const [formData, setFormData] = useState({
        visitorFirstName: '',
        visitorLastName: '',
        phoneNo: '',
        photo_url: '',
        visitType: '2' // 2: Visitante, 3: Prestador
    });

    useEffect(() => {
        if (id) {
            loadResident();
        }
    }, [id]);

    const loadResident = async () => {
        try {
            setLoading(true);
            setLoading(true);
            const data = await getResident(id!);
            setResident(data);
        } catch (error) {
            console.error('Erro ao carregar morador:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resident) return;

        try {
            setSubmitting(true);

            const startTime = new Date();
            const endTime = new Date();
            endTime.setHours(endTime.getHours() + 4); // 4 horas de validade padrão

            const appointmentData: any = {
                receptionistId: resident.hikcentral_person_id || undefined, // ID do morador no HikCentral
                appointStartTime: startTime.toISOString(),
                appointEndTime: endTime.toISOString(),
                visitReasonType: parseInt(formData.visitType),
                visitorInfoList: [{
                    visitorGivenName: formData.visitorFirstName,
                    visitorFamilyName: formData.visitorLastName,
                    phoneNo: formData.phoneNo || undefined,
                }]
            };

            if (formData.photo_url) {
                const base64Face = await urlToBase64(formData.photo_url);
                appointmentData.visitorInfoList[0].faces = [{ faceData: base64Face }];
            }

            await createAppointment(appointmentData);
            // Opcional: reapplyAuthorization dependendo da configuração do HikCentral para Appointments
            // await reapplyAuthorization();

            setSuccess(true);
            toast({
                title: 'Sucesso',
                description: 'Visitante agendado com sucesso!'
            });
        } catch (error: any) {
            toast({
                title: 'Erro',
                description: error.message || 'Erro ao agendar visitante',
                variant: 'destructive'
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Skeleton className="h-[400px] w-full max-w-md bg-muted" />
            </div>
        );
    }

    if (!resident) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="text-destructive">Link Inválido</CardTitle>
                        <CardDescription>O link acessado é inválido ou expirou.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    if (success) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4">
                <Card className="w-full max-w-md text-center p-6">
                    <div className="flex justify-center mb-4">
                        <CheckCircle2 className="h-16 w-16 text-green-500" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Tudo certo!</h2>
                    <p className="text-muted-foreground">
                        O visitante foi cadastrado e o acesso liberado.
                    </p>
                    <Button className="mt-6 w-full" onClick={() => setSuccess(false)}>
                        Cadastrar outro
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-muted/30">
            <Card className="w-full max-w-md border-none shadow-xl">
                <CardHeader className="text-center">
                    <Avatar className="h-20 w-20 mx-auto mb-4 border-2 border-primary/20">
                        <AvatarImage src={resident.photo_url || undefined} />
                        <AvatarFallback><User className="h-10 w-10" /></AvatarFallback>
                    </Avatar>
                    <CardTitle>Olá, {resident.full_name}</CardTitle>
                    <CardDescription>Cadastre seu visitante ou prestador de serviço</CardDescription>
                </CardHeader>
                <CardContent>
                    <input
                        type="file"
                        id="photo-upload"
                        className="hidden"
                        accept="image/*"
                        capture="user"
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                                try {
                                    setSubmitting(true);
                                    const url = await uploadImage(file, 'app-9hbwbnibthc3_access_images');
                                    setFormData({ ...formData, photo_url: url });
                                    toast({
                                        title: 'Sucesso',
                                        description: 'Foto carregada com sucesso'
                                    });
                                } catch (err) {
                                    toast({
                                        title: 'Erro',
                                        description: 'Erro ao carregar foto',
                                        variant: 'destructive'
                                    });
                                } finally {
                                    setSubmitting(false);
                                }
                            }
                        }}
                    />
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="flex gap-2 p-1 bg-muted rounded-lg mb-4">
                            <Button
                                type="button"
                                variant={formData.visitType === '2' ? 'default' : 'ghost'}
                                className="flex-1 text-xs"
                                onClick={() => setFormData({ ...formData, visitType: '2' })}
                            >
                                Visitante
                            </Button>
                            <Button
                                type="button"
                                variant={formData.visitType === '3' ? 'default' : 'ghost'}
                                className="flex-1 text-xs"
                                onClick={() => setFormData({ ...formData, visitType: '3' })}
                            >
                                Prestador
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="firstName">Nome</Label>
                                <Input
                                    id="firstName"
                                    required
                                    value={formData.visitorFirstName}
                                    onChange={(e) => setFormData({ ...formData, visitorFirstName: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lastName">Sobrenome</Label>
                                <Input
                                    id="lastName"
                                    required
                                    value={formData.visitorLastName}
                                    onChange={(e) => setFormData({ ...formData, visitorLastName: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="phone">Celular (Visitante)</Label>
                            <Input
                                id="phone"
                                placeholder="(00) 00000-0000"
                                value={formData.phoneNo}
                                onChange={(e) => setFormData({ ...formData, phoneNo: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2 pt-2">
                            <Label>Foto do Visitante</Label>
                            <div className="flex flex-col items-center gap-4 p-4 border-2 border-dashed rounded-lg bg-muted/50">
                                {formData.photo_url ? (
                                    <div className="relative h-32 w-32">
                                        <img src={formData.photo_url} alt="Visitante" className="h-full w-full object-cover rounded-full border-2 border-primary" />
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="icon"
                                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                                            onClick={() => setFormData({ ...formData, photo_url: '' })}
                                        >
                                            ×
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full h-24 flex flex-col gap-2"
                                        onClick={() => document.getElementById('photo-upload')?.click()}
                                    >
                                        <Camera className="h-8 w-8 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground text-center">Tirar foto pelo celular</span>
                                    </Button>
                                )}
                            </div>
                        </div>

                        <Button type="submit" className="w-full py-6 text-lg font-semibold" disabled={submitting}>
                            {submitting ? 'Enviando...' : 'Liberar Acesso'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div >
    );
}
