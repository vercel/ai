Execute code-mode TypeScript in an isolated sandbox.

Put the full program in `js`; top-level `await`/`return` work. Return a JSON-serializable result.
Call host tools only as async `tools.name(input)`; await each or use `Promise.all` for independent calls.
Use exact names/types below. `JSON.parse`/`JSON.stringify` are available.
Fetch: `fetch` is not available.

Tools:

```ts
declare const tools: {
  /** Search indexed documents. */
  search: (input: {
    /** Search query */
    query: string;
    limit?: number;
    mode: 'web' | 'files';
  }) => Promise<{ results: { id: string; title: string; score: number }[] }>;
  /** Summarize text. */
  summarize: (input: {
    text: string;
    bullets?: boolean;
  }) => Promise<{ summary: string; bullets?: string[] }>;
};
```

Tool call examples:

```ts
const [search, summarize] = await Promise.all([
  tools.search({ query: 'incident response notes', limit: 5, mode: 'files' }),
  tools.summarize({ text: 'string', bullets: true }),
]);
return {
  search: { results: search.results },
  summarize: { summary: summarize.summary },
};
```
