import DashboardListPage, { type ListColumn } from '@/components/DashboardListPage';
import { getTodayAccesses, type TodayAccessRow } from '@/db/api';
import { Badge } from '@/components/ui/badge';

const PERSON_TYPE_LABEL: Record<string, string> = {
  resident: 'Morador',
  visitor: 'Visitante',
  provider_condo: 'Prestador',
  provider_resident: 'Prestador',
  staff: 'Funcionário',
};

const columns: ListColumn<TodayAccessRow>[] = [
  {
    header: 'Horário',
    render: r => new Date(r.occurredAt).toLocaleTimeString('pt-BR'),
    className: 'whitespace-nowrap tabular-nums',
  },
  { header: 'Nome', render: r => <span className="font-medium">{r.personName || 'Desconhecido'}</span> },
  { header: 'Tipo', render: r => PERSON_TYPE_LABEL[r.personType] || r.personType },
  { header: 'Unidade', render: r => r.unit || '—' },
  {
    header: 'Sentido',
    render: r => r.eventType === 'EXIT'
      ? <Badge variant="outline" className="border-amber-300 text-amber-700">Saída</Badge>
      : <Badge variant="outline" className="border-emerald-300 text-emerald-700">Entrada</Badge>,
  },
  { header: 'Ponto de acesso', render: r => r.deviceName || '—' },
  {
    header: 'Status',
    render: r => r.status === 'authorized'
      ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Autorizado</Badge>
      : <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{r.status === 'denied' ? 'Negado' : (r.status || '—')}</Badge>,
  },
];

export default function TodayAccessesPage() {
  return (
    <DashboardListPage
      title="Acessos Hoje"
      subtitle="Todos os eventos de acesso registrados desde a meia-noite."
      columns={columns}
      fetchRows={async () => (await getTodayAccesses()).list}
      rowKey={(r, i) => r.id || String(i)}
      emptyMessage="Nenhum acesso registrado hoje"
    />
  );
}
