'use client';

import { deletePatient } from '@/app/dashboard/(shell)/patients/actions';

export function DeletePatientButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Remover este paciente e todos os registros associados?')) {
          deletePatient(id);
        }
      }}
      className="text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
