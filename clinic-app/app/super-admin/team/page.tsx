import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/super-admin';
import { inviteSuperAdmin } from './actions';

export default async function SuperAdminTeamPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requireSuperAdmin();
  const supabase = createSupabaseServerClient();

  const { data: admins } = await supabase
    .from('super_admins')
    .select('user_id, email, created_at')
    .order('created_at', { ascending: false })
    .returns<{ user_id: string; email: string; created_at: string }[]>();

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold text-white">Equipe Super Admin</h1>

      <div className="mb-6 rounded-2xl border border-white/5 bg-slate-900/60 p-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-200">Adicionar super admin</h2>
        <p className="mb-3 text-xs text-slate-500">
          O e-mail deve pertencer a um usuário que já tenha se cadastrado na plataforma.
        </p>
        <form action={inviteSuperAdmin} className="flex gap-2">
          <input
            name="email"
            type="email"
            required
            placeholder="usuario@exemplo.com"
            className="flex-1 rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Adicionar
          </button>
        </form>
        {searchParams.error && (
          <p className="mt-2 text-xs text-red-400">{searchParams.error}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60">
        <div className="border-b border-white/5 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-200">Super admins ({(admins ?? []).length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Desde</th>
            </tr>
          </thead>
          <tbody>
            {(admins ?? []).map((a) => (
              <tr key={a.user_id} className="border-t border-white/5">
                <td className="px-4 py-3 font-medium text-slate-200">{a.email}</td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(a.created_at).toLocaleDateString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
