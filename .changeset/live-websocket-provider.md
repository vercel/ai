---
'@ai-sdk/provider': patch
'@ai-sdk/openai': patch
'ai': patch
---

Add experimental OpenAI Live provider support through the unified `openai.experimental_realtime` factory for server WebSocket sessions with client delegation. Applications own their agents and tools, receive continuous audio/transcript events and delegation metadata, and return context through validated channels. Support immutable startup options, microphone mute controls, graceful session close, and cumulative voice usage. Responses delegation and Live session updates reject before sending.

Route known Live model IDs to Live, allow an OpenAI-specific `api` override for early-access models, and preserve legacy Realtime defaults for unknown IDs. Token minting follows the same selection rules and rejects Live before requesting unsupported credentials. Extend the realtime v4 specification with optional server WebSocket configuration, per-connection raw-event parsers, and model-wide startup/finalization capabilities. Runtime and UI integration are not included.
