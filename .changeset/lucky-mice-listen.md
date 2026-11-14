---
'@ai-sdk/mcp': patch
---

fix (mcp): fire `onclose` when the SSE stream ends unexpectedly

When the server ended the long-lived SSE stream on its own — a restart, a deploy, an idle timeout — the transport set `connected = false` and reported the error, but never called `onclose`. That callback is what the MCP client uses to reject the requests that are still in flight, so a `tools/call`, `resources/read` or `prompts/get` that was already sent never settled: the promise hung rather than rejecting. The stdio transport already fires `onclose` when its child process exits.
