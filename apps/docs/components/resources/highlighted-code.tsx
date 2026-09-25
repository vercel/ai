import { CodeBlock } from '@vercel/geistdocs/components/code-block';
import { geistShikiTheme } from '@vercel/geistdocs/shiki-theme';
import { cacheLife } from 'next/cache';
import type { HighlighterCore as ShikiHighlighter } from 'shiki/core';

/**
 * Lazy module-level shiki singleton. Uses the fine-grained core API with
 * only the grammars the tools registry needs instead of the full `shiki`
 * bundle: importing the bundle puts all ~350 grammars into the compile
 * graph, which this app's build memory budget cannot afford (see the same
 * pattern in components/docs/interactive-code-preview.tsx).
 */
let highlighterPromise: Promise<ShikiHighlighter> | null = null;

const loadHighlighter = (): Promise<ShikiHighlighter> => {
  highlighterPromise ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] =
      await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
      ]);
    return createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: [
        import('@shikijs/langs/bash'),
        import('@shikijs/langs/typescript'),
      ],
      themes: [geistShikiTheme],
    });
  })();
  return highlighterPromise;
};

/**
 * Shiki-highlighted code inside the Geistdocs code block chrome, for code
 * that lives outside the MDX pipeline (such as the tools-registry usage
 * examples). Uses the same Geist theme as the MDX code blocks, so token
 * colors resolve through the shared `--shiki-token-*` variables.
 */
// Cache Components: shiki reads unstable values (Date.now) internally, so
// the pure (code, lang) -> HTML computation must run inside a cache scope.
const getHighlightedTokens = async (
  code: string,
  lang: 'bash' | 'typescript',
) => {
  'use cache';
  cacheLife('max');

  const highlighter = await loadHighlighter();
  return highlighter.codeToTokensBase(code, {
    lang,
    theme: geistShikiTheme,
  });
};

export const HighlightedCode = async ({
  code,
  lang,
}: {
  code: string;
  lang: 'bash' | 'typescript';
}) => {
  const tokens = await getHighlightedTokens(code, lang);

  return (
    <CodeBlock className="[&_.line]:px-4">
      {tokens.map((line, lineIndex) => (
        <span
          className="line"
          // Shiki output is position-stable for the current code string.
          // eslint-disable-next-line react/no-array-index-key
          key={lineIndex}
        >
          {line.map(token => (
            <span key={token.offset} style={{ color: token.color }}>
              {token.content}
            </span>
          ))}
          {'\n'}
        </span>
      ))}
    </CodeBlock>
  );
};
