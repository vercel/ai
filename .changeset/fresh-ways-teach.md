---
'@ai-sdk/anthropic': patch
---

fix streaming context_management field location - was incorrectly expected inside delta object but API returns it at message_delta root level
