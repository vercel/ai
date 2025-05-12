---
'@ai-sdk/amazon-bedrock': major
'@ai-sdk/provider': patch
'ai': patch
---

## `embedMany` now makes parallel requests, with a configurable `maxParallelCalls` option

Before all requests in `embedMany` were made sequentially. Now, they are made in parallel, with a configurable `maxParallelCalls` option.

To restrict the number of parallel requests, you can do:

```ts
  const { embeddings, usage } = await embedMany({
    // or any other number
    maxParallelCalls: 2,
    model: openai.embedding('text-embedding-3-small'),
    values: [
      'sunny day at the beach',
      'rainy afternoon in the city',
      'snowy night in the mountains',
    ],
  });
```

Commit: https://github.com/vercel/ai/pull/6108
