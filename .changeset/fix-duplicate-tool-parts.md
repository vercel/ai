---
'ai': patch
---

Fixed duplicate tool parts when model calls an unavailable tool. The `tool-input-start` chunk creates a static part without a `dynamic` flag, but the subsequent `tool-input-error` chunk arrives with `dynamic: true`, causing a second `dynamic-tool` part to be created with the same `toolCallId`. This led to providers like Amazon Bedrock rejecting the message for duplicate tool use IDs.
