---
'@ai-sdk/mcp': patch
---

Handle audio and embedded resource content types in MCP tool results

MCP tool results can contain `audio` content parts (per the MCP spec section 5.2.3) and `resource` content parts with embedded blob data. Previously, only `text` and `image` content types were handled in `mcpToModelOutput`, causing audio and resource blob data to be serialized as JSON text via the fallback path instead of being converted to proper file content parts.

This change:
- Converts `audio` content parts (type: "audio", data, mimeType) to file content with the correct mediaType
- Converts embedded `resource` content parts with blob data to file content
- Converts embedded `resource` content parts with text data to text content
- Adds `AudioContentSchema` to the `CallToolResultSchema` union to match the MCP specification
