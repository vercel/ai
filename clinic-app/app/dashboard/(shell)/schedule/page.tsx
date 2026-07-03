import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { Availability } from '@/lib/types';
import { addAvailability } from './actions';
import { DeleteAvailabilityButton } from '@/components/delete-availability-button';
import { PageHeader, SettingsSection } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';

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
    <div>
      <PageHeader
        title="Minha agenda"
        description="Defina os dias e horários em que você está disponível para atendimento."
      />

      <SettingsSection
        title="Disponibilidade"
        description="Adicione faixas de horário por dia da semana. Elas alimentam o agendamento online."
      >
        <div className="space-y-6">
          <Card>
            <CardContent>
              <form action={addAvailability} className="flex flex-col gap-4">
                <label className="text-sm text-gray-600">
                  Dia da semana
                  <select name="weekday" className={`mt-1 ${inputClass}`}>
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
                    <input name="start_time" type="time" required className={`mt-1 ${inputClass}`} />
                  </label>
                  <label className="flex-1 text-sm text-gray-600">
                    Fim
                    <input name="end_time" type="time" required className={`mt-1 ${inputClass}`} />
                  </label>
                </div>
                <button
                  type="submit"
                  className="self-start rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Adicionar horário
                </button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-2">
              {(slots ?? []).map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
                >
                  <p className="text-sm text-gray-700">
                    {WEEKDAYS[slot.weekday]} · {slot.start_time.slice(0, 5)} -{' '}
                    {slot.end_time.slice(0, 5)}
                  </p>
                  <DeleteAvailabilityButton id={slot.id} />
                </div>
              ))}
              {(slots ?? []).length === 0 && (
                <p className="text-sm text-gray-400">Nenhum horário cadastrado ainda.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </SettingsSection>
    </div>
  );
}
