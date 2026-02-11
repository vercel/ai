---
'@ai-sdk/xai': patch
---

Add support for `response.function_call_arguments.delta` and `response.function_call_arguments.done` streaming events in the xAI Responses API provider.

Previously, xAI Grok models using function tools via the Responses API would fail with `AI_TypeValidationError` because these standard Responses API events were missing from the Zod schema and stream handler. Function call arguments are now streamed incrementally via `tool-input-delta` events, and the final `tool-call` is emitted only after all arguments are received.

Includes unit test for function call argument streaming and an example at `examples/ai-core/src/stream-text/xai-responses-function-call.ts`.
