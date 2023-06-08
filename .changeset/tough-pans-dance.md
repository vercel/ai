---
'ai-connector': patch
---

- Splits the `EventSource` parser into a reusable helper
- Uses a `TransformStream` for this, so the stream respects back-pressure
- Splits the "forking" stream for callbacks into a reusable helper
- Changes the signature for `customParser` to avoid Stringify -> Encode -> Decode -> Parse round trip
- Uses ?.() optional call syntax for callbacks
- Uses string.includes to perform newline checking
- Handles the `null` `res.body` case
- Fixes Anthropic's streaming responses
  - Anthropic returns cumulative responses, not deltas like OpenAI
  - https://github.com/hwchase17/langchain/blob/3af36943/langchain/llms/anthropic.py#L190-L193
