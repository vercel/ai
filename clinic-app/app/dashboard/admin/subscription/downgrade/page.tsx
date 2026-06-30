import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfileWithPlan } from '@/lib/auth';
import type { Profile } from '@/lib/types';
import { applyDowngrade } from '../actions';

export default async function DowngradePage({
  searchParams,
}: {
  searchParams: { plan_id?: string; keep?: string };
}) {
  const profile = await requireProfileWithPlan();
  requireAdmin(profile);

  const keepCount = Number(searchParams.keep ?? 0);
  if (!searchParams.plan_id || keepCount < 1) {
    redirect('/dashboard/admin/subscription');
  }

  const supabase = createSupabaseServerClient();
  const { data: newPlan } = await supabase
    .from('plans')
    .select('name, max_users')
    .eq('id', searchParams.plan_id)
    .single<{ name: string; max_users: number | null }>();

  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .eq('clinic_id', profile.clinic_id)
    .eq('is_locked', false)
    .order('full_name')
    .returns<Profile[]>();

  const activeUsers = users ?? [];

  return (
    <div className="max-w-xl">
      <h1 className="mb-2 text-2xl font-semibold text-gray-800">Selecionar usuários para manter</h1>
      <p className="mb-6 text-sm text-gray-500">
        O plano <strong>{newPlan?.name}</strong> permite até{' '}
        <strong>{newPlan?.max_users} usuário{(newPlan?.max_users ?? 0) > 1 ? 's' : ''}</strong>. Você
        tem <strong>{activeUsers.length}</strong> ativos. Escolha exatamente{' '}
        <strong>{keepCount}</strong> para manter — os demais serão bloqueados (sem exclusão de dados).
      </p>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-6 text-sm text-amber-800">
        Usuários bloqueados não poderão acessar o sistema até que você os reative após um upgrade.
      </div>

      <form action={applyDowngrade} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {activeUsers.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 p-4 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
            >
              <input type="checkbox" name="keep_user_id" value={u.id} className="accent-brand-600" />
              <div>
                <p className="text-sm font-medium text-gray-800">{u.full_name}</p>
                <p className="text-xs text-gray-400 capitalize">{u.role}</p>
              </div>
              {u.id === profile.id && (
                <span className="ml-auto text-xs text-brand-600">(você)</span>
              )}
            </label>
          ))}
        </div>

        <p className="text-xs text-gray-400">Selecione exatamente {keepCount} usuário{keepCount > 1 ? 's' : ''}.</p>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Confirmar downgrade
          </button>
          <a
            href="/dashboard/admin/subscription"
            className="rounded border border-gray-300 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </a>
        </div>
      </form>
    </div>
  );
}
