---
'@ai-sdk/bytedance': patch
---

Forward `webhookUrl` as `callback_url` in `doStart`, taking precedence over raw provider callback URLs. Callers provide a progress-aware receiver; `generateVideo({ webhook })` continues to fall back to polling.

Treat expired video generation tasks as terminal errors, preserving the provider's diagnostic details.
