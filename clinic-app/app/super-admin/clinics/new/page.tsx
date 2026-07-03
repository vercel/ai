import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import type { Plan } from '@/lib/types';
import { DocumentInput } from '@/components/document-input';
import { createClinicManually } from './actions';

const inputClass =
  'w-full rounded-lg border border-white/10 bg-slate-800 px-3.5 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

export default async function NewClinicPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data: plans } = await supabase
    .from('plans')
    .select('*')
    .order('price_cents')
    .returns<Plan[]>();

  return (
    <div className="max-w-2xl">
      <div className="mb-2 text-xs text-slate-500">
        <Link href="/super-admin/clinics" className="hover:underline">Clínicas</Link> / Nova clínica
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Cadastrar clínica manualmente</h1>

      {searchParams.error && (
        <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {searchParams.error}
        </p>
      )}

      <form action={createClinicManually} className="flex flex-col gap-6">
        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">Dados da clínica</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="clinic_name" required placeholder="Nome fantasia da clínica" className={inputClass} />
            <input name="legal_name" placeholder="Razão social" className={inputClass} />
            <DocumentInput className={inputClass} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Gestor responsável</h2>
          <p className="mb-4 text-xs text-slate-500">
            Uma conta de administrador será criada com esses dados para o gestor acessar a clínica.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="admin_full_name"
              required
              placeholder="Nome completo do gestor"
              className={`${inputClass} sm:col-span-2`}
            />
            <input name="admin_email" type="email" required placeholder="E-mail" className={inputClass} />
            <input
              name="admin_password"
              type="password"
              required
              minLength={6}
              placeholder="Senha provisória (mín. 6 caracteres)"
              className={inputClass}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Plano</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(plans ?? []).map((plan, index) => (
              <label
                key={plan.id}
                className="flex cursor-pointer flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm transition-colors has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-500/10"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-100">
                  <input type="radio" name="plan_id" value={plan.id} required defaultChecked={index === 0} className="accent-emerald-500" />
                  {plan.name}
                </span>
                <span className="text-xs text-slate-500">
                  {plan.max_users ? `Até ${plan.max_users} usuários` : 'Ilimitado'} ·{' '}
                  {(plan.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês
                </span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            A assinatura já entra como <strong className="text-slate-300">ativa</strong> (sem período de trial),
            com vencimento em 30 dias.
          </p>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          Cadastrar clínica
        </button>
      </form>
    </div>
  );
}
