import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfileWithPlan } from '@/lib/auth';
import type { Plan, Profile } from '@/lib/types';
import { changePlan, exportClinicData, unlockUser } from './actions';

type DataExportRow = {
  id: string;
  status: 'processing' | 'ready' | 'failed';
  reason: string;
  signed_url: string | null;
  expires_at: string | null;
  error_message: string | null;
  created_at: string;
};

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusLabel(status: string) {
  const map: Record<string, { label: string; class: string }> = {
    trialing: { label: 'Trial', class: 'bg-blue-100 text-blue-700' },
    active: { label: 'Ativo', class: 'bg-green-100 text-green-700' },
    past_due: { label: 'Em atraso', class: 'bg-amber-100 text-amber-700' },
    suspended: { label: 'Suspenso', class: 'bg-red-100 text-red-700' },
    canceled: { label: 'Cancelado', class: 'bg-gray-100 text-gray-500' },
  };
  return map[status] ?? { label: status, class: 'bg-gray-100 text-gray-500' };
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: { error?: string; success?: string };
}) {
  const profile = await requireProfileWithPlan();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();

  const [{ data: plans }, { data: users }, { data: exports }] = await Promise.all([
    supabase.from('plans').select('*').order('price_cents').returns<Plan[]>(),
    supabase
      .from('profiles')
      .select('*')
      .eq('clinic_id', profile.clinic_id)
      .order('full_name')
      .returns<Profile[]>(),
    supabase
      .from('data_exports')
      .select('id, status, reason, signed_url, expires_at, error_message, created_at')
      .eq('clinic_id', profile.clinic_id)
      .order('created_at', { ascending: false })
      .limit(5)
      .returns<DataExportRow[]>(),
  ]);

  const sub = profile.subscription;
  const activeCount = (users ?? []).filter((u) => !(u as any).is_locked).length;
  const lockedUsers = (users ?? []).filter((u) => (u as any).is_locked);
  const sl = sub ? statusLabel(sub.status) : null;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Plano & Assinatura</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{searchParams.error}</p>
      )}
      {searchParams.success && (
        <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700">{searchParams.success}</p>
      )}

      {/* Current plan card */}
      <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Plano atual</p>
            <p className="mt-1 text-2xl font-bold text-gray-800">{profile.plan?.name ?? '—'}</p>
            <p className="mt-0.5 text-sm text-gray-500">
              {profile.plan?.max_users ? `Até ${profile.plan.max_users} usuários` : 'Usuários ilimitados'} ·{' '}
              {formatPrice(profile.plan?.price_cents ?? 0)}/mês
            </p>
          </div>
          {sl && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sl.class}`}>
              {sl.label}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-6 text-sm text-gray-500">
          <span>
            Usuários ativos: <strong className="text-gray-700">{activeCount}</strong>
            {profile.plan?.max_users ? ` / ${profile.plan.max_users}` : ''}
          </span>
          {sub?.current_period_end && (
            <span>
              Próxima cobrança:{' '}
              <strong className="text-gray-700">
                {new Date(sub.current_period_end).toLocaleDateString('pt-BR')}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* Change plan */}
      <div className="mb-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Alterar plano</h2>
        <form action={changePlan} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(plans ?? []).map((plan) => {
              const isCurrent = plan.id === profile.plan?.id;
              return (
                <label
                  key={plan.id}
                  className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 ${
                    isCurrent ? 'border-brand-400 bg-brand-50/50' : 'border-gray-200'
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold text-gray-800">
                    <input
                      type="radio"
                      name="plan_id"
                      value={plan.id}
                      defaultChecked={isCurrent}
                      required
                    />
                    {plan.name}
                    {isCurrent && (
                      <span className="ml-auto text-xs font-normal text-brand-600">atual</span>
                    )}
                  </span>
                  <span className="text-xs text-gray-500">
                    {plan.max_users ? `Até ${plan.max_users} usuários` : 'Ilimitado'}
                  </span>
                  <span className="text-xs font-medium text-gray-700">
                    {formatPrice(plan.price_cents)}/mês
                  </span>
                </label>
              );
            })}
          </div>
          <button
            type="submit"
            className="self-start rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Confirmar alteração
          </button>
        </form>
      </div>

      {/* Locked users */}
      {lockedUsers.length > 0 && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Usuários bloqueados</h2>
          <p className="mb-4 text-xs text-gray-400">
            Bloqueados por excesso de usuários após downgrade. Reative ao fazer upgrade.
          </p>
          <div className="flex flex-col gap-2">
            {lockedUsers.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">{u.full_name}</p>
                  <p className="text-xs text-gray-400">{u.role}</p>
                </div>
                <form action={unlockUser.bind(null, u.id)}>
                  <button type="submit" className="text-xs text-brand-600 hover:underline">
                    Reativar
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LGPD data portability */}
      <div className="mt-8 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Portabilidade de dados (LGPD)</h2>
        <p className="mb-4 text-xs text-gray-400">
          Gere um pacote com todos os dados da clínica (pacientes, prontuários, financeiro, documentos)
          e um link de download temporário. Também é gerado automaticamente caso a assinatura seja cancelada.
        </p>
        <form action={exportClinicData}>
          <button
            type="submit"
            className="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
          >
            Solicitar exportação
          </button>
        </form>

        {(exports ?? []).length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {(exports ?? []).map((exp) => (
              <div key={exp.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 text-sm">
                <div>
                  <p className="text-gray-700">
                    {new Date(exp.created_at).toLocaleString('pt-BR')} ·{' '}
                    <span className="text-gray-400">{exp.reason === 'manual' ? 'manual' : 'cancelamento'}</span>
                  </p>
                  {exp.status === 'failed' && (
                    <p className="text-xs text-red-500">{exp.error_message}</p>
                  )}
                  {exp.expires_at && (
                    <p className="text-xs text-gray-400">
                      Expira em {new Date(exp.expires_at).toLocaleDateString('pt-BR')}
                    </p>
                  )}
                </div>
                {exp.status === 'ready' && exp.signed_url && (
                  <a
                    href={exp.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100"
                  >
                    Baixar
                  </a>
                )}
                {exp.status === 'processing' && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Processando</span>
                )}
                {exp.status === 'failed' && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Falhou</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
