---
"@ai-sdk/elevenlabs": patch
---

feat(elevenlabs): add experimental Realtime API support (ElevenAgents)

Adds `elevenlabs.experimental_realtime()`, working in both server and browser,
on top of the core realtime spec:

- `elevenlabs.experimental_realtime()` connects to an ElevenLabs agent (the `modelId` is the agent id)
- `.getToken()` static method for server-side ephemeral token creation
- Client-driven tool execution via the agent's `client_tool_call` protocol (`onToolCall` / `addToolOutput`)

Note: ElevenLabs agents must have their tools registered on the agent. Passing
`sessionConfig.tools` to `elevenlabs.experimental_realtime.getToken()` does not
register tools dynamically and emits a warning.
