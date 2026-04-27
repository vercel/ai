---
"ai": patch
---

fix(ai): remove dead-code fallback with stale token field names in streamObject

The `flush` handler in `stream-object.ts` contained an unreachable fallback object
`usage ?? { promptTokens, completionTokens, totalTokens }`. The `usage` variable is
always initialized to `createNullLanguageModelUsage()` before the stream starts, so
the nullish-coalescing branch could never execute. The fallback also used the old
`promptTokens`/`completionTokens` field names that no longer exist on `LanguageModelUsage`
(which uses `inputTokens`/`outputTokens` per the AI SDK glossary). The dead code is
removed and `finalUsage` is now assigned directly from `usage`.
