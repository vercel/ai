---
'@ai-sdk/anthropic': patch
---

Fix provider file references in tool result content being dropped. Convert referenced files to image or document blocks and request the Anthropic Files API beta.
