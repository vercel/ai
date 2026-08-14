---
'@ai-sdk/moonshotai': patch
---

feat(provider/moonshotai): normalize tool schemas for Moonshot's MFJS validator. Tuple `items` arrays become `prefixItems`, `type` next to `anyOf` moves into the branches, and non-`object` root schemas fail with a clear client-side error instead of Moonshot's opaque 400. Everything else passes through unchanged; the original schema is still used for AI SDK result validation.
