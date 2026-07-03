import { requireProfile } from '@/lib/auth';
import { updateProfile } from './actions';
import { PageHeader, SettingsSection } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  medico: 'Médico',
  recepcao: 'Recepção',
};

const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm';

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { error?: string; success?: string };
}) {
  const profile = await requireProfile();

  return (
    <div>
      <PageHeader title="Meu perfil" description="Atualize seus dados de acesso e sua senha." />

      {searchParams.error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{searchParams.error}</p>
      )}
      {searchParams.success && (
        <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Dados atualizados com sucesso.
        </p>
      )}

      <SettingsSection
        title="Dados da conta"
        description="Seu nome aparece em prontuários e documentos assinados por você."
      >
        <Card>
          <CardContent>
            <form action={updateProfile} className="space-y-4">
              <label className="block text-sm text-gray-600">
                Nome completo
                <input name="full_name" required defaultValue={profile.full_name} className={inputClass} />
              </label>
              <label className="block text-sm text-gray-600">
                Função
                <input
                  disabled
                  value={ROLE_LABELS[profile.role]}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                />
              </label>
              <label className="block text-sm text-gray-600">
                Nova senha (deixe em branco para manter a atual)
                <input name="password" type="password" minLength={6} className={inputClass} />
              </label>

              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Salvar
              </button>
            </form>
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  );
}
