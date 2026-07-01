import { requireProfile } from '@/lib/auth';
import { updateProfile } from './actions';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  medico: 'Médico',
  recepcao: 'Recepção',
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { error?: string; success?: string };
}) {
  const profile = await requireProfile();

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold text-gray-800">Meu perfil</h1>

      {searchParams.error && (
        <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
      )}
      {searchParams.success && (
        <p className="mb-4 rounded bg-green-50 p-2 text-sm text-green-600">
          Dados atualizados com sucesso.
        </p>
      )}

      <form action={updateProfile} className="flex flex-col gap-3 rounded-xl bg-white p-6 shadow-sm">
        <label className="text-sm text-gray-600">
          Nome completo
          <input
            name="full_name"
            required
            defaultValue={profile.full_name}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Função
          <input
            disabled
            value={ROLE_LABELS[profile.role]}
            className="mt-1 w-full rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
          />
        </label>
        <label className="text-sm text-gray-600">
          Nova senha (deixe em branco para manter a atual)
          <input
            name="password"
            type="password"
            minLength={6}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Salvar
        </button>
      </form>
    </div>
  );
}
