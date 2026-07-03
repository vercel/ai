import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { PatientCRM } from '@/lib/types';
import { ChartsTabs } from '../charts-tabs';
import { BarList } from '@/components/bar-list';

export default async function ClientsChartPage() {
  const supabase = createSupabaseServerClient();

  const { count: totalPatients } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true });

  const { data: crmContacts } = await supabase
    .from('patient_crm')
    .select('current_stage')
    .returns<Pick<PatientCRM, 'current_stage'>[]>();

  const byStage = (crmContacts ?? []).reduce<Record<string, number>>((acc, c) => {
    acc[c.current_stage] = (acc[c.current_stage] ?? 0) + 1;
    return acc;
  }, {});

  const items = Object.entries(byStage).map(([label, value]) => ({ label, value }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Gráficos</h1>
      <p className="mb-4 text-sm text-gray-500">Clientes</p>
      <ChartsTabs />

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Pacientes cadastrados</p>
          <p className="text-2xl font-semibold text-gray-800">{totalPatients ?? 0}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Contatos por estágio (CRM)</h2>
        <BarList items={items} />
      </div>
    </div>
  );
}
