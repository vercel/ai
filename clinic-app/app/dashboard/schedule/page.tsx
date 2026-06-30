import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { Availability } from '@/lib/types';
import { addAvailability } from './actions';
import { DeleteAvailabilityButton } from '@/components/delete-availability-button';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default async function SchedulePage() {
  const profile = await requireProfile();
  const supabase = createSupabaseServerClient();

  const { data: slots } = await supabase
    .from('availability')
    .select('*')
    .eq('professional_id', profile.id)
    .order('weekday')
    .returns<Availability[]>();

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Minha agenda de disponibilidade</h1>

      <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Adicionar horário</h2>
        <form action={addAvailability} className="flex flex-col gap-3">
          <label className="text-sm text-gray-600">
            Dia da semana
            <select
              name="weekday"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {WEEKDAYS.map((label, idx) => (
                <option key={label} value={idx}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-3">
            <label className="flex-1 text-sm text-gray-600">
              Início
              <input
                name="start_time"
                type="time"
                required
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex-1 text-sm text-gray-600">
              Fim
              <input
                name="end_time"
                type="time"
                required
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Adicionar
          </button>
        </form>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-700">Horários cadastrados</h2>
      <div className="flex flex-col gap-2">
        {(slots ?? []).map((slot) => (
          <div
            key={slot.id}
            className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm"
          >
            <p className="text-sm text-gray-700">
              {WEEKDAYS[slot.weekday]} · {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
            </p>
            <DeleteAvailabilityButton id={slot.id} />
          </div>
        ))}
        {(slots ?? []).length === 0 && (
          <p className="text-sm text-gray-400">Nenhum horário cadastrado ainda.</p>
        )}
      </div>
    </div>
  );
}
