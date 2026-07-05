import DashboardListPage, { type ListColumn } from '@/components/DashboardListPage';
import { getPresentPeople, type PresentPersonRow } from '@/db/api';

const columns: ListColumn<PresentPersonRow>[] = [
  { header: 'Prestador', render: r => <span className="font-medium">{r.personName || 'Desconhecido'}</span> },
  { header: 'Vínculo', render: r => r.personType === 'provider_resident' ? 'Prestador do morador' : 'Prestador do condomínio' },
  { header: 'Unidade', render: r => r.unit || '—' },
  {
    header: 'Última entrada',
    render: r => new Date(r.enteredAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    className: 'whitespace-nowrap tabular-nums',
  },
  { header: 'Ponto de acesso', render: r => r.deviceName || '—' },
];

export default function ActiveProvidersPage() {
  return (
    <DashboardListPage
      title="Prestadores Presentes"
      subtitle="Prestadores dentro do condomínio agora (entrada autorizada hoje sem registro de saída)."
      columns={columns}
      fetchRows={async () => (await getPresentPeople('provider')).list}
      rowKey={(r, i) => r.personId || String(i)}
      emptyMessage="Nenhum prestador presente no momento"
    />
  );
}
