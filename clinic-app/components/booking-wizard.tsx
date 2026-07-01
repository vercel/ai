'use client';

import { useEffect, useState, useTransition } from 'react';
import { CheckCircle2, ChevronLeft, Stethoscope } from 'lucide-react';
import { formatDocument } from '@/lib/document';
import {
  listFreeSlots,
  listProfessionals,
  submitBooking,
  type PublicProfessional,
} from '@/app/book/[clinic_slug]/actions';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const AVATAR_COLORS = ['bg-brand-500', 'bg-emerald-500', 'bg-amber-500', 'bg-sky-500', 'bg-rose-500'];

function AvatarPlaceholder({ name }: { name: string }) {
  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${color} text-sm font-semibold text-white`}
    >
      {initials(name)}
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function BookingWizard({
  clinicSlug,
  clinicName,
  specialties,
}: {
  clinicSlug: string;
  clinicName: string;
  specialties: string[];
}) {
  const [step, setStep] = useState(1);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [professionals, setProfessionals] = useState<PublicProfessional[]>([]);
  const [professional, setProfessional] = useState<PublicProfessional | null>(null);
  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!specialty) return;
    startTransition(async () => {
      const list = await listProfessionals(clinicSlug, specialty);
      setProfessionals(list);
    });
  }, [specialty, clinicSlug]);

  useEffect(() => {
    if (!professional || step !== 3) return;
    startTransition(async () => {
      setSelectedSlot(null);
      const list = await listFreeSlots(clinicSlug, professional.id, date);
      setSlots(list);
    });
  }, [professional, date, step, clinicSlug]);

  async function handleSubmit(formData: FormData) {
    if (!professional || !selectedSlot) return;
    setError(null);
    const result = await submitBooking(clinicSlug, professional.id, selectedSlot, formData);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="text-emerald-500" size={48} />
        <h2 className="text-lg font-semibold text-gray-800">Agendamento confirmado!</h2>
        <p className="text-sm text-gray-500">
          Sua consulta com {professional?.full_name} foi marcada para{' '}
          {selectedSlot && new Date(selectedSlot).toLocaleString('pt-BR')}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-6 flex items-center justify-between">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft size={16} /> Voltar
          </button>
        )}
        <span className="ml-auto text-xs font-medium text-gray-400">Passo {step} de 4</span>
      </div>

      {step === 1 && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-gray-800">Qual especialidade você procura?</h2>
          <p className="mb-4 text-sm text-gray-500">{clinicName}</p>
          <div className="flex flex-col gap-2">
            {specialties.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSpecialty(s);
                  setStep(2);
                }}
                className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 text-left text-sm font-medium text-gray-700 hover:border-brand-400 hover:bg-brand-50"
              >
                <Stethoscope size={18} className="text-brand-500" />
                {s}
              </button>
            ))}
            {specialties.length === 0 && (
              <p className="text-sm text-gray-400">Nenhuma especialidade disponível no momento.</p>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-800">Escolha o profissional</h2>
          <div className="flex flex-col gap-2">
            {professionals.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProfessional(p);
                  setStep(3);
                }}
                className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 text-left hover:border-brand-400 hover:bg-brand-50"
              >
                <AvatarPlaceholder name={p.full_name} />
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.full_name}</p>
                  <p className="text-xs text-gray-500">{p.specialty}</p>
                </div>
              </button>
            ))}
            {isPending && professionals.length === 0 && (
              <p className="text-sm text-gray-400">Carregando profissionais...</p>
            )}
            {!isPending && professionals.length === 0 && (
              <p className="text-sm text-gray-400">Nenhum profissional disponível para essa especialidade.</p>
            )}
          </div>
        </div>
      )}

      {step === 3 && professional && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-800">Escolha data e horário</h2>
          <label className="mb-4 block text-sm text-gray-600">
            Data
            <input
              type="date"
              min={todayISO()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {slots.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => {
                  setSelectedSlot(slot);
                  setStep(4);
                }}
                className="rounded-lg border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:border-brand-400 hover:bg-brand-50"
              >
                {new Date(slot).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </button>
            ))}
          </div>
          {isPending && <p className="mt-3 text-sm text-gray-400">Buscando horários...</p>}
          {!isPending && slots.length === 0 && (
            <p className="mt-3 text-sm text-gray-400">Nenhum horário livre nessa data.</p>
          )}
        </div>
      )}

      {step === 4 && professional && selectedSlot && (
        <div>
          <h2 className="mb-1 text-lg font-semibold text-gray-800">Confirme seus dados</h2>
          <p className="mb-4 text-sm text-gray-500">
            {professional.full_name} · {new Date(selectedSlot).toLocaleString('pt-BR')}
          </p>
          <form action={handleSubmit} className="flex flex-col gap-3">
            <input
              name="full_name"
              required
              placeholder="Nome completo"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="phone"
              required
              placeholder="Telefone / WhatsApp"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <CpfField />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              className="mt-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Confirmar agendamento
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function CpfField() {
  const [value, setValue] = useState('');
  return (
    <input
      name="cpf"
      required
      inputMode="numeric"
      placeholder="CPF"
      value={value}
      onChange={(e) => setValue(formatDocument(e.target.value))}
      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
    />
  );
}
