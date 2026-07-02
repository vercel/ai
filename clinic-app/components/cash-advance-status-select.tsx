'use client';

import { updateCashAdvanceStatus } from '@/app/dashboard/(shell)/cash-advances/actions';
import type { CashAdvanceStatus } from '@/lib/types';

const STATUS_LABELS: Record<CashAdvanceStatus, string> = {
  solicitado: 'Solicitado',
  aprovado: 'Aprovado',
  pago: 'Pago',
  rejeitado: 'Rejeitado',
};

export function CashAdvanceStatusSelect({
  id,
  status,
}: {
  id: string;
  status: CashAdvanceStatus;
}) {
  return (
    <select
      defaultValue={status}
      onChange={(event) => updateCashAdvanceStatus(id, event.target.value as CashAdvanceStatus)}
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
