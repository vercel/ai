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
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Equipe Super Admin</h1>

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-gray-700">Adicionar super admin</h2>
        <p className="mb-3 text-xs text-gray-400">
          O e-mail deve pertencer a um usuário que já tenha se cadastrado na plataforma.
        </p>
        <form action={inviteSuperAdmin} className="flex gap-2">
          <input
            name="email"
            type="email"
            required
            placeholder="usuario@exemplo.com"
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Adicionar
          </button>
        </form>
        {searchParams.error && (
          <p className="mt-2 text-xs text-red-600">{searchParams.error}</p>
        )}
      </div>

      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Super admins ({(admins ?? []).length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Desde</th>
            </tr>
          </thead>
          <tbody>
            {(admins ?? []).map((a) => (
              <tr key={a.user_id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{a.email}</td>
                <td className="px-4 py-3 text-gray-400">
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
