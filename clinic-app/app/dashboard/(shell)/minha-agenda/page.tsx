import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { Appointment, Patient } from '@/lib/types';

const STATUS_LABELS: Record<Appointment['status'], string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  in_progress: 'Em atendimento',
  no_show: 'Não compareceu',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
};

export default async function MinhaAgendaPage() {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: appointments } = await supabase
    .from('appointments')
    .select('*, patients(full_name)')
    .eq('professional_id', profile.id)
    .in('status', ['agendado', 'confirmado', 'in_progress'])
    .order('scheduled_at', { ascending: true })
    .returns<(Appointment & { patients: Pick<Patient, 'full_name'> })[]>();

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Minha agenda</h1>
      <div className="flex flex-col gap-3">
        {(appointments ?? []).map((appointment) => (
          <Link
            key={appointment.id}
            href={`/dashboard/minha-agenda/${appointment.id}`}
            className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm hover:bg-gray-50"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">{appointment.patients.full_name}</p>
              <p className="text-xs text-gray-500">
                {new Date(appointment.scheduled_at).toLocaleString('pt-BR')}
              </p>
            </div>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">
              {STATUS_LABELS[appointment.status]}
            </span>
          </Link>
        ))}
        {(appointments ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhum atendimento pendente.</p>
        )}
      </div>
    </div>
  );
}
