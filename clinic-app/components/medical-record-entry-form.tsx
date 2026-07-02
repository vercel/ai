'use client';

import { useState } from 'react';
import type { MedicalRecordTemplate } from '@/lib/types';
import { RichTextEditor } from './rich-text-editor';

const inputClass = 'w-full rounded border border-gray-300 px-3 py-2 text-sm';

export function MedicalRecordEntryForm({
  action,
  templates,
}: {
  action: (formData: FormData) => void | Promise<void>;
  templates: MedicalRecordTemplate[];
}) {
  const [entryContent, setEntryContent] = useState('');
  const [editorKey, setEditorKey] = useState(0);

  return (
    <form action={action} encType="multipart/form-data" className="flex flex-col gap-3">
      {templates.length > 0 && (
        <label className="text-sm text-gray-600">
          Carregar modelo
          <select
            defaultValue=""
            onChange={(e) => {
              const template = templates.find((t) => t.id === e.target.value);
              if (template) {
                setEntryContent(template.content);
                setEditorKey((k) => k + 1);
              }
            }}
            className={`mt-1 ${inputClass}`}
          >
            <option value="" disabled>
              Selecione um modelo...
            </option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <RichTextEditor key={editorKey} name="entry" initialContent={entryContent} />
      <label className="text-sm text-gray-600">
        Anexo (exame, documento, imagem)
        <input name="attachment" type="file" className={`mt-1 ${inputClass}`} />
      </label>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="submit"
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Salvar
        </button>
      </div>
    </form>
  );
}
