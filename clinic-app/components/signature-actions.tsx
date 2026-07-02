'use client';

import { cancelSignatureRequest, markSignatureSigned } from '@/app/dashboard/(shell)/signatures/actions';
import type { SignatureStatus } from '@/lib/types';

export function SignatureActions({ id, status }: { id: string; status: SignatureStatus }) {
  if (status !== 'pendente') {
    return null;
  }

  return (
    <div className="flex justify-end gap-3 text-xs">
      <button
        type="button"
        onClick={() => markSignatureSigned(id)}
        className="text-brand-600 hover:underline"
      >
        Marcar como assinado
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm('Cancelar esta solicitação de assinatura?')) {
            cancelSignatureRequest(id);
          }
        }}
        className="text-red-500 hover:underline"
      >
        Cancelar
      </button>
    </div>
  );
}
