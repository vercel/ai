import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Appointment } from '@/lib/types';
import { ChartsTabs } from '../charts-tabs';
import { BarList } from '@/components/bar-list';

const STATUS_LABELS: Record<Appointment['status'], string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  in_progress: 'Em atendimento',
  no_show: 'Não compareceu',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
};

export default async function AppointmentsChartPage() {
  const supabase = createSupabaseServerClient();
  const { data: appointments } = await supabase
    .from('appointments')
    .select('status')
    .returns<Pick<Appointment, 'status'>[]>();

  const rows = appointments ?? [];
  const byStatus = rows.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  const items = Object.entries(byStatus).map(([status, value]) => ({
    label: STATUS_LABELS[status as Appointment['status']] ?? status,
    value,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Gráficos</h1>
      <p className="mb-4 text-sm text-gray-500">Atendimentos por status</p>
      <ChartsTabs />
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <BarList items={items} />
      </div>
    </div>
  );
}
