'use client';

import { markInvoicePaid } from '@/app/dashboard/billing/actions';

export function MarkPaidButton({ id }: { id: string }) {
  return (
    <button
      onClick={() => {
        const method = prompt('Forma de pagamento (dinheiro, cartão, pix...)') ?? undefined;
        markInvoicePaid(id, method);
      }}
      className="text-brand-600 hover:underline"
      type="button"
    >
      Marcar como pago
    </button>
  );
}
