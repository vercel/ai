---
'@ai-sdk/neon': major
---

feat (provider/neon): add Neon AI Gateway provider

Adds the `@ai-sdk/neon` provider for the branch-scoped [Neon AI Gateway](https://neon.com). It exposes the gateway's unified, OpenAI-compatible MLflow endpoint, giving access to the full `databricks-*` foundation model catalog (Anthropic, OpenAI, Google, Meta, and more) through a single language model. Configure it with `NEON_AI_GATEWAY_BASE_URL` (the branch host) and `NEON_AI_GATEWAY_TOKEN` (the platform token), or pass `baseURL`/`apiKey` to `createNeon`.
