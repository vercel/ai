---
"@ai-sdk/google-vertex": patch
---

feat(provider/google-vertex): allow overriding Vertex Anthropic auth token generation

Adds an optional `generateAuthToken` setting to `createVertexAnthropic` (both
edge and node variants). When provided, the SDK calls this function instead
of performing the default OAuth exchange. Useful for tests, custom auth
providers, and proxy/relay scenarios where the caller supplies the auth
token directly. Default behavior is unchanged.
