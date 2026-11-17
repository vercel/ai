---
'@ai-sdk/google': patch
---

fix(provider/google): redact MCP server credentials in telemetry

Google Interactions MCP server headers can contain connector credentials, which
were recorded in tool telemetry. `google.tools.mcpServer` now provides a
redacted telemetry view of its header values, and Interactions request bodies do
the same for provider error reporting, while the actual request keeps the
credentials.
