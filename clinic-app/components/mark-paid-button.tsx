'use client';

import { markInvoicePaid } from '@/app/dashboard/billing/actions';

export function MarkPaidButton({ id }: { id: string }) {
  return (
    <button
      onClick={() => markInvoicePaid(id)}
      className="text-brand-600 hover:underline"
      type="button"
    >
      Marcar como pago
    </button>
  );
}
