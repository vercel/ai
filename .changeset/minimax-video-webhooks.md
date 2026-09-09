---
'@ai-sdk/minimax': patch
---

Forward `webhookUrl` as `callback_url` in `doStart` for application-owned receivers. Document challenge verification and terminal-status handling requirements. `generateVideo({ webhook })` continues to fall back to SDK polling without invoking the webhook factory.
