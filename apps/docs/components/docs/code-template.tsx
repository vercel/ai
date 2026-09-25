'use client';

import {
  FIRST_PARTY_PROVIDERS,
  InteractiveCodePreview,
} from './interactive-code-preview';
import { resolveDocsHref } from './resolve-href';
import {
  gatewayHighlightedLines,
  parseHighlightedLines,
} from '@/lib/code-template.mjs';

export const CodeTemplate = ({
  code,
  language,
  meta = '',
  versionPrefix,
}: {
  code: string;
  language?: string;
  meta?: string;
  versionPrefix: string;
}) => {
  const highlightedLines = parseHighlightedLines(meta);
  const title = meta.match(/\btitle=(?:"([^"]*)"|'([^']*)')/);

  return (
    <InteractiveCodePreview
      allowedProviders={FIRST_PARTY_PROVIDERS}
      code={code}
      highlightedLines={gatewayHighlightedLines(code, highlightedLines)}
      highlightedLinesWithImport={highlightedLines}
      language={language}
      resolveHref={href => resolveDocsHref(href, versionPrefix)}
      title={title?.[1] ?? title?.[2]}
    />
  );
};
