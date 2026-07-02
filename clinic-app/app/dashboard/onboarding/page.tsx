import { requireProfile } from '@/lib/auth';
import { OnboardingWizard } from '@/components/onboarding-wizard';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-brand-600">
          Configuração inicial
        </p>
        <h1 className="mb-6 text-2xl font-semibold text-gray-800">
          Vamos preparar sua clínica
        </h1>

        {searchParams.error && (
          <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{searchParams.error}</p>
        )}

        {profile.role === 'admin' ? (
          <OnboardingWizard />
        ) : (
          <p className="text-sm text-gray-500">
            A configuração inicial da clínica ainda não foi concluída. Peça para o administrador
            acessar o sistema e finalizar o cadastro.
          </p>
        )}
      </div>
    </div>
  );
}
