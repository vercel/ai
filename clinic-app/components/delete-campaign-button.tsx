'use client';

import { deleteCampaign } from '@/app/dashboard/(shell)/campaigns/actions';

export function DeleteCampaignButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover esta campanha?')) {
          deleteCampaign(id);
        }
      }}
      className="text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
