import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Plan } from '@/lib/types';
import { MODULE_LABELS } from '@/lib/plans';
import { signup } from '../login/actions';

export default async function SignupPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createSupabaseServerClient();
  const { data: plans } = await supabase
    .from('plans')
    .select('*')
    .order('max_users', { ascending: true, nullsFirst: false })
    .returns<Plan[]>();

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-2xl rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-brand-700">Cadastrar clínica</h1>
        <p className="mb-6 text-sm text-gray-500">
          Crie a conta da sua clínica e escolha o plano ideal para começar.
        </p>

        {searchParams.error && (
          <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
        )}

        <form action={signup} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="clinic_name"
              required
              placeholder="Nome da clínica"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="full_name"
              required
              placeholder="Seu nome completo"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="E-mail"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              name="password"
              type="password"
              required
              minLength={6}
              placeholder="Senha"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Escolha o plano</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(plans ?? []).map((plan, index) => (
                <label
                  key={plan.id}
                  className="flex cursor-pointer flex-col gap-2 rounded-xl border border-gray-200 p-4 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
                >
                  <span className="flex items-center gap-2 font-semibold text-gray-800">
                    <input
                      type="radio"
                      name="plan_id"
                      value={plan.id}
                      required
                      defaultChecked={index === 0}
                    />
                    {plan.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {plan.max_users ? `Até ${plan.max_users} usuários` : 'Usuários ilimitados'}
                  </span>
                  <ul className="flex flex-col gap-0.5 text-xs text-gray-500">
                    {plan.modules.map((module) => (
                      <li key={module}>• {MODULE_LABELS[module] ?? module}</li>
                    ))}
                  </ul>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Cadastrar clínica
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Já tem conta?{' '}
          <Link href="/login" className="text-brand-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
