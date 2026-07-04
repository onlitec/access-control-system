import DashboardListPage, { type ListColumn } from '@/components/DashboardListPage';
import { getPresentVisitors, type PresentVisitorRow } from '@/db/api';
import { Badge } from '@/components/ui/badge';

const fmtDateTime = (v: string) =>
  new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const columns: ListColumn<PresentVisitorRow>[] = [
  { header: 'Visitante', render: r => <span className="font-medium">{r.name || 'Sem nome'}</span> },
  { header: 'Documento', render: r => r.document || '—', className: 'whitespace-nowrap' },
  { header: 'Anfitrião', render: r => r.host || '—' },
  { header: 'Unidade', render: r => r.unit || '—' },
  { header: 'Motivo', render: r => r.purpose || '—' },
  {
    header: 'Janela da visita',
    render: r => `${fmtDateTime(r.visitStartTime)} → ${fmtDateTime(r.visitEndTime)}`,
    className: 'whitespace-nowrap tabular-nums',
  },
  {
    header: 'Status',
    render: r => (
      <Badge variant="outline" className={r.status === 'ACTIVE' ? 'border-emerald-300 text-emerald-700' : ''}>
        {r.status || '—'}
      </Badge>
    ),
  },
];

export default function ActiveVisitsPage() {
  return (
    <DashboardListPage
      title="Visitantes Presentes"
      subtitle="Visitantes com visita em andamento agora (janela da visita inclui o horário atual)."
      columns={columns}
      fetchRows={async () => (await getPresentVisitors()).list}
      rowKey={(r, i) => r.id || String(i)}
      emptyMessage="Nenhum visitante presente no momento"
    />
  );
}
