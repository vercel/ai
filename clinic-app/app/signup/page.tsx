import Link from 'next/link';
import { signup } from '../login/actions';

export default function SignupPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-brand-700">Criar conta</h1>
        <p className="mb-6 text-sm text-gray-500">Cadastre-se como recepção (padrão)</p>

        {searchParams.error && (
          <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{searchParams.error}</p>
        )}

        <form action={signup} className="flex flex-col gap-3">
          <input
            name="full_name"
            required
            placeholder="Nome completo"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
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
            minLength={6}
            placeholder="Senha"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Cadastrar
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Já tem conta?{' '}
          <Link href="/login" className="text-brand-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
