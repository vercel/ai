---
'@ai-sdk/cerebras': patch
'@ai-sdk/openai-compatible': patch
---

fix(@ai-sdk/cerebras): use 'reasoning' field name for assistant reasoning in multi-step runs

Cerebras expects `reasoning` instead of `reasoning_content` in assistant message history.
The openai-compatible provider now supports a configurable `reasoningFieldName` option,
and the Cerebras provider sets it to `'reasoning'` to match the Cerebras API schema.

Fixes vercel/ai#15042.
