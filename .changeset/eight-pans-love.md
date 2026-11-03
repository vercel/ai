---
"@ai-sdk/mistral": patch
---

feat(mistral): add realtime voice agent support

Keep `livekit-client` as an optional peer dependency required only for browser
voice connections, so server-side consumers do not install it automatically.
