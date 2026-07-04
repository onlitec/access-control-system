import { AlertTriangle, DoorOpen, X, Clock } from 'lucide-react';
import type { PassbackAlert } from '@/hooks/useGuaritaPassback';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface Props {
    alerts: PassbackAlert[];
    onRelease: (id: string) => void;
    onDismiss: (id: string) => void;
}

function initials(name: string) {
    return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

export function PassbackAlertBanner({ alerts, onRelease, onDismiss }: Props) {
    if (alerts.length === 0) return null;

    return (
        <div className="space-y-2 mb-4">
            {/* Cabeçalho do aviso */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 border border-red-200">
                <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                <span className="text-sm font-semibold text-red-700">
                    {alerts.length === 1
                        ? '1 alerta de anti-passagem dupla'
                        : `${alerts.length} alertas de anti-passagem dupla`}
                </span>
                <span className="text-xs text-red-500 ml-auto">Libere manualmente para permitir entrada</span>
            </div>

            {/* Cards de alerta */}
            {alerts.map(alert => (
                <div
                    key={alert.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-red-200 bg-red-50 shadow-sm"
                >
                    {/* Avatar */}
                    <Avatar className="h-10 w-10 flex-shrink-0">
                        {alert.photoUrl && <AvatarImage src={alert.photoUrl} alt={alert.personName} />}
                        <AvatarFallback className="bg-red-200 text-red-700 text-xs font-bold">
                            {initials(alert.personName)}
                        </AvatarFallback>
                    </Avatar>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-red-800 truncate">{alert.personName}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {alert.unit && (
                                <span className="text-xs text-red-600">{alert.unit}</span>
                            )}
                            {alert.deviceName && (
                                <span className="text-xs text-red-500">{alert.deviceName}</span>
                            )}
                            <span className="text-xs text-red-400 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(alert.occurredAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <p className="text-xs text-red-500 mt-0.5">Tentou entrar sem registrar saída</p>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                            size="sm"
                            onClick={() => onRelease(alert.id)}
                            className="bg-red-600 hover:bg-red-700 text-white h-8 px-3 text-xs gap-1.5"
                        >
                            <DoorOpen className="h-3.5 w-3.5" />
                            Liberar
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDismiss(alert.id)}
                            className="h-8 w-8 p-0 border-red-200 text-red-400 hover:bg-red-100"
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
}
