---
'@ai-sdk/harness-pi': patch
---

fix(harness-pi): stream the full MCP tool result instead of Pi's truncated text

Pi's native MCP extension cuts text results over 20 KB for the model, keeping the start and end with a truncation warning, and keeps the full `CallToolResult` in `structuredContent`. The harness parsed the cut text, so a large JSON result reached the client as an unparseable string. The streamed `tool-result` now comes from the full result when it has text content and falls back to the model-facing text otherwise. The model still sees Pi's truncated text.
