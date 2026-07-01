import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Patient } from '@/lib/types';
import { ChartsTabs } from '../charts-tabs';
import { BarList } from '@/components/bar-list';

function monthKey(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

export default async function RegistrationsChartPage() {
  const supabase = createSupabaseServerClient();
  const { data: patients } = await supabase
    .from('patients')
    .select('created_at')
    .order('created_at')
    .returns<Pick<Patient, 'created_at'>[]>();

  const byMonth = (patients ?? []).reduce<Record<string, number>>((acc, p) => {
    const key = monthKey(p.created_at);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const items = Object.entries(byMonth).map(([label, value]) => ({ label, value }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Gráficos</h1>
      <p className="mb-4 text-sm text-gray-500">Novos cadastros de pacientes por mês</p>
      <ChartsTabs />
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <BarList items={items} />
      </div>
    </div>
  );
}
