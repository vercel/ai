---
'@ai-sdk/xai': patch
---

feat(xai): support `'none'` and `'medium'` reasoning effort for `grok-4.3`,
and curate the model ID autocomplete list

`grok-4.3` accepts `reasoning_effort` of `"none" | "low" | "medium" | "high"`,
where `"none"` disables reasoning entirely (no thinking tokens) and `"medium"`
provides more thinking for less-latency-sensitive applications.

- Adds `'none'` to the allowed values for `providerOptions.xai.reasoningEffort`
  on both the chat (`xai()`) and responses (`xai.responses()`) language models.
- Adds `'medium'` to the chat model's `reasoningEffort` enum (the responses
  model already supported it).
- Top-level `reasoning: 'medium'` now maps to `reasoning_effort: 'medium'` for
  the chat model (previously it was coerced to `'low'` because `'medium'` was
  not a valid value).

In addition, the `XaiChatModelId` and `XaiResponsesModelId` autocomplete unions
have been trimmed to xAI's current model lineup
([docs](https://docs.x.ai/docs/models)):

- `grok-4.20-non-reasoning`
- `grok-4.20-reasoning`
- `grok-4.3`
- `grok-latest`

Older entries (`grok-3*`, `grok-4`, `grok-4-0709`, `grok-4-latest`,
`grok-4-1-fast-*`, `grok-4-fast-*`, `grok-code-fast-1`, and
`grok-4.20-multi-agent-0309`) have been removed from the autocomplete list.
This is **not** a runtime change — the model ID type is still open
(`(string & {})`), so passing any model ID that the xAI API accepts continues
to work; only IDE autocomplete is affected.

```ts
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

await generateText({
  model: xai('grok-4.3'),
  prompt: 'Hi',
  providerOptions: {
    xai: { reasoningEffort: 'none' },
  },
});
```
