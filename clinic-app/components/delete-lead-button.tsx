'use client';

import { deleteLead } from '@/app/dashboard/crm/actions';

export function DeleteLeadButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover este lead?')) {
          deleteLead(id);
        }
      }}
      className="text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
