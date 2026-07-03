'use client';

import { removeFromBlocklist } from '@/app/dashboard/(shell)/campaigns/actions';

export function RemoveBlocklistButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover este contato da lista de bloqueio?')) {
          removeFromBlocklist(id);
        }
      }}
      className="text-red-500 hover:underline"
    >
      Remover
    </button>
  );
}
