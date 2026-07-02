'use client';

import { useState } from 'react';
import { generatePatientPortalLink } from '@/app/dashboard/(shell)/patients/actions';

export function PatientPortalLinkButton({ patientId }: { patientId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="self-center text-right">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          const path = await generatePatientPortalLink(patientId);
          setLoading(false);
          setLink(path ? `${window.location.origin}${path}` : null);
        }}
        className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
      >
        {loading ? 'Gerando...' : 'Gerar link do portal'}
      </button>
      {link && (
        <div className="mt-2 max-w-xs break-all rounded bg-gray-50 p-2 text-xs text-brand-700">
          {link}
        </div>
      )}
    </div>
  );
}
