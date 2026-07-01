'use client';

import { deleteInvoice } from '@/app/dashboard/(shell)/billing/actions';

export function DeleteInvoiceButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover esta fatura?')) {
          deleteInvoice(id);
        }
      }}
      className="text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
