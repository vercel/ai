'use client';

import { deleteInvoiceItem } from '@/app/dashboard/(shell)/billing/actions';

export function DeleteInvoiceItemButton({ invoiceId, id }: { invoiceId: string; id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover este item?')) {
          deleteInvoiceItem(invoiceId, id);
        }
      }}
      className="text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
