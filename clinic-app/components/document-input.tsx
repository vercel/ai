'use client';

import { useState } from 'react';
import { documentKind, formatDocument } from '@/lib/document';

export function DocumentInput({ className }: { className?: string }) {
  const [value, setValue] = useState('');
  const kind = documentKind(value);

  return (
    <div className="relative">
      <input
        name="document_number"
        required
        inputMode="numeric"
        placeholder="CPF ou CNPJ"
        value={value}
        onChange={(e) => setValue(formatDocument(e.target.value))}
        className={className}
      />
      {kind && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-electric-400">
          {kind}
        </span>
      )}
    </div>
  );
}
