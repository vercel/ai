---
"@ai-sdk/sandbox-vercel": patch
"@ai-sdk/harness": patch
---

feat(harness): allow passing caller-owned `sandboxSession` to `HarnessAgent.createSession()` and in that case allow omitting the then unnecessary `sandbox` arg from `HarnessAgent` constructor
