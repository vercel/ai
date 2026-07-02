import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Appointment, Patient, Profile, Room } from '@/lib/types';
import { updateAppointment } from '../../actions';

const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
};

function toLocalInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default async function EditAppointmentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const supabase = createSupabaseServerClient();
  const [{ data: appointment }, { data: patients }, { data: professionals }, { data: rooms }] =
    await Promise.all([
      supabase.from('appointments').select('*').eq('id', params.id).single<Appointment>(),
      supabase.from('patients').select('id, full_name').order('full_name').returns<Patient[]>(),
      supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['medico', 'admin'])
        .order('full_name')
        .returns<Profile[]>(),
      supabase.from('rooms').select('*').eq('is_active', true).order('name').returns<Room[]>(),
    ]);

  if (!appointment) {
    notFound();
  }

  const updateWithId = updateAppointment.bind(null, params.id);

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Reagendar / editar</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}

      <form action={updateWithId} className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
        <label className="text-sm text-gray-600">
          Paciente
          <select
            name="patient_id"
            required
            defaultValue={appointment.patient_id}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {(patients ?? []).map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Profissional
          <select
            name="professional_id"
            required
            defaultValue={appointment.professional_id}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {(professionals ?? []).map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Tipo de atendimento
          <select
            name="appointment_type"
            defaultValue={appointment.appointment_type ?? ''}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">-</option>
            <option value="consulta">Consulta</option>
            <option value="retorno">Retorno</option>
            <option value="avaliacao">Avaliação</option>
            <option value="sessao">Sessão</option>
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Sala
          <select
            name="room_id"
            defaultValue={appointment.room_id ?? ''}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">-</option>
            {(rooms ?? []).map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Data e hora
          <input
            name="scheduled_at"
            type="datetime-local"
            required
            defaultValue={toLocalInput(appointment.scheduled_at)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Duração (minutos)
          <input
            name="duration_minutes"
            type="number"
            defaultValue={appointment.duration_minutes}
            min={10}
            step={5}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Status
          <select
            name="status"
            defaultValue={appointment.status}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Observações
          <textarea
            name="notes"
            rows={3}
            defaultValue={appointment.notes ?? ''}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Salvar
        </button>
      </form>
    </div>
  );
}
