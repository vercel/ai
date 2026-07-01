'use client';

import { useState } from 'react';
import { signMedicalRecord } from '@/app/dashboard/(shell)/patients/actions';
import { SignaturePad } from './signature-pad';

export function SignRecordButton({
  patientId,
  recordId,
}: {
  patientId: string;
  recordId: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-brand-600 hover:underline"
      >
        Assinar entrada
      </button>
    );
  }

  return (
    <div className="mt-2 rounded border border-gray-200 p-3">
      <SignaturePad
        signerLabel="profissional"
        onSign={(dataUrl) => {
          signMedicalRecord(patientId, recordId, dataUrl);
          setOpen(false);
        }}
      />
    </div>
  );
}
