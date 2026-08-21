---
'@ai-sdk/gateway': patch
---

feat(gateway): implement `handleWebhookOption` on the video model so `generateVideo({ webhook })` registers the factory URL as the gateway's `callbackUrl` and awaits delivery instead of falling back to polling
