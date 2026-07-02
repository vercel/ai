'use client';

import { markCampaignSent } from '@/app/dashboard/(shell)/campaigns/actions';

export function SendCampaignButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Marcar esta campanha como enviada? (registro interno, sem envio real)')) {
          markCampaignSent(id);
        }
      }}
      className="text-brand-600 hover:underline"
    >
      Marcar como enviada
    </button>
  );
}
