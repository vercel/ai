---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'ai': patch
---

Add experimental OpenAI Live provider support for headless server WebSocket sessions, with continuous conversation events, validated startup and update options, delegated backend tools, and cumulative voice usage. Extend the realtime v4 specification with optional server WebSocket configuration, connection-local parsing, and session lifecycle capabilities while preserving existing token-based providers.
