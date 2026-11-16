---
'ai': patch
---

fix(ai): redact Google MCP server credentials in telemetry tool definitions

`google.mcp_server` provider tool definitions accept headers such as
`Authorization` for the Interactions MCP connector. Telemetry redaction only
recognized OpenAI tool ids, so those reusable credentials were recorded in the
`ai.prompt.tools` span attribute of `generateText` and `streamText`. Telemetry
previews now redact every `google.mcp_server` header value. The tool arguments
sent to the provider and used by the application are unchanged.
