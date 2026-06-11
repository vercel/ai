---
'@ai-sdk/neon': major
---

feat (provider/neon): add Neon AI Gateway provider

Adds the `@ai-sdk/neon` provider for the branch-scoped [Neon AI Gateway](https://neon.com). It exposes the gateway's unified, OpenAI-compatible MLflow endpoint, giving access to the full `databricks-*` foundation model catalog (Anthropic, OpenAI, Google, Meta, and more) through a single language model. Configure it with `NEON_AI_GATEWAY_BASE_URL` (the branch host) and `NEON_AI_GATEWAY_TOKEN` (the platform token), or pass `baseURL`/`apiKey` to `createNeon`.

Supports `generateText`, `streamText`, tool calling (single and multi-step), `generateObject`, and image (vision) input across the catalog. Structured outputs use `response_format: json_schema`, and the request transform strips the JSON Schema `$schema` marker so tool calling and structured outputs work on backends (e.g. Gemini) that reject unknown schema fields.

Models are routed to the best available endpoint: Anthropic models use the native Messages API (streaming structured output, native reasoning), OpenAI models use the native Responses API (required for Codex; native reasoning and the image-generation tool), and everything else (Gemini, Llama, Qwen, ...) uses the unified MLflow endpoint. Gemini stays on MLflow because its native gateway endpoint does not support streaming. Routing is transparent — the same `neon('databricks-...')` call, base URL, and token are used throughout.

For MLflow-routed models, the provider detects the model family and drops parameters a backend is known to reject (e.g. penalties/`seed` for Llama, `reasoningEffort` for Gemini), surfacing an AI SDK warning instead of failing the request. Unknown models are passed through unchanged.
