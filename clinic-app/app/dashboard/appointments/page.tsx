import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Appointment, Patient, Profile } from '@/lib/types';
import { AppointmentStatusSelect } from '@/components/appointment-status-select';

type AppointmentRow = Appointment & {
  patients: Pick<Patient, 'full_name'>;
  profiles: Pick<Profile, 'full_name'>;
};

export default async function AppointmentsPage() {
  const supabase = createSupabaseServerClient();
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*, patients(full_name), profiles(full_name)')
    .order('scheduled_at')
    .returns<AppointmentRow[]>();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Agendamentos</h1>
        <Link
          href="/dashboard/appointments/new"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Novo agendamento
        </Link>
      </div>

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
            {(appointments ?? []).map((appointment) => (
              <tr key={appointment.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-700">
                  {new Date(appointment.scheduled_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {appointment.patients?.full_name}
                </td>
                <td className="px-4 py-3 text-gray-500">{appointment.profiles?.full_name}</td>
                <td className="px-4 py-3">
                  <AppointmentStatusSelect id={appointment.id} status={appointment.status} />
                </td>
              </tr>
            ))}
            {(appointments ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Nenhum agendamento cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
