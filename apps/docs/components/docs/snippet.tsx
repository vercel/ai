'use client';

import { IconCheck, IconCopy } from '@vercel/geistdocs/assets/icons';
import { Button } from '@vercel/geistdocs/components/button';
import { useEffect, useRef, useState } from 'react';

const COPIED_RESET_MS = 1500;

/**
 * Copy-to-clipboard control for a snippet. Mirrors the legacy Geist
 * `<Snippet>` copy affordance: a quiet icon button that flips to a check
 * mark briefly after copying.
 */
const CopyButton = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return (
    <Button
      aria-label={copied ? 'Copied' : 'Copy command'}
      className="absolute top-2 right-2 text-gray-900 hover:text-gray-1000"
      onClick={() => {
        // Clipboard access is unavailable on insecure origins and can be
        // denied inside embedded frames; leave the icon unchanged then.
        if (!navigator.clipboard?.writeText) return;
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(
              () => setCopied(false),
              COPIED_RESET_MS,
            );
          })
          .catch(() => {
            // Permission denied or document not focused: no feedback change.
          });
      }}
      size="small"
      svgOnly
      variant="tertiary"
    >
      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
    </Button>
  );
};

/**
 * Terminal command snippet (legacy @vercel/geist `<Snippet>` equivalent).
 * Renders one `$`-prefixed line per command with a copy button that copies
 * the raw commands (no prompt prefixes), newline-joined. Accepts one string
 * (split on newlines) or an array of commands, matching the legacy component.
 *
 * `width` is accepted for content compatibility but ignored: the snippet
 * always fills its container.
 */
export const Snippet = ({
  text,
  prompt = true,
}: {
  text: string | string[];
  width?: number | string;
  prompt?: boolean;
}) => {
  const lines = Array.isArray(text) ? text : text.split('\n');

  return (
    <div className="not-prose relative my-4">
      <pre className="overflow-x-auto rounded-md border border-gray-alpha-400 bg-background-100 py-4 pr-14 pl-4 font-mono text-[13px] leading-6 text-gray-1000">
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static content
          <div key={index}>
            {prompt ? (
              <span className="select-none text-gray-700">$ </span>
            ) : null}
            {line}
          </div>
        ))}
      </pre>
      <CopyButton value={lines.join('\n')} />
    </div>
  );
};
