---
'@ai-sdk/gateway': patch
---

Add `xaiSearchParameters()` — a typed builder for xAI Live Search config on Grok models. Returns a `searchParameters` object (with `mode` defaulted to `'auto'`) to pass to `providerOptions.xai.searchParameters`. Use `maxSearchResults` to bound cost, plus typed `sources` for `web` / `x` / `news` / `rss` filters.

This is a config builder, not an AI SDK tool: xAI Live Search is provider-native and dispatched automatically by xAI. Gateway forwards `providerOptions.xai.*` end-to-end already, so this works without further gateway changes.

```ts
import { xaiSearchParameters } from '@ai-sdk/gateway';
import { generateText } from 'ai';

const result = await generateText({
  model: 'xai/grok-4-fast-reasoning',
  prompt: 'What happened in markets today?',
  providerOptions: {
    xai: {
      searchParameters: xaiSearchParameters({
        mode: 'on',
        maxSearchResults: 5,
        sources: [{ type: 'web', country: 'US' }],
      }),
    },
  },
});
```
