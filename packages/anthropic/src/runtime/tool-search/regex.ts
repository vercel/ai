import { DeferredToolDefinition, RankedToolResult } from './types';

export function regexSearch(
  query: string,
  docs: DeferredToolDefinition[],
): RankedToolResult[] {
  const needle = query.toLowerCase();
  const results: RankedToolResult[] = [];

  for (const doc of docs) {
    const haystack = (
      doc.description +
      ' ' +
      (doc.keywords ?? []).join(' ')
    ).toLowerCase();

    const score = haystack.includes(needle) ? 1 : 0;
    if (score > 0) results.push({ tool: doc, score });
  }

  return results;
}
