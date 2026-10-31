---
'@ai-sdk/cohere': patch
---

Normalize streamed null tool arguments to an empty object so tools without parameters can execute, matching non-streaming calls.
