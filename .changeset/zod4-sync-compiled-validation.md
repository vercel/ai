---
'@ai-sdk/provider-utils': patch
'@ai-sdk/openai': patch
---

Add an experimental, default-off OpenAI chat SSE parsing option using an
explicitly supplied Zod compiler. Only the SDK-owned chat response chunk schema
is compiled, and its parser accepts JSON text rather than arbitrary values.
Generic Zod validation continues to use `safeParseAsync` on all supported peers.
The opt-in honors `jitless`, caches compilation per provider instance, and uses
the original async validator if compilation fails. Invalid compiled inputs use
Zod's original-parser fallback. Existing applications do not need a newer Zod version.
