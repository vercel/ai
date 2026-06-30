'use client';

import { deleteConsentForm } from '@/app/dashboard/patients/[id]/consents/actions';

export function DeleteConsentButton({
  patientId,
  consentId,
}: {
  patientId: string;
  consentId: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover este termo?')) {
          deleteConsentForm(patientId, consentId);
        }
      }}
      className="text-xs text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
