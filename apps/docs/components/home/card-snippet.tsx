'use client';

import { IconCheck } from '@vercel/geistdocs/assets/icons/icon-check';
import { IconCopy } from '@vercel/geistdocs/assets/icons/icon-copy';
import { useEffect, useRef, useState } from 'react';

/**
 * Install snippet that is safe to render inside a linked card. The copy button
 * sits inside the card's anchor, so its click would otherwise follow the href;
 * cancelling in the capture phase keeps copying from navigating. The
 * `data-card-snippet` attribute lets the card skip its hover state while the
 * pointer is on the snippet. Pass `label` to show a caption (e.g. "Copy install
 * prompt") instead of the `$ command` that gets copied.
 */
export function CardSnippet({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="relative w-full rounded-md border border-gray-alpha-400 bg-background-100 py-[10px] pr-12 pl-3 font-mono text-copy-13 leading-5 text-gray-1000"
      data-card-snippet
      onClickCapture={event => event.preventDefault()}
      onKeyDownCapture={event => {
        if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
      }}
    >
      {label ?? (
        <>
          <span className="text-gray-900 select-none">$ </span>
          {text}
        </>
      )}
      <button
        aria-label={copied ? 'Copied' : (label ?? `Copy ${text}`)}
        className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-gray-1000 transition-colors hover:bg-gray-alpha-100"
        onClick={copy}
        type="button"
      >
        {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
      </button>
    </div>
  );
}
