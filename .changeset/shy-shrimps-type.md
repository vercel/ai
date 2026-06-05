---
"@ai-sdk/provider": patch
"@ai-sdk/google": patch
"@ai-sdk/openai": patch
"@ai-sdk/react": patch
"@ai-sdk/xai": patch
"ai": patch
---

feat(provider): add experimental Realtime API support for voice conversations

Adds first-class support for realtime (speech-to-speech) APIs:

- `Experimental_RealtimeModelV4` spec in `@ai-sdk/provider` with normalized event types and factory
- OpenAI, Google, and xAI realtime provider implementations
- `openai.experimental_realtime()` / `google.experimental_realtime()` / `xai.experimental_realtime()` work in both server and browser
- `.getToken()` static method on each provider for server-side ephemeral token creation
- `experimental_getRealtimeToolDefinitions` helper for provider session tool definitions
- `experimental_useRealtime` hook in `@ai-sdk/react` returning `UIMessage[]` (aligned with `useChat`), with `onToolCall` and `addToolOutput` for client-driven tool execution
- `inputAudioTranscription` session config for showing transcribed user audio messages when supported by the provider
