'use client';

import { markInvoicePaidWithMethod } from '@/app/dashboard/(shell)/billing/actions';
import type { PaymentMethod } from '@/lib/types';

export function MarkPaidButton({
  id,
  paymentMethods,
}: {
  id: string;
  paymentMethods: PaymentMethod[];
}) {
  if (paymentMethods.length === 0) {
    return (
      <form action={markInvoicePaidWithMethod.bind(null, id)}>
        <button type="submit" className="text-brand-600 hover:underline">
          Marcar como pago
        </button>
      </form>
    );
  }

  return (
    <form action={markInvoicePaidWithMethod.bind(null, id)} className="flex items-center gap-1">
      <select
        name="payment_method_id"
        defaultValue={paymentMethods.find((method) => method.is_default)?.id ?? ''}
        className="rounded border border-gray-300 px-1 py-0.5 text-xs"
      >
        <option value="">Forma de pagamento</option>
        {paymentMethods.map((method) => (
          <option key={method.id} value={method.id}>
            {method.name}
          </option>
        ))}
      </select>
      <button type="submit" className="text-brand-600 hover:underline">
        Marcar como pago
      </button>
    </form>
  );
}
