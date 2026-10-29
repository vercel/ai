---
'@ai-sdk/sandbox-vercel': patch
---

fix(sandbox-vercel): reject network policy mutations when an existing Vercel Sandbox policy contains response rules instead of silently dropping request restrictions
