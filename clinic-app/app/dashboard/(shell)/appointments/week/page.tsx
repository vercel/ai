import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Appointment, Patient, Profile } from '@/lib/types';

type AppointmentRow = Appointment & { patients: Pick<Patient, 'full_name'> };

const STATUS_COLORS: Record<string, string> = {
  agendado: 'bg-blue-100 text-blue-700 border-blue-200',
  confirmado: 'bg-green-100 text-green-700 border-green-200',
  cancelado: 'bg-red-100 text-red-700 border-red-200',
  concluido: 'bg-gray-200 text-gray-600 border-gray-300',
};

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export default async function WeeklyAgendaPage({
  searchParams,
}: {
  searchParams: { date?: string; professional_id?: string };
}) {
  const refDate = searchParams.date ? new Date(`${searchParams.date}T00:00:00`) : new Date();
  const weekStart = startOfWeek(refDate);
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const supabase = createSupabaseServerClient();
  const { data: professionals } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('role', ['medico', 'admin'])
    .order('full_name')
    .returns<Pick<Profile, 'id' | 'full_name'>[]>();

  let query = supabase
    .from('appointments')
    .select('*, patients(full_name)')
    .gte('scheduled_at', weekStart.toISOString())
    .lt('scheduled_at', weekEnd.toISOString())
    .order('scheduled_at');

  if (searchParams.professional_id) {
    query = query.eq('professional_id', searchParams.professional_id);
  }

  const { data: appointments } = await query.returns<AppointmentRow[]>();

  const byDay = new Map<string, AppointmentRow[]>();
  for (const appt of appointments ?? []) {
    const key = new Date(appt.scheduled_at).toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), appt]);
  }

  const prevWeek = addDays(weekStart, -7).toISOString().slice(0, 10);
  const nextWeek = addDays(weekStart, 7).toISOString().slice(0, 10);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-800">
          Semana · {weekStart.toLocaleDateString('pt-BR')} a{' '}
          {addDays(weekStart, 6).toLocaleDateString('pt-BR')}
        </h1>
        <div className="flex flex-wrap gap-2">
          <form method="get" className="flex gap-2">
            <input type="hidden" name="date" value={searchParams.date ?? ''} />
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
              className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Filtrar
            </button>
          </form>
          <Link
            href={`/dashboard/appointments/week?date=${prevWeek}&professional_id=${searchParams.professional_id ?? ''}`}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            ← Semana anterior
          </Link>
          <Link
            href={`/dashboard/appointments/week?date=${nextWeek}&professional_id=${searchParams.professional_id ?? ''}`}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Próxima semana →
          </Link>
          <Link
            href="/dashboard/appointments/calendar"
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Mês
          </Link>
          <Link
            href="/dashboard/appointments"
            className="rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Lista
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dayAppointments = byDay.get(day.toDateString()) ?? [];
          const isToday = day.toDateString() === new Date().toDateString();
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[300px] rounded-xl bg-white p-3 shadow-sm ${isToday ? 'ring-2 ring-brand-500' : ''}`}
            >
              <p className="mb-2 text-xs font-semibold text-gray-500">
                {WEEKDAY_LABELS[day.getDay()]} {day.getDate()}
              </p>
              <div className="flex flex-col gap-1.5">
                {dayAppointments.map((appt) => (
                  <Link
                    key={appt.id}
                    href={`/dashboard/appointments/${appt.id}/edit`}
                    className={`block rounded border px-2 py-1 text-[11px] leading-tight ${STATUS_COLORS[appt.status] ?? ''}`}
                  >
                    <span className="font-semibold">
                      {new Date(appt.scheduled_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>{' '}
                    {appt.patients?.full_name}
                  </Link>
                ))}
                {dayAppointments.length === 0 && (
                  <p className="text-[11px] text-gray-300">-</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
