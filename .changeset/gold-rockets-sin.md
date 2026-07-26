---
"@ai-sdk/openai-compatible": patch
---

Fixed an issue in streaming chat completions where tool-call deltas with an empty function.name string were forwarded prematurely, causing tool-calls to be emitted with missing names and incomplete arguments. The provider now buffers these deltas until a non-empty name is received.
