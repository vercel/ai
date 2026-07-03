import Link from 'next/link';
import { Activity, BadgeCheck } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Plan } from '@/lib/types';
import { MODULE_LABELS } from '@/lib/plans';
import { DocumentInput } from '@/components/document-input';
import { signup } from '../login/actions';

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 focus:border-electric-500 focus:outline-none focus:ring-1 focus:ring-electric-500';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string; plan?: string };
}) {
  const supabase = createSupabaseServerClient();
  const { data: plans } = await supabase
    .from('plans')
    .select('*')
    .order('max_users', { ascending: true, nullsFirst: false })
    .returns<Plan[]>();

  // Captures the plan chosen on the landing page (?plan=slug) to pre-select
  // the matching radio button; falls back to the first plan otherwise.
  const preselectedIndex = (plans ?? []).findIndex((plan) => plan.slug === searchParams.plan);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-white/5 bg-ink-800 p-8 shadow-2xl">
        <Link href="/" className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-electric-500 shadow-glow">
            <Activity className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            clinic<span className="text-electric-400">-app</span>
          </span>
        </Link>

        <h1 className="mb-1 text-2xl font-semibold text-white">Cadastrar clínica</h1>
        <p className="mb-6 text-sm text-gray-500">
          Crie a conta da sua clínica e escolha o plano ideal para começar.
        </p>

        {searchParams.error && (
          <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        <form action={signup} className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-electric-400">
              Dados da clínica
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                name="clinic_name"
                required
                placeholder="Nome fantasia da clínica"
                className={inputClass}
              />
              <input
                name="legal_name"
                required
                placeholder="Razão social (ou nome completo, se autônomo)"
                className={inputClass}
              />
              <DocumentInput className={inputClass} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-electric-400">
              Dados do gestor responsável
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                name="full_name"
                required
                placeholder="Nome completo do gestor"
                className={`${inputClass} sm:col-span-2`}
              />
              <input
                name="email"
                type="email"
                required
                placeholder="E-mail"
                className={inputClass}
              />
              <input
                name="password"
                type="password"
                required
                minLength={6}
                placeholder="Senha"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-electric-400">
              Escolha o plano
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(plans ?? []).map((plan, index) => (
                <label
                  key={plan.id}
                  className="flex cursor-pointer flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm transition-colors has-[:checked]:border-electric-500 has-[:checked]:bg-electric-500/10"
                >
                  <span className="flex items-center gap-2 font-semibold text-gray-100">
                    <input
                      type="radio"
                      name="plan_id"
                      value={plan.id}
                      required
                      defaultChecked={index === (preselectedIndex >= 0 ? preselectedIndex : 0)}
                      className="accent-electric-500"
                    />
                    {plan.name}
                  </span>
                  <span className="text-xs font-medium text-electric-400">
                    {plan.max_users ? `Até ${plan.max_users} usuários` : 'Usuários ilimitados'}
                  </span>
                  <ul className="flex flex-col gap-0.5 text-xs text-gray-500">
                    {plan.modules.map((module) => (
                      <li key={module} className="flex items-center gap-1.5">
                        <BadgeCheck className="h-3 w-3 shrink-0 text-gray-600" />
                        {MODULE_LABELS[module] ?? module}
                      </li>
                    ))}
                  </ul>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-electric-500 px-4 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.01] hover:bg-electric-600"
          >
            Cadastrar clínica
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Já tem conta?{' '}
          <Link href="/login" className="font-medium text-electric-400 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
