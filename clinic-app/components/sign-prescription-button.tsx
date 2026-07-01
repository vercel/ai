'use client';

import { useState } from 'react';
import { signPrescription } from '@/app/dashboard/(shell)/patients/actions';
import { SignaturePad } from './signature-pad';

export function SignPrescriptionButton({
  patientId,
  prescriptionId,
}: {
  patientId: string;
  prescriptionId: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-brand-600 hover:underline"
      >
        Assinar receita
      </button>
    );
  }

  return (
    <div className="mt-2 rounded border border-gray-200 p-3">
      <SignaturePad
        signerLabel="profissional"
        onSign={(dataUrl) => {
          signPrescription(patientId, prescriptionId, dataUrl);
          setOpen(false);
        }}
      />
    </div>
  );
}
