'use client';

import { useState } from 'react';
import { signConsentForm } from '@/app/dashboard/(shell)/patients/[id]/consents/actions';
import { SignaturePad } from './signature-pad';

export function SignConsentButton({
  patientId,
  consentId,
}: {
  patientId: string;
  consentId: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
      >
        Assinar termo
      </button>
    );
  }

  return (
    <div className="mt-2 rounded border border-gray-200 p-3">
      <SignaturePad
        signerLabel="paciente ou responsável"
        onSign={(dataUrl, signerName) => {
          signConsentForm(patientId, consentId, dataUrl, signerName);
          setOpen(false);
        }}
      />
    </div>
  );
}
