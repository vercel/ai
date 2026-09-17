---
"@ai-sdk/gateway": patch
---

fix(gateway): report the served model id in streaming `response-metadata` instead of the upstream provider's model name

The Gateway translates upstream provider responses, and the `response-metadata` frames it emits named the upstream provider's own model (e.g. Google's `gemini-3-flash-preview`) rather than the gateway model that was requested and served, so `streamText`'s `step.response.modelId` reported a stale, wrong model while every other record (`x-model-id` header, routing metadata) named the served one. The gateway language model now rewrites the streamed `response-metadata.modelId` to the `x-model-id` response header when present (it also survives fallback routing), falling back to the requested model id.
