import { DeferredToolDefinition, RankedToolResult } from './types';

const k1 = 1.2;
const b = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/);
}

export function bm25Search(
  query: string,
  docs: DeferredToolDefinition[],
): RankedToolResult[] {
  const tokens = tokenize(query);
  const N = docs.length;
  const avgdl =
    docs.reduce(
      (acc, d) => acc + tokenize(d.description + ' ' + (d.keywords ?? []).join(' ')).length,
      0,
    ) / Math.max(1, N);

  return docs
    .map(doc => {
      const docTokens = tokenize(
        doc.description + ' ' + (doc.keywords ?? []).join(' '),
      );
      const dl = docTokens.length;

      const freq: Record<string, number> = {};
      for (const t of docTokens) freq[t] = (freq[t] ?? 0) + 1;

      let score = 0;
      for (const term of tokens) {
        const f = freq[term] ?? 0;
        if (f === 0) continue;

        const n = docs.filter(d =>
          tokenize(d.description).includes(term),
        ).length;

        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));

        score +=
          idf *
          ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * dl) / avgdl)));
      }

      return { tool: doc, score };
    })
    .sort((a, b) => b.score - a.score);
}
