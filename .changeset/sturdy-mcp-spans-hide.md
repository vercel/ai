---
'@ai-sdk/otel': patch
---

fix(otel): redact Google MCP server credentials in tool definitions

Plain `google.mcp_server` tool definitions do not carry a provider-owned
telemetry redaction annotation, for example when they are built by hand or come
from an older `@ai-sdk/google` version. Both OTel integrations now redact every
`google.mcp_server` header value in telemetry-only copies, so MCP connector
credentials no longer reach `ai.prompt.tools` or `gen_ai.tool.definitions`.
