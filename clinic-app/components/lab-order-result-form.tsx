'use client';

import { updateLabOrderResult } from '@/app/dashboard/(shell)/lab-orders/actions';

export function LabOrderResultForm({
  id,
  resultText,
}: {
  id: string;
  resultText: string | null;
}) {
  const action = updateLabOrderResult.bind(null, id);

  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <textarea
        name="result_text"
        defaultValue={resultText ?? ''}
        rows={2}
        placeholder="Resultado do exame..."
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="self-end rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
      >
        Salvar resultado
      </button>
    </form>
  );
}
