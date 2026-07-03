import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Appointment, Patient, Profile, Room } from '@/lib/types';
import { AppointmentStatusSelect } from '@/components/appointment-status-select';
import { DeleteAppointmentButton } from '@/components/delete-appointment-button';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';

type AppointmentRow = Appointment & {
  patients: Pick<Patient, 'full_name'>;
  profiles: Pick<Profile, 'full_name'>;
  rooms: Pick<Room, 'name'> | null;
};

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: { date?: string; professional_id?: string };
}) {
  const supabase = createSupabaseServerClient();

  const { data: professionals } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('role', ['medico', 'admin'])
    .order('full_name')
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();

  let query = supabase
    .from('appointments')
    .select('*, patients(full_name), profiles(full_name), rooms(name)')
    .order('scheduled_at');

  if (searchParams.date) {
    const start = `${searchParams.date}T00:00:00`;
    const end = `${searchParams.date}T23:59:59`;
    query = query.gte('scheduled_at', start).lte('scheduled_at', end);
  }
  if (searchParams.professional_id) {
    query = query.eq('professional_id', searchParams.professional_id);
  }

  const { data: appointments } = await query.returns<AppointmentRow[]>();

  return (
    <div>
      <PageHeader
        title="Agendamentos"
        description="Consultas marcadas, filtros por data e profissional."
        action={
          <div className="flex gap-2">
            <Link
              href="/dashboard/appointments/week"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Semana
            </Link>
            <Link
              href="/dashboard/appointments/calendar"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Calendário
            </Link>
            <Link
              href="/dashboard/appointments/new"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              + Novo agendamento
            </Link>
          </div>
        }
      />

      <form className="mb-4 flex flex-wrap gap-3" method="get">
        <input
          type="date"
          name="date"
          defaultValue={searchParams.date ?? ''}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          name="professional_id"
          defaultValue={searchParams.professional_id ?? ''}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todos os profissionais</option>
          {(professionals ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Filtrar
        </button>
      </form>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Data/hora</th>
              <th className="px-4 py-3">Paciente</th>
              <th className="px-4 py-3">Profissional</th>
              <th className="px-4 py-3">Sala</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
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
                <td className="px-4 py-3 text-gray-500">{appointment.rooms?.name ?? '-'}</td>
                <td className="px-4 py-3">
                  <AppointmentStatusSelect id={appointment.id} status={appointment.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <Link
                      href={`/dashboard/appointments/${appointment.id}/edit`}
                      className="text-brand-600 hover:underline"
                    >
                      Reagendar
                    </Link>
                    <DeleteAppointmentButton id={appointment.id} />
                  </div>
                </td>
              </tr>
            ))}
            {(appointments ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Nenhum agendamento encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
