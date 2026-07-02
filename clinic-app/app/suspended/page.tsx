import Link from 'next/link';
import { logout } from '@/app/login/actions';

export default function SuspendedPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const isBilling = searchParams.reason === 'billing';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
          <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>

        {isBilling ? (
          <>
            <h1 className="mb-2 text-xl font-semibold text-gray-800">Conta suspensa</h1>
            <p className="mb-6 text-sm text-gray-500">
              O acesso à sua clínica foi suspenso por inadimplência. Entre em contato com o
              administrador ou regularize o pagamento para reativar.
            </p>
            <a
              href="mailto:suporte@clinicmanager.com.br"
              className="inline-block rounded bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Falar com suporte
            </a>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-semibold text-gray-800">Acesso bloqueado</h1>
            <p className="mb-6 text-sm text-gray-500">
              Sua conta foi desativada pelo administrador da clínica, possivelmente por redução de
              usuários no plano. Entre em contato com o responsável.
            </p>
          </>
        )}

        <form action={logout} className="mt-4">
          <button type="submit" className="text-sm text-gray-400 hover:text-gray-600 hover:underline">
            Sair da conta
          </button>
        </form>
      </div>
    </div>
  );
}
