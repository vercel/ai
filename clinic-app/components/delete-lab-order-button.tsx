'use client';

import { deleteLabOrder } from '@/app/dashboard/(shell)/lab-orders/actions';

export function DeleteLabOrderButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover este exame?')) {
          deleteLabOrder(id);
        }
      }}
      className="text-xs text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
