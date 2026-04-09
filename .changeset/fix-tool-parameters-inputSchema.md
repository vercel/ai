---
'@ai-sdk/provider-utils': patch
'ai': patch
---

fix: support deprecated `parameters` property in tool() for backward compatibility

When using `tool({ parameters: z.object({...}) })` (the v5 API), the schema was silently dropped because `prepareTools` and `doParseToolCall` only read `inputSchema`. The `tool()` helper now normalizes `parameters` to `inputSchema`, and consumers also fall back to `parameters` defensively.

Fixes #13460
