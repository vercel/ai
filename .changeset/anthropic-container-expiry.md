---
'@ai-sdk/anthropic': patch
---

Add `extractAnthropicContainerReuseDetails` function to retrieve container ID and expiry time from previous steps. This allows users to check container expiration before deciding to reuse it in programmatic tool calling workflows.
