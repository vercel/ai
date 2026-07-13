---
'@ai-sdk/fireworks': patch
---

fix (provider/fireworks): enable structured outputs for chat models

The Fireworks chat model was constructed without `supportsStructuredOutputs`, so JSON response format schemas (e.g. from `Output.object`) were silently dropped and requests were downgraded to schemaless `json_object` mode with only a warning. The Fireworks API supports OpenAI-style `json_schema` constrained decoding, so the provider now passes `supportsStructuredOutputs: true` (matching `@ai-sdk/cerebras`) and schemas are sent as `response_format: { type: 'json_schema', ... }`.
