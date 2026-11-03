'use client';

import { CodeBlock } from '@vercel/geistdocs/components/code-block';
import { geistShikiTheme } from '@vercel/geistdocs/shiki-theme';
import { cn } from '@vercel/geistdocs/utils';
import { useEffect, useState } from 'react';
import type { HighlighterCore } from 'shiki/core';
import type { Mode } from '@/lib/home/code-examples';
import { Select } from './select';

// Load only the TSX grammar, after hydration. Importing the full Shiki bundle
// exhausts the docs build's memory budget and ships hundreds of unused grammars.
let highlighter: Promise<HighlighterCore> | undefined;
const loadHighlighter = () => {
  highlighter ??= Promise.all([
    import('shiki/core'),
    import('shiki/engine/javascript'),
  ]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
    createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: [import('@shikijs/langs/tsx')],
      themes: [geistShikiTheme],
    }),
  );
  return highlighter;
};
type Tokens = ReturnType<HighlighterCore['codeToTokensBase']>;

/**
 * Geistdocs `CodeBlock` with client-side TSX highlighting, stripped of its own
 * margin, border, and radius so it can sit flush inside a window frame.
 */
export function HighlightedCode({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const [highlighted, setHighlighted] = useState<{
    code: string;
    tokens: Tokens;
  }>();
  useEffect(() => {
    let cancelled = false;
    loadHighlighter()
      .then(engine => {
        if (!cancelled)
          setHighlighted({
            code,
            tokens: engine.codeToTokensBase(code, {
              lang: 'tsx',
              theme: geistShikiTheme,
            }),
          });
      })
      .catch(() => {
        /* The readable, copyable plain-text example remains available. */
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div
      className={cn(
        'overflow-auto text-left [&_pre]:m-0 [&_pre]:rounded-none! [&_pre]:border-0 [&_.line]:px-4 [&>div]:my-0 [&>div]:rounded-none [&>div>div]:rounded-none [&>div>div]:border-0',
        className,
      )}
    >
      <CodeBlock>
        {highlighted?.code === code
          ? highlighted.tokens.map((line, index) => (
              <span className="line" key={index}>
                {line.map(token => (
                  <span key={token.offset} style={{ color: token.color }}>
                    {token.content}
                  </span>
                ))}
                {'\n'}
              </span>
            ))
          : code}
      </CodeBlock>
    </div>
  );
}

export function CodeWindow({
  code,
  filename,
  mode,
  onModeChange,
}: {
  code: string;
  filename: string;
  mode?: Mode;
  onModeChange?: (mode: Mode) => void;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-gray-400 bg-background-100 shadow-sm">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-gray-400 px-4 py-2">
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2 rounded-full bg-[#ee6d5e]" />
            <span className="size-2 rounded-full bg-[#f3bf4a]" />
            <span className="size-2 rounded-full bg-[#5dc753]" />
          </span>
          <span className="font-mono text-xs text-gray-900">{filename}</span>
        </span>
        {mode && onModeChange ? (
          <label className="flex items-center gap-2 text-xs text-gray-900">
            Run it with
            <Select
              aria-label="Model source"
              onChange={event => onModeChange(event.target.value as Mode)}
              value={mode}
            >
              <option value="gateway">AI Gateway</option>
              <option value="provider">Provider</option>
              <option value="custom">Custom</option>
            </Select>
          </label>
        ) : null}
      </div>
      <HighlightedCode className="h-72 [&_pre]:min-h-72" code={code} />
    </div>
  );
}
