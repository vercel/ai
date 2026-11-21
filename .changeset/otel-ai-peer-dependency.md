---
'@ai-sdk/otel': patch
---

fix(otel): move `ai` from `dependencies` to `peerDependencies` (upgrade `ai` to at least `7.0.179` alongside `@ai-sdk/otel` so the peer range resolves cleanly)
