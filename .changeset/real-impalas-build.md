---
"@ai-sdk/harness-grok-build": patch
---

fix(harness-grok-build): inject bridge `package.json` and `pnpm-lock.yaml` files at build time instead of reading them at runtime to fix runtime errors in certain environments
