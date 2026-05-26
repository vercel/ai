---
"@ai-sdk/elevenlabs": patch
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
- OpenAI, Google, xAI, and ElevenLabs (ElevenAgents) realtime provider implementations
- `openai.realtime()` / `google.realtime()` / `xai.realtime()` / `elevenlabs.realtime()` work in both server and browser
- `.getToken()` static method on each provider for server-side ephemeral token creation
- `getRealtimeToolDefinitions` helper for provider session tool definitions
- `useRealtime` hook in `@ai-sdk/react` returning `UIMessage[]` (aligned with `useChat`), with `onToolCall` and `addToolOutput` for client-driven tool execution
