'use client';

import { useState } from 'react';
import { DocumentInput } from './document-input';
import { completeOnboarding } from '@/app/dashboard/onboarding/actions';

const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm';
const labelClass = 'text-sm text-gray-600';

export function OnboardingWizard() {
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <form action={completeOnboarding} className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <StepDot active={step === 1} done={step > 1} label="1" />
        <div className="h-px flex-1 bg-gray-200" />
        <StepDot active={step === 2} done={false} label="2" />
      </div>

      <div className={step === 1 ? 'flex flex-col gap-3' : 'hidden'}>
        <h2 className="text-lg font-semibold text-gray-800">Dados da clínica</h2>
        <p className="mb-2 text-sm text-gray-500">
          Essas informações aparecem no cabeçalho de receitas e atestados emitidos pelo sistema.
        </p>
        <input name="clinic_name" required placeholder="Nome fantasia" className={inputClass} />
        <DocumentInput className={inputClass} />
        <input name="clinic_phone" required placeholder="Telefone principal" className={inputClass} />
        <textarea
          name="clinic_address"
          required
          rows={2}
          placeholder="Endereço completo"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setStep(2)}
          className="mt-2 self-start rounded bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Continuar
        </button>
      </div>

      <div className={step === 2 ? 'flex flex-col gap-3' : 'hidden'}>
        <h2 className="text-lg font-semibold text-gray-800">Seu primeiro profissional</h2>
        <p className="mb-2 text-sm text-gray-500">
          Cadastre quem fará os atendimentos. Você pode adicionar mais profissionais depois.
        </p>
        <input name="full_name" required placeholder="Nome completo" className={inputClass} />
        <input name="specialty" placeholder="Especialidade" className={inputClass} />
        <input
          name="council_registration"
          placeholder="Conselho/Registro (ex: CRM 123456-SP)"
          className={inputClass}
        />
        <input name="email" type="email" required placeholder="E-mail" className={inputClass} />
        <label className={labelClass}>
          Senha provisória
          <input
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="Mín. 6 caracteres"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={() => setStep(1)}
            className="rounded border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Voltar
          </button>
          <button
            type="submit"
            className="rounded bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Concluir configuração
          </button>
        </div>
      </div>
    </form>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        active || done ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'
      }`}
    >
      {label}
    </div>
  );
}
