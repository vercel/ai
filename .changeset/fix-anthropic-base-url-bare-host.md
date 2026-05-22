---
"@ai-sdk/anthropic": patch
---

Treat `ANTHROPIC_BASE_URL=https://api.anthropic.com` (the bare canonical host used by the official Anthropic SDK and tools such as Claude Code) as the `/v1` endpoint, so embedded apps no longer 404 when the env var is injected from the outside. Custom proxy URLs and explicit `/v1` paths are left unchanged.
