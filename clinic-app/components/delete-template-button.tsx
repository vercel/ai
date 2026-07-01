'use client';

import { deleteTemplate } from '@/app/dashboard/(shell)/admin/templates/actions';

export function DeleteTemplateButton({ templateId }: { templateId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Excluir este modelo?')) {
          deleteTemplate(templateId);
        }
      }}
      className="shrink-0 text-xs text-red-500 hover:underline"
    >
      Excluir
    </button>
  );
}
