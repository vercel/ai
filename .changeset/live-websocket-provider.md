---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'ai': patch
---

Add experimental OpenAI Live provider support through the unified `openai.experimental_realtime` factory for headless server WebSocket sessions, with continuous conversation events, validated startup and update options, delegated backend tools, and cumulative voice usage. Route exact known Live model IDs to Live, allow an OpenAI-specific `api` override for early-access models, and preserve legacy Realtime defaults for unknown IDs. Token minting follows the same selection rules and rejects Live before requesting unsupported short-lived credentials. Extend the realtime v4 specification with optional server WebSocket configuration, connection-local parsing, and session lifecycle capabilities while preserving existing token-based providers.
