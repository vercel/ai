import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

export default async function DashboardHome() {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
  const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

  const [{ count: patientsCount }, { count: appointmentsToday }, { count: pendingInvoices }] =
    await Promise.all([
      supabase.from('patients').select('*', { count: 'exact', head: true }),
      supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .gte('scheduled_at', startOfDay)
        .lte('scheduled_at', endOfDay),
      supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pendente'),
    ]);

  const cards = [
    { label: 'Pacientes cadastrados', value: patientsCount ?? 0 },
    { label: 'Consultas hoje', value: appointmentsToday ?? 0 },
    { label: 'Faturas pendentes', value: pendingInvoices ?? 0 },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-800">
        Olá, {profile.full_name.split(' ')[0]}
      </h1>
      <p className="mb-6 text-sm text-gray-500">Resumo da clínica</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-1 text-3xl font-semibold text-brand-700">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
