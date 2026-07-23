---
'@ai-sdk/provider-utils': patch
'ai': patch
---

Remove test server dependencies from the shared test utilities so `ai/test` can load without `msw` or `vitest`.
