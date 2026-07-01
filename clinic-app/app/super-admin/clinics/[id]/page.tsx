import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import type { Clinic, Plan, Profile, Subscription } from '@/lib/types';
import { activateClinic, changePlanSuperAdmin, startImpersonation, suspendClinic } from './actions';

type ClinicRow = Clinic & { plans: Plan; subscriptions: Subscription[] };

export default async function ClinicDetailPage({ params }: { params: { id: string } }) {
  const actor = await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const [{ data: clinic }, { data: plans }, { data: users }, { data: activeImpersonation }] =
    await Promise.all([
      supabase
        .from('clinics')
        .select('*, plans(*), subscriptions(*)')
        .eq('id', params.id)
        .single<ClinicRow>(),
      supabase.from('plans').select('*').order('price_cents').returns<Plan[]>(),
      supabase
        .from('profiles')
        .select('*')
        .eq('clinic_id', params.id)
        .order('full_name')
        .returns<(Profile & { is_locked: boolean })[]>(),
      supabase
        .from('impersonation_sessions')
        .select('id, clinic_id, started_at')
        .eq('super_admin_id', actor.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; clinic_id: string; started_at: string }>(),
    ]);

  if (!clinic) return <p className="text-slate-500">Clínica não encontrada.</p>;

  const sub = clinic.subscriptions?.[0] ?? null;
  const isSuspended = sub?.status === 'suspended' || !clinic.is_active;
  const activeUserCount = (users ?? []).filter((u) => !u.is_locked).length;

  return (
    <div className="max-w-3xl">
      <div className="mb-2 text-xs text-slate-500">
        <a href="/super-admin/clinics" className="hover:underline">Clínicas</a> / {clinic.name}
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-white">{clinic.name}</h1>

      {/* Active impersonation warning */}
      {activeImpersonation && activeImpersonation.clinic_id === params.id && (
        <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">
          Você está impersonando esta clínica.{' '}
          <a href="/dashboard" className="font-medium underline">Ir para o dashboard</a>
        </div>
      )}

      {/* Status card */}
      <div className="mb-6 rounded-2xl border border-white/5 bg-slate-900/60 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Plano</p>
            <p className="mt-0.5 text-lg font-semibold text-white">{clinic.plans?.name ?? '—'}</p>
            <p className="text-xs text-slate-500">
              {clinic.plans?.max_users ? `Até ${clinic.plans.max_users} usuários` : 'Ilimitado'} ·{' '}
              Usuários ativos: {activeUserCount}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isSuspended ? 'bg-red-500/10 text-red-400' :
            sub?.status === 'past_due' ? 'bg-amber-500/10 text-amber-400' :
            sub?.status === 'trialing' ? 'bg-blue-500/10 text-blue-400' :
            'bg-emerald-500/10 text-emerald-400'
          }`}>
            {sub?.status ?? (clinic.is_active ? 'ativo' : 'inativo')}
          </span>
        </div>

        <div className="mt-4 flex gap-3">
          {isSuspended ? (
            <form action={activateClinic.bind(null, params.id)}>
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
                Reativar clínica
              </button>
            </form>
          ) : (
            <form action={suspendClinic.bind(null, params.id)}>
              <button type="submit" className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500">
                Suspender clínica
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Change plan */}
      <div className="mb-6 rounded-2xl border border-white/5 bg-slate-900/60 p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-200">Alterar plano</h2>
        <form action={changePlanSuperAdmin.bind(null, params.id)} className="flex items-end gap-3">
          <select
            name="plan_id"
            defaultValue={clinic.plan_id}
            className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-200"
          >
            {(plans ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500">
            Aplicar
          </button>
        </form>
      </div>

      {/* Impersonation */}
      <div className="mb-6 rounded-2xl border border-white/5 bg-slate-900/60 p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">Impersonar clínica</h2>
        <p className="mb-3 text-xs text-slate-500">
          Você acessará o dashboard como se fosse o administrador desta clínica. A ação é registrada nos logs de auditoria.
        </p>
        <form action={startImpersonation.bind(null, params.id)} className="flex flex-col gap-2 max-w-sm">
          <input
            name="reason"
            placeholder="Motivo (ex: suporte técnico)"
            className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
          />
          <button type="submit" className="self-start rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600">
            Entrar como esta clínica
          </button>
        </form>
      </div>

      {/* Users */}
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="border-b border-white/5 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-200">Usuários ({(users ?? []).length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Função</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Cadastro</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-t border-white/5">
                <td className="px-4 py-3 font-medium text-slate-200">{u.full_name}</td>
                <td className="px-4 py-3 text-slate-400 capitalize">{u.role}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.is_locked ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {u.is_locked ? 'Bloqueado' : 'Ativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(u.created_at).toLocaleDateString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
