import { DeferredToolDefinition } from "./registry";

/**
 * Extremely small BM25-ish scorer for ranking tool definitions.
 */
export function bm25Search(query: string, tools: DeferredToolDefinition[]) {
  const q = query.toLowerCase().split(/\s+/g);

  return tools
    .map(t => {
      let score = 0;

      const haystack = [
        t.name,
        t.description,
        ...(t.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();

      for (const term of q) {
        if (haystack.includes(term)) score += 2;
      }

      return { tool: t, score };
    })
    .filter(r => r.score > 0);
}
