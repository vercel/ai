import Link from 'next/link';
import { login } from './actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-brand-700">Clinic Manager</h1>
        <p className="mb-6 text-sm text-gray-500">Entre com sua conta para continuar</p>

        {searchParams.message && (
          <p className="mb-4 rounded bg-brand-100 p-2 text-sm text-brand-700">
            {searchParams.message}
          </p>
        )}
        {searchParams.error && (
          <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
        )}

        <form action={login} className="flex flex-col gap-3">
          <input
            name="email"
            type="email"
            required
            placeholder="E-mail"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Senha"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Entrar
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Não tem conta?{' '}
          <Link href="/signup" className="text-brand-600 hover:underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
