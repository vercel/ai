---
"@ai-sdk/mcp": patch
---

fix(mcp): prevent unhandled promise rejection process crash when HTTP or SSE transport connection is closed mid-stream by catching reader.closed
