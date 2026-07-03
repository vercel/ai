'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function AssetUploadField({
  clinicId,
  name,
  label,
  currentUrl,
}: {
  clinicId: string;
  name: string;
  label: string;
  currentUrl: string | null;
}) {
  const [url, setUrl] = useState(currentUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const path = `${clinicId}/${name}-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('clinic-assets').upload(path, file, {
      upsert: true,
    });

    if (uploadError) {
      setError('Não foi possível enviar o arquivo.');
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from('clinic-assets').getPublicUrl(path);
    setUrl(data.publicUrl);
    setUploading(false);
  }

  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <div className="mt-1 flex items-center gap-3">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-12 w-24 rounded border border-gray-200 object-contain" />
        )}
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="text-xs text-gray-500"
        />
      </div>
      {uploading && <p className="mt-1 text-xs text-gray-400">Enviando...</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <input type="hidden" name={name} value={url} />
    </div>
  );
}
