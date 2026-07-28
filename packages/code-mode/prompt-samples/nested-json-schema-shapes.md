Execute code-mode TypeScript in an isolated sandbox.

Put the full program in `js`; top-level `await`/`return` work. Return a JSON-serializable result.
Call host tools only as async `tools.name(input)`; await each or use `Promise.all` for independent calls.
Use exact names/types below. `JSON.parse`/`JSON.stringify` are available.
Fetch: `fetch` is not available.

Tools:

```ts
declare const tools: {
  report: (input: {
    items: { id: string; score?: number }[];
    metadata: Record<string, string>;
  }) => Promise<{ accepted: boolean; ids: string[] }>;
};
```

Tool call examples:

```ts
const result = await tools.report({
  items: [{ id: 'string', score: 1 }],
  metadata: {},
});
return { accepted: result.accepted };
```
