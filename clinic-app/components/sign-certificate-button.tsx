'use client';

import { useState } from 'react';
import { signMedicalCertificate } from '@/app/dashboard/(shell)/patients/actions';
import { SignaturePad } from './signature-pad';

export function SignCertificateButton({
  patientId,
  certificateId,
}: {
  patientId: string;
  certificateId: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-brand-600 hover:underline"
      >
        Assinar atestado
      </button>
    );
  }

  return (
    <div className="mt-2 rounded border border-gray-200 p-3">
      <SignaturePad
        signerLabel="profissional"
        onSign={(dataUrl) => {
          signMedicalCertificate(patientId, certificateId, dataUrl);
          setOpen(false);
        }}
      />
    </div>
  );
}
