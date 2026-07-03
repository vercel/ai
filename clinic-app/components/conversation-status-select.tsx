'use client';

import { updateConversationStatus } from '@/app/dashboard/(shell)/conversations/actions';
import type { ConversationStatus } from '@/lib/types';

const STATUS_LABELS: Record<ConversationStatus, string> = {
  aberta: 'Aberta',
  pendente: 'Pendente',
  resolvida: 'Resolvida',
};

export function ConversationStatusSelect({
  id,
  status,
}: {
  id: string;
  status: ConversationStatus;
}) {
  return (
    <select
      defaultValue={status}
      onChange={(event) => updateConversationStatus(id, event.target.value as ConversationStatus)}
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
