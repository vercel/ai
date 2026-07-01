'use client';

import { updatePatientCrmStage } from '@/app/dashboard/(shell)/crm/actions';
import { CRM_STAGES } from '@/lib/crm';

export function PatientCrmStageSelect({ id, stage }: { id: string; stage: string }) {
  return (
    <select
      defaultValue={stage}
      onChange={(event) => updatePatientCrmStage(id, event.target.value)}
      className="rounded border border-gray-300 px-2 py-1 text-xs"
    >
      {CRM_STAGES.map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </select>
  );
}
