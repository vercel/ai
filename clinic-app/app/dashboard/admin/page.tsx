import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireProfile } from '@/lib/auth';
import type { Profile } from '@/lib/types';
import { RoleSelect } from '@/components/role-select';

export default async function AdminPage() {
  const profile = await requireProfile();
  requireAdmin(profile);

  const supabase = createSupabaseServerClient();
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')
    .returns<Profile[]>();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Administração</h1>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Cadastrado em</th>
              <th className="px-4 py-3">Função</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((user) => (
              <tr key={user.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-800">{user.full_name}</td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(user.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <RoleSelect userId={user.id} role={user.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
