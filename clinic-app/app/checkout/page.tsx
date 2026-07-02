import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Activity, BadgeCheck } from 'lucide-react';
import { requireProfileWithPlan } from '@/lib/auth';
import { CheckoutPoller } from '@/components/checkout-poller';
import { mockConfirmPayment } from './actions';

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function CheckoutPage() {
  const profile = await requireProfileWithPlan();

  // Payment already confirmed (webhook, or a previous visit here) — the
  // Setup Wizard is the next stop, never the dashboard directly.
  if (profile.subscription?.status === 'active') {
    redirect('/dashboard/onboarding');
  }

  const plan = profile.plan;

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-white/5 bg-ink-800 p-8 shadow-2xl">
        <Link href="/" className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-electric-500 shadow-glow">
            <Activity className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            clinic<span className="text-electric-400">-app</span>
          </span>
        </Link>

        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-electric-400">
          Falta pouco
        </p>
        <h1 className="mb-6 text-2xl font-semibold text-white">Confirme seu pagamento</h1>

        <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-300">Plano {plan?.name ?? '—'}</p>
            {plan?.max_users && (
              <span className="rounded-full bg-electric-500/10 px-2 py-0.5 text-xs text-electric-400">
                Até {plan.max_users} usuários
              </span>
            )}
          </div>
          <p className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-white">
              {formatBRL(plan?.price_cents ?? 0)}
            </span>
            <span className="text-sm text-gray-500">/mês</span>
          </p>
        </div>

        <ul className="mb-8 flex flex-col gap-2">
          {(plan?.modules ?? []).slice(0, 5).map((module) => (
            <li key={module} className="flex items-center gap-2 text-sm text-gray-400">
              <BadgeCheck className="h-4 w-4 shrink-0 text-electric-400" />
              {module}
            </li>
          ))}
        </ul>

        <form action={mockConfirmPayment}>
          <button
            type="submit"
            className="w-full rounded-lg bg-electric-500 px-5 py-3.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.01] hover:bg-electric-600"
          >
            Realizar Pagamento
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-500">
          Você será redirecionado ao provedor de pagamento. Assim que a confirmação chegar, esta
          página avança automaticamente para a configuração inicial.
        </p>

        <CheckoutPoller />
      </div>
    </div>
  );
}
