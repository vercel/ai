---
'@ai-sdk/google': patch
---

fix(google): mark denied / errored tool outputs as failures in `functionResponse`. Previously `execution-denied`, `error-text`, and `error-json` outputs were flattened into the same `response: { name, content }` shape as successful tool results, so Gemini read denials and errors as successes (and confidently fabricated follow-up details). They now emit a discriminated shape with an `error` key (`'execution-denied'` or `'tool-error'`) so the model can distinguish failure from success.
