---
'@ai-sdk/harness-codex': patch
---

Honor caller-provided `codexConfig.model_reasoning_summary` instead of overwriting it with the adapter default. Callers can disable summaries with `'none'` or customize them with settings such as `'concise'`. Remove an ineffective reasoning-capability override; support is determined by native Codex model metadata.
