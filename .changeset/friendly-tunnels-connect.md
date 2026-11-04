---
'@ai-sdk/openai': patch
---

Add Secure MCP tunnel support to the OpenAI MCP tool via `tunnelId`. Tunnel targets cannot be combined with `serverUrl` or `connectorId`; existing URL and connector configurations remain compatible.
