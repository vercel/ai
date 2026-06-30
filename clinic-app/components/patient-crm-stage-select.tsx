'use client';

import { updatePatientCrmStage } from '@/app/dashboard/crm/actions';

const STAGES = [
  'Contato Inicial',
  'Agendado',
  'Atendido',
  'Em acompanhamento',
  'Aguardando Retorno',
  'Fidelizado',
];

export function PatientCrmStageSelect({ id, stage }: { id: string; stage: string }) {
  return (
    <select
      defaultValue={stage}
      onChange={(event) => updatePatientCrmStage(id, event.target.value)}
      className="rounded border border-gray-300 px-2 py-1 text-xs"
    >
      {STAGES.map((value) => (
        <option key={value} value={value}>
          {value}
        </option>
      ))}
    </select>
  );
}
