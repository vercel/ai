---
'@ai-sdk/harness-codex': patch
---

Honor caller-provided `codexConfig.model_reasoning_summary` and `model_supports_reasoning_summaries` instead of overwriting them with adapter defaults. Callers can disable or customize summaries and explicitly configure reasoning-summary support for custom model IDs.
