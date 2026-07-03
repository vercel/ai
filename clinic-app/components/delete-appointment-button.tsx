'use client';

import { deleteAppointment } from '@/app/dashboard/(shell)/appointments/actions';

export function DeleteAppointmentButton({ id }: { id: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Cancelar e remover este agendamento?')) {
          deleteAppointment(id);
        }
      }}
      className="text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
