---
"@ai-sdk/provider": patch
"@ai-sdk/openai": patch
"@ai-sdk/google": patch
"@ai-sdk/xai": patch
"@ai-sdk/react": patch
"ai": patch
---

feat: add experimental Realtime API support for voice conversations

Adds first-class support for realtime (speech-to-speech) APIs:

- `Experimental_RealtimeModelV4` spec in `@ai-sdk/provider` with normalized event types
- OpenAI, Google, and xAI realtime provider implementations
- `openai.realtime()` / `google.realtime()` / `xai.realtime()` work in both server and browser
- `.getToken()` static method on each provider for server-side ephemeral token creation
- `useRealtime` hook in `@ai-sdk/react` returning `UIMessage[]` (aligned with `useChat`)
- `addToolOutput` for client-side tool result submission
- `onToolCall` callback for auto-executed client-side tools
- Framework-agnostic helper types: `RealtimeSetupResponse`, `RealtimeToolsExecuteRequestBody`
