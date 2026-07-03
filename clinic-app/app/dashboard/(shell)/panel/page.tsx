import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Appointment, Invoice, PatientCRM, Profile } from '@/lib/types';

type AppointmentRow = Appointment & { profiles: Pick<Profile, 'full_name'> };

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function PanelPage() {
  const supabase = createSupabaseServerClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [{ data: todayAppointments }, { data: pendingInvoices }, { data: openCrmContacts }] =
    await Promise.all([
      supabase
        .from('appointments')
        .select('*, profiles(full_name)')
        .gte('scheduled_at', todayStart.toISOString())
        .lte('scheduled_at', todayEnd.toISOString())
        .order('scheduled_at')
        .returns<AppointmentRow[]>(),
      supabase.from('invoices').select('*').eq('status', 'pendente').returns<Invoice[]>(),
      supabase
        .from('patient_crm')
        .select('id')
        .neq('current_stage', 'Fidelizado')
        .neq('current_stage', 'Perdido')
        .returns<Pick<PatientCRM, 'id'>[]>(),
    ]);

  const byProfessional = new Map<string, number>();
  for (const appointment of todayAppointments ?? []) {
    const name = appointment.profiles?.full_name ?? 'Sem profissional';
    byProfessional.set(name, (byProfessional.get(name) ?? 0) + 1);
  }

  const pendingTotal = (pendingInvoices ?? []).reduce(
    (sum, invoice) => sum + invoice.amount_cents,
    0,
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Painel</h1>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Consultas hoje</p>
          <p className="text-2xl font-semibold text-gray-800">
            {(todayAppointments ?? []).length}
          </p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Faturas pendentes</p>
          <p className="text-2xl font-semibold text-gray-800">{formatCurrency(pendingTotal)}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-xs text-gray-400">Contatos em aberto</p>
          <p className="text-2xl font-semibold text-gray-800">{(openCrmContacts ?? []).length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">
            Consultas hoje por profissional
          </h2>
          <div className="flex flex-col gap-2">
            {[...byProfessional.entries()].map(([name, count]) => (
              <div key={name} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{name}</span>
                <span className="font-medium text-gray-800">{count}</span>
              </div>
            ))}
            {byProfessional.size === 0 && (
              <p className="text-sm text-gray-400">Nenhuma consulta agendada para hoje.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">Agenda de hoje</h2>
          <div className="flex flex-col gap-2">
            {(todayAppointments ?? []).map((appointment) => (
              <div key={appointment.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {new Date(appointment.scheduled_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="text-gray-800">{appointment.profiles?.full_name}</span>
              </div>
            ))}
            {(todayAppointments ?? []).length === 0 && (
              <p className="text-sm text-gray-400">Sem consultas hoje.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
