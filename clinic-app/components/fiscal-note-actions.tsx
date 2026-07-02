'use client';

import { cancelFiscalNote, markFiscalNoteIssued } from '@/app/dashboard/(shell)/fiscal-notes/actions';
import type { FiscalNoteStatus } from '@/lib/types';

export function FiscalNoteActions({ id, status }: { id: string; status: FiscalNoteStatus }) {
  if (status !== 'pendente') {
    return null;
  }

  return (
    <div className="flex justify-end gap-3 text-xs">
      <button
        type="button"
        onClick={() => markFiscalNoteIssued(id)}
        className="text-brand-600 hover:underline"
      >
        Marcar como emitida
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm('Cancelar esta nota fiscal?')) {
            cancelFiscalNote(id);
          }
        }}
        className="text-red-500 hover:underline"
      >
        Cancelar
      </button>
    </div>
  );
}
