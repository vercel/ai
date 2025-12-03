import { toolSearchRegistry } from './registry';
import { bm25Search } from './bm25';
import { regexSearch } from './regex';
import { DeferredToolDefinition } from './types';

/**
 * Combined BM25 + Regex tool search.
 * This is the unified runtime entry point used by anthropic-prepare-tools.ts.
 */
export function runtimeToolSearch(
  query: string,
  maxResults = 3,
): DeferredToolDefinition[] {
  const all = toolSearchRegistry.list();
  if (!query.trim()) return [];

  const bm25 = bm25Search(query, all);
  const regex = regexSearch(query, all);

  const combined = new Map<
    string,
    { tool: DeferredToolDefinition; score: number }
  >();

  for (const r of [...bm25, ...regex]) {
    const key = r.tool.name;

    if (!combined.has(key)) {
      combined.set(key, { tool: r.tool, score: r.score });
    } else {
      combined.get(key)!.score += r.score;
    }
  }

  return [...combined.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(entry => entry.tool);
}
