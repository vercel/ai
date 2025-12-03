import { DeferredToolDefinition } from './types';

export function regexSearch(query: string, tools: DeferredToolDefinition[]) {
  try {
    const regex = new RegExp(query, 'i');

    return tools
      .map(t => {
        const haystack = [t.name, t.description, ...(t.keywords ?? [])].join(
          ' ',
        );

        return {
          tool: t,
          score: regex.test(haystack) ? 1 : 0,
        };
      })
      .filter(r => r.score > 0);
  } catch {
    return [];
  }
}
