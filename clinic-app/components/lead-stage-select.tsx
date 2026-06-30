'use client';

import { updateLeadStage } from '@/app/dashboard/crm/actions';
import type { LeadStage } from '@/lib/types';

const STAGE_LABELS: Record<LeadStage, string> = {
  novo: 'Novo',
  contato: 'Em contato',
  agendado: 'Agendado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

export function LeadStageSelect({ id, stage }: { id: string; stage: LeadStage }) {
  return (
    <select
      defaultValue={stage}
      onChange={(event) => updateLeadStage(id, event.target.value as LeadStage)}
      className="rounded border border-gray-300 px-2 py-1 text-xs"
    >
      {Object.entries(STAGE_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
