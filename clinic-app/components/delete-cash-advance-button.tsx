'use client';

import { deleteCashAdvance } from '@/app/dashboard/(shell)/cash-advances/actions';

export function DeleteCashAdvanceButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover esta solicitação?')) {
          deleteCashAdvance(id);
        }
      }}
      className="text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
