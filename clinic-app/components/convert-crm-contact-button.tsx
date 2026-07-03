'use client';

import { convertCrmContactToPatient } from '@/app/dashboard/(shell)/crm/actions';

export function ConvertCrmContactButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Converter este contato em paciente?')) {
          convertCrmContactToPatient(id);
        }
      }}
      className="text-brand-600 hover:underline"
    >
      Converter em paciente
    </button>
  );
}
