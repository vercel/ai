---
'@ai-sdk/xai': patch
---

Add support for `response.function_call_arguments.delta` and `response.function_call_arguments.done` streaming events in the xAI Responses API provider. Previously, xAI Grok models using function tools would fail with `AI_TypeValidationError` because these standard Responses API events were missing from the Zod schema and stream handler.
