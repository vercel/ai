'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function StarterPrompt({ text }: { text: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setStatus('idle'), 2000);
  };
  return (
    <div>
      <button
        className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-400 bg-background-100 px-3 py-3 text-sm hover:bg-gray-100"
        onClick={copy}
        type="button"
      >
        <span aria-live="polite">
          {status === 'copied'
            ? 'Copied'
            : status === 'failed'
              ? 'Unable to copy'
              : 'Copy install prompt'}
        </span>
        {status === 'copied' ? (
          <Check aria-hidden="true" size={16} />
        ) : (
          <Copy aria-hidden="true" size={16} />
        )}
      </button>
      <details className="mt-2 text-xs text-gray-900">
        <summary className="cursor-pointer">Preview prompt</summary>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
          {text}
        </pre>
      </details>
    </div>
  );
}
