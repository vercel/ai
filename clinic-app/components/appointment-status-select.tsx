'use client';

import { updateAppointmentStatus } from '@/app/dashboard/appointments/actions';
import type { AppointmentStatus } from '@/lib/types';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  concluido: 'Concluído',
};

export function AppointmentStatusSelect({
  id,
  status,
}: {
  id: string;
  status: AppointmentStatus;
}) {
  return (
    <select
      defaultValue={status}
      onChange={(event) => updateAppointmentStatus(id, event.target.value as AppointmentStatus)}
      className="rounded border border-gray-300 px-2 py-1 text-xs"
    >
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
