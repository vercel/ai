---
'@ai-sdk/openai-compatible': patch
'@ai-sdk/cerebras': patch
---

fix(cerebras): send historical assistant reasoning as `reasoning` (not `reasoning_content`)

Cerebras rejects `reasoning_content` on input assistant messages, so multi-step runs with reasoning models (e.g. `zai-glm-4.7`, `qwen-3-235b-a22b-thinking-2507`) failed after step 1 with `400 wrong_api_format: property 'messages.N.assistant.reasoning_content' is unsupported`.

The Cerebras provider now serializes reasoning back as the `reasoning` field per the Cerebras chat-completions API. The underlying `@ai-sdk/openai-compatible` chat model gains an `assistantReasoningSerialization` option (`'reasoning_content'` (default) | `'reasoning'` | `'none'`) so other providers can opt in to the same behavior.
