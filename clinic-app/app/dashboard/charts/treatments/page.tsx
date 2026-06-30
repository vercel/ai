import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LabOrder } from '@/lib/types';
import { ChartsTabs } from '../charts-tabs';
import { BarList } from '@/components/bar-list';

const STATUS_LABELS: Record<LabOrder['status'], string> = {
  solicitado: 'Solicitado',
  coletado: 'Coletado',
  em_analise: 'Em análise',
  concluido: 'Concluído',
};

export default async function TreatmentsChartPage() {
  const supabase = createSupabaseServerClient();
  const { data: orders } = await supabase
    .from('lab_orders')
    .select('status')
    .returns<Pick<LabOrder, 'status'>[]>();

  const rows = orders ?? [];
  const byStatus = rows.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  const items = Object.entries(byStatus).map(([status, value]) => ({
    label: STATUS_LABELS[status as LabOrder['status']] ?? status,
    value,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Gráficos</h1>
      <p className="mb-4 text-sm text-gray-500">Tratamentos (Controle laboratório)</p>
      <ChartsTabs />
      <p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-700">
        Não há um módulo dedicado de "tratamentos/procedimentos" ainda — este gráfico usa os
        pedidos de Controle laboratório como aproximação.
      </p>
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <BarList items={items} />
      </div>
    </div>
  );
}
