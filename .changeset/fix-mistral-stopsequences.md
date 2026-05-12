---
"@ai-sdk/mistral": patch
---

fix(mistral): forward `stopSequences` as Mistral's native `stop` parameter

`@ai-sdk/mistral` previously accepted `stopSequences` on `generateText`/`streamText` but silently dropped it with an `{ type: 'unsupported', feature: 'stopSequences' }` warning. The Mistral REST API supports stop sequences natively via the `stop` field (`string | array<string>`). The adapter now translates `stopSequences` → `stop` in the outgoing request, matching the pattern used by sibling providers (openai, openai-compatible, groq, deepseek, alibaba).
