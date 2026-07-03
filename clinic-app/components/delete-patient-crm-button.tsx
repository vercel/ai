'use client';

import { deletePatientCrm } from '@/app/dashboard/(shell)/crm/actions';

export function DeletePatientCrmButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover este paciente do funil?')) {
          deletePatientCrm(id);
        }
      }}
      className="text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
