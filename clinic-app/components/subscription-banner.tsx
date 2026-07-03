'use client';

import Link from 'next/link';
import type { Subscription } from '@/lib/types';

function daysUntil(dateStr: string) {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}

function daysSince(dateStr: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

export function SubscriptionBanner({
  subscription,
  trialEndsAt,
}: {
  subscription: Subscription | null;
  trialEndsAt: string | null;
}) {
  if (!subscription) return null;

  const status = subscription.status;

  if (status === 'trialing' && trialEndsAt) {
    const days = daysUntil(trialEndsAt);
    if (days > 3) return null;
    return (
      <div className="flex items-center justify-between bg-amber-50 px-6 py-2 text-sm text-amber-800 border-b border-amber-200">
        <span>
          Seu período de teste termina em <strong>{days === 0 ? 'hoje' : `${days} dia${days > 1 ? 's' : ''}`}</strong>.
        </span>
        <Link href="/dashboard/admin/subscription" className="ml-4 rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700">
          Assinar agora
        </Link>
      </div>
    );
  }

  if (status === 'past_due') {
    const days = subscription.past_due_since ? daysSince(subscription.past_due_since) : 0;
    const graceDaysLeft = Math.max(0, subscription.grace_period_days - days);
    const message =
      subscription.billing_alert_message ??
      `Pagamento em atraso há ${days} dia${days > 1 ? 's' : ''}.${
        graceDaysLeft > 0
          ? ` Regularize em até ${graceDaysLeft} dia${graceDaysLeft > 1 ? 's' : ''} para evitar suspensão.`
          : ' Conta sujeita a suspensão imediata.'
      }`;
    return (
      <div className="sticky top-0 z-40 flex items-center justify-between bg-red-50 px-6 py-2 text-sm text-red-700 border-b border-red-200">
        <span>{message}</span>
        <Link
          href="/dashboard/admin/subscription"
          className="ml-4 shrink-0 rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          Atualizar Cartão
        </Link>
      </div>
    );
  }

  return null;
}
