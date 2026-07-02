import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Appointment, Patient, Profile } from '@/lib/types';
import { ReportsTabs } from '../reports-tabs';

type AppointmentRow = Appointment & {
  patients: Pick<Patient, 'full_name'>;
  profiles: Pick<Profile, 'full_name'>;
};

const STATUS_LABELS: Record<Appointment['status'], string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  in_progress: 'Em atendimento',
  no_show: 'Não compareceu',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
};

export default async function AgendaReportPage() {
  const supabase = createSupabaseServerClient();
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*, patients(full_name), profiles(full_name)')
    .order('scheduled_at', { ascending: false })
    .limit(100)
    .returns<AppointmentRow[]>();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">Relatórios</h1>
      <p className="mb-4 text-sm text-gray-500">Agenda — últimos 100 agendamentos</p>
      <ReportsTabs />

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Data/hora</th>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Profissional</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(appointments ?? []).map((a) => (
              <tr key={a.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-500">
                  {new Date(a.scheduled_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">{a.patients?.full_name}</td>
                <td className="px-4 py-3 text-gray-500">{a.profiles?.full_name}</td>
                <td className="px-4 py-3 text-gray-500">{STATUS_LABELS[a.status]}</td>
              </tr>
            ))}
            {(appointments ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhum agendamento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
