---
'ai': patch
'@ai-sdk/mcp': major
---

feat(ai): add OAuth for MCP clients + refactor to new package

This change replaces

```ts
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';
```

with

```ts
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
```
