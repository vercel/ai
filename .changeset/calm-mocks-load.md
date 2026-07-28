---
'@ai-sdk/provider-utils': patch
'ai': patch
---

Stop re-exporting `createTestServer` and `TestResponseController` from `@ai-sdk/provider-utils/test` so `ai/test` can load without `msw` or `vitest`. Import these APIs from `@ai-sdk/test-server/with-vitest` instead.
