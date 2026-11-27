---
'@ai-sdk/google': patch
'@ai-sdk/google-vertex': patch
---

feat(google): support Gemini Tool Retrieval on the Interactions API

Adds `googleTools.toolSearch()` (`tool_search`) and
`providerOptions: { google: { deferLoading, shortDescription } }` on function
tools, so Gemini loads deferred tool schemas on demand instead of carrying the
whole tool library in context. `googleTools.mcpServer({ deferLoading: true })`
defers every tool a remote MCP server exposes. The retrieval round trip is
surfaced as a provider-executed tool call and result and replayed with its
signatures on the next turn.
