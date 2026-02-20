import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDevicesStatus } from '@/db/api';
import { DeviceStatus } from '@/types';
import { Shield, ShieldAlert, Monitor, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function DeviceStatusPage() {
    const [devices, setDevices] = useState<DeviceStatus[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDevices();
    }, []);

    const loadDevices = async () => {
        setLoading(true);
        try {
            const data = await getDevicesStatus();
            setDevices(data);
        } catch (error) {
            console.error('Erro ao carregar status dos dispositivos:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Status dos Dispositivos</h1>
                    <p className="text-muted-foreground">
                        Monitoramento em tempo real dos terminais faciais de controle de acesso.
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={loadDevices}
                    disabled={loading}
                    className="flex items-center gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <Skeleton className="h-5 w-32" />
                                <Skeleton className="h-4 w-4 rounded-full" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-4 w-24 mb-2" />
                                <Skeleton className="h-4 w-40" />
                            </CardContent>
                        </Card>
                    ))
                ) : devices.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg bg-muted/50">
                        <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-lg font-medium">Nenhum dispositivo encontrado</p>
                        <p className="text-sm text-muted-foreground">Verifique a configuração da integração HikCentral.</p>
                    </div>
                ) : (
                    devices.map((device) => (
                        <Card key={device.id} className={device.status === 'offline' ? 'border-red-200' : ''}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    {device.name}
                                </CardTitle>
                                {device.status === 'online' ? (
                                    <Shield className="h-4 w-4 text-green-500" />
                                ) : (
                                    <ShieldAlert className="h-4 w-4 text-red-500" />
                                )}
                            </CardHeader>
                            <CardContent>
                                <div className="mt-2 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-muted-foreground">Status:</span>
                                        <Badge
                                            variant={device.status === 'online' ? 'default' : 'destructive'}
                                            className={device.status === 'online' ? 'bg-green-100 text-green-700 hover:bg-green-100 border-green-200' : ''}
                                        >
                                            {device.status === 'online' ? 'Online' : 'Offline'}
                                        </Badge>
                                    </div>
                                    {device.ip && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">IP:</span>
                                            <span className="text-xs font-mono">{device.ip}</span>
                                        </div>
                                    )}
                                    {device.type && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">Tipo:</span>
                                            <span className="text-xs">{device.type}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between pt-2">
                                        <span className="text-xs text-muted-foreground">ID:</span>
                                        <span className="text-[10px] font-mono opacity-50">{device.id}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
