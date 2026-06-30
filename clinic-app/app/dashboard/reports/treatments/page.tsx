import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LabOrder, Patient, Profile } from '@/lib/types';
import { ReportsTabs } from '../reports-tabs';

type LabOrderRow = LabOrder & {
  patients: Pick<Patient, 'full_name'>;
  profiles: Pick<Profile, 'full_name'>;
};

const STATUS_LABELS: Record<LabOrder['status'], string> = {
  solicitado: 'Solicitado',
  coletado: 'Coletado',
  em_analise: 'Em análise',
  concluido: 'Concluído',
};

export default async function TreatmentsReportPage() {
  const supabase = createSupabaseServerClient();
  const { data: orders } = await supabase
    .from('lab_orders')
    .select('*, patients(full_name), profiles(full_name)')
    .order('requested_at', { ascending: false })
    .limit(100)
    .returns<LabOrderRow[]>();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Relatórios</h1>
      <p className="mb-4 text-sm text-gray-500">
        Tratamentos — usando dados de Controle laboratório
      </p>
      <ReportsTabs />

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Exame</th>
              <th className="px-4 py-3">Profissional</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{o.patients?.full_name}</td>
                <td className="px-4 py-3 text-gray-500">{o.exam_name}</td>
                <td className="px-4 py-3 text-gray-500">{o.profiles?.full_name}</td>
                <td className="px-4 py-3 text-gray-500">{STATUS_LABELS[o.status]}</td>
              </tr>
            ))}
            {(orders ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
