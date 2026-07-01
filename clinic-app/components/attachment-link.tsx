'use client';

import { useState } from 'react';
import { getAttachmentUrl } from '@/app/dashboard/(shell)/patients/actions';

export function AttachmentLink({ path }: { path: string }) {
  const [loading, setLoading] = useState(false);
  const name = path.split('/').pop();

  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const url = await getAttachmentUrl(path);
        setLoading(false);
        if (url) window.open(url, '_blank');
      }}
      className="text-left text-xs text-brand-600 hover:underline"
    >
      📎 {name}
    </button>
  );
}
