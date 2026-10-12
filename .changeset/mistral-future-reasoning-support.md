---
'@ai-sdk/mistral': patch
---

Forward reasoning configuration for unknown model IDs instead of silently stripping it. Known models without reasoning-effort support retain their previous handling.
