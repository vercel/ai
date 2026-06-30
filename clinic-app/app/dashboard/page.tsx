import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { Appointment, Patient } from '@/lib/types';

type AppointmentRow = Appointment & { patients: Pick<Patient, 'full_name'> };

export default async function DashboardHome() {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const tomorrowEnd = new Date();
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(23, 59, 59, 999);

  const [
    { count: patientsCount },
    { count: activePatientsCount },
    { count: appointmentsToday },
    { count: pendingInvoices },
    { data: weekAppointments },
    { data: upcoming },
  ] = await Promise.all([
    supabase.from('patients').select('*', { count: 'exact', head: true }),
    supabase
      .from('patients')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .gte('scheduled_at', startOfDay)
      .lte('scheduled_at', endOfDay),
    supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
    supabase
      .from('appointments')
      .select('scheduled_at')
      .gte('scheduled_at', sevenDaysAgo.toISOString())
      .returns<{ scheduled_at: string }[]>(),
    supabase
      .from('appointments')
      .select('*, patients(full_name)')
      .gte('scheduled_at', startOfDay)
      .lte('scheduled_at', tomorrowEnd.toISOString())
      .neq('status', 'cancelado')
      .order('scheduled_at')
      .returns<AppointmentRow[]>(),
  ]);

  const cards = [
    { label: 'Pacientes cadastrados', value: patientsCount ?? 0 },
    { label: 'Pacientes ativos', value: activePatientsCount ?? 0 },
    { label: 'Consultas hoje', value: appointmentsToday ?? 0 },
    { label: 'Faturas pendentes', value: pendingInvoices ?? 0 },
  ];

  const countsByDay = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    countsByDay.set(d.toLocaleDateString('pt-BR', { weekday: 'short' }), 0);
  }
  for (const appt of weekAppointments ?? []) {
    const key = new Date(appt.scheduled_at).toLocaleDateString('pt-BR', { weekday: 'short' });
    if (countsByDay.has(key)) {
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }
  }
  const maxCount = Math.max(...Array.from(countsByDay.values()), 1);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">
        Olá, {profile.full_name.split(' ')[0]}
      </h1>
      <p className="mb-6 text-sm text-gray-500">Resumo da clínica</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-1 text-3xl font-semibold text-brand-700">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Consultas nos últimos 7 dias</h2>
          <div className="flex items-end gap-3" style={{ height: 140 }}>
            {Array.from(countsByDay.entries()).map(([label, value]) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div
                  className="w-8 rounded-t bg-brand-500"
                  style={{ height: `${(value / maxCount) * 100}px` }}
                  title={`${value}`}
                />
                <span className="text-[10px] capitalize text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            Agenda do dia · próximas consultas (hoje e amanhã)
          </h2>
          <div className="flex flex-col gap-2">
            {(upcoming ?? []).map((appt) => (
              <div key={appt.id} className="flex justify-between text-sm">
                <span className="text-gray-700">{appt.patients?.full_name}</span>
                <span className="text-gray-400">
                  {new Date(appt.scheduled_at).toLocaleString('pt-BR', {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
            {(upcoming ?? []).length === 0 && (
              <p className="text-sm text-gray-400">Nenhuma consulta prevista para hoje ou amanhã.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
