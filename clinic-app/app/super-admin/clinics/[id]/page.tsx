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

  if (!clinic) return <p className="text-gray-500">Clínica não encontrada.</p>;

  const sub = clinic.subscriptions?.[0] ?? null;
  const isSuspended = sub?.status === 'suspended' || !clinic.is_active;
  const activeUserCount = (users ?? []).filter((u) => !u.is_locked).length;

  return (
    <div className="max-w-3xl">
      <div className="mb-2 text-xs text-gray-400">
        <a href="/super-admin/clinics" className="hover:underline">Clínicas</a> / {clinic.name}
      </div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">{clinic.name}</h1>

      {/* Active impersonation warning */}
      {activeImpersonation && activeImpersonation.clinic_id === params.id && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          Você está impersonando esta clínica.{' '}
          <a href="/dashboard" className="font-medium underline">Ir para o dashboard</a>
        </div>
      )}

      {/* Status card */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Plano</p>
            <p className="mt-0.5 text-lg font-semibold text-gray-800">{clinic.plans?.name ?? '—'}</p>
            <p className="text-xs text-gray-500">
              {clinic.plans?.max_users ? `Até ${clinic.plans.max_users} usuários` : 'Ilimitado'} ·{' '}
              Usuários ativos: {activeUserCount}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isSuspended ? 'bg-red-100 text-red-700' :
            sub?.status === 'past_due' ? 'bg-amber-100 text-amber-700' :
            sub?.status === 'trialing' ? 'bg-blue-100 text-blue-700' :
            'bg-green-100 text-green-700'
          }`}>
            {sub?.status ?? (clinic.is_active ? 'ativo' : 'inativo')}
          </span>
        </div>

        <div className="mt-4 flex gap-3">
          {isSuspended ? (
            <form action={activateClinic.bind(null, params.id)}>
              <button type="submit" className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                Reativar clínica
              </button>
            </form>
          ) : (
            <form action={suspendClinic.bind(null, params.id)}>
              <button type="submit" className="rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700">
                Suspender clínica
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Change plan */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Alterar plano</h2>
        <form action={changePlanSuperAdmin.bind(null, params.id)} className="flex items-end gap-3">
          <select
            name="plan_id"
            defaultValue={clinic.plan_id}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {(plans ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button type="submit" className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Aplicar
          </button>
        </form>
      </div>

      {/* Impersonation */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Impersonar clínica</h2>
        <p className="mb-3 text-xs text-gray-400">
          Você acessará o dashboard como se fosse o administrador desta clínica. A ação é registrada nos logs de auditoria.
        </p>
        <form action={startImpersonation.bind(null, params.id)} className="flex flex-col gap-2 max-w-sm">
          <input
            name="reason"
            placeholder="Motivo (ex: suporte técnico)"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="self-start rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900">
            Entrar como esta clínica
          </button>
        </form>
      </div>

      {/* Users */}
      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Usuários ({(users ?? []).length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Função</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Cadastro</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{u.full_name}</td>
                <td className="px-4 py-3 text-gray-500 capitalize">{u.role}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    u.is_locked ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
                  }`}>
                    {u.is_locked ? 'Bloqueado' : 'Ativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">
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
