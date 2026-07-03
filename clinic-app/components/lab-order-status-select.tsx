'use client';

import { updateLabOrderStatus } from '@/app/dashboard/(shell)/lab-orders/actions';
import type { LabOrderStatus } from '@/lib/types';

const STATUS_LABELS: Record<LabOrderStatus, string> = {
  solicitado: 'Solicitado',
  coletado: 'Coletado',
  em_analise: 'Em análise',
  concluido: 'Concluído',
};

export function LabOrderStatusSelect({ id, status }: { id: string; status: LabOrderStatus }) {
  return (
    <select
      defaultValue={status}
      onChange={(event) => updateLabOrderStatus(id, event.target.value as LabOrderStatus)}
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
