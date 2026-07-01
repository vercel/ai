import Link from 'next/link';
import { Activity } from 'lucide-react';
import { login } from './actions';

const inputClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-gray-100 placeholder:text-gray-600 focus:border-electric-500 focus:outline-none focus:ring-1 focus:ring-electric-500';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/5 bg-ink-800 p-8 shadow-2xl">
        <Link href="/" className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-electric-500 shadow-glow">
            <Activity className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            clinic<span className="text-electric-400">-app</span>
          </span>
        </Link>

        <h1 className="mb-1 text-2xl font-semibold text-white">Bem-vindo de volta</h1>
        <p className="mb-6 text-sm text-gray-500">Entre com sua conta para continuar</p>

        {searchParams.message && (
          <p className="mb-4 rounded-lg border border-electric-500/20 bg-electric-500/10 p-3 text-sm text-electric-400">
            {searchParams.message}
          </p>
        )}
        {searchParams.error && (
          <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {searchParams.error}
          </p>
        )}

        <form action={login} className="flex flex-col gap-3">
          <input
            name="email"
            type="email"
            required
            placeholder="E-mail"
            className={inputClass}
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Senha"
            className={inputClass}
          />
          <button
            type="submit"
            className="mt-1 rounded-lg bg-electric-500 px-3 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.01] hover:bg-electric-600"
          >
            Entrar
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Não tem conta?{' '}
          <Link href="/signup" className="font-medium text-electric-400 hover:underline">
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
