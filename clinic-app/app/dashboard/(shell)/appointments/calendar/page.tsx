import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Appointment, Patient } from '@/lib/types';

type AppointmentRow = Appointment & { patients: Pick<Patient, 'full_name'> };

const STATUS_COLORS: Record<string, string> = {
  agendado: 'bg-blue-100 text-blue-700',
  confirmado: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
  concluido: 'bg-gray-200 text-gray-600',
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string };
}) {
  const now = new Date();
  const year = Number(searchParams.year ?? now.getFullYear());
  const month = Number(searchParams.month ?? now.getMonth() + 1); // 1-12

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const supabase = createSupabaseServerClient();
  const { data: appointments } = await supabase
    .from('appointments')
    .select('*, patients(full_name)')
    .gte('scheduled_at', start.toISOString())
    .lt('scheduled_at', end.toISOString())
    .order('scheduled_at')
    .returns<AppointmentRow[]>();

  const byDay = new Map<number, AppointmentRow[]>();
  for (const appt of appointments ?? []) {
    const day = new Date(appt.scheduled_at).getDate();
    byDay.set(day, [...(byDay.get(day) ?? []), appt]);
  }

  const totalDays = new Date(year, month, 0).getDate();
  const firstWeekday = start.getDay();

  const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">
          Calendário · {start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </h1>
        <div className="flex gap-2">
          <Link
            href={`/dashboard/appointments/calendar?year=${prevMonth.year}&month=${prevMonth.month}`}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            ← Anterior
          </Link>
          <Link
            href={`/dashboard/appointments/calendar?year=${nextMonth.year}&month=${nextMonth.month}`}
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Próximo →
          </Link>
          <Link
            href="/dashboard/appointments/week"
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Semana
          </Link>
          <Link
            href="/dashboard/appointments"
            className="rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Lista
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs font-semibold text-gray-500">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
          <div key={d} className="px-2">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-2">
        {cells.map((day, idx) => (
          <div
            key={idx}
            className={`min-h-[100px] rounded-lg border border-gray-100 bg-white p-2 ${
              day === null ? 'bg-transparent border-none' : ''
            }`}
          >
            {day !== null && (
              <>
                <p className="mb-1 text-xs font-medium text-gray-400">{day}</p>
                <div className="flex flex-col gap-1">
                  {(byDay.get(day) ?? []).map((appt) => (
                    <div
                      key={appt.id}
                      className={`truncate rounded px-1 py-0.5 text-[11px] ${STATUS_COLORS[appt.status] ?? ''}`}
                      title={`${appt.patients?.full_name} · ${new Date(appt.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                    >
                      {new Date(appt.scheduled_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      {appt.patients?.full_name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
