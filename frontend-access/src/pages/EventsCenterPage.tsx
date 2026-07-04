import { EventFeed } from '@/components/EventFeed';

export default function EventsCenterPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            Central de Eventos
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
              Ao vivo
            </span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Todos os eventos do sistema em tempo real — acessos, portões, entregas e alarmes
          </p>
        </div>
      </div>

      <EventFeed pageSize={50} />
    </div>
  );
}
