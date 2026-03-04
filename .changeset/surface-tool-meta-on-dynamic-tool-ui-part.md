---
'ai': patch
---

feat(ai): surface tool `_meta` on `DynamicToolUIPart`

Added an optional `_meta` field to `DynamicToolUIPart` and threaded it through the UI message stream pipeline. MCP tools can declare metadata via `_meta` (e.g. `_meta.ui.resourceUri` for rendering tool-specific app UIs), and this metadata is now preserved end-to-end from the tool definition through to the frontend message parts.
