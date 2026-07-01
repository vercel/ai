'use client';

import { useState } from 'react';

export function ViewPatientPortalButton({
  patientId,
  getLinkAction,
}: {
  patientId: string;
  getLinkAction: (patientId: string) => Promise<string | null>;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const path = await getLinkAction(patientId);
        setLoading(false);
        if (path) {
          window.open(path, '_blank', 'noopener,noreferrer');
        }
      }}
      className="rounded-lg bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
    >
      {loading ? 'Gerando...' : 'Ver Portal do Paciente'}
    </button>
  );
}
