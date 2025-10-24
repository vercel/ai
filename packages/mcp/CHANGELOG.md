# @ai-sdk/mcp

## 1.0.0-beta.0

### Major Changes

- eca63f3: feat(ai): add OAuth for MCP clients + refactor to new package

  This change replaces

  ```ts
  import { experimental_createMCPClient } from 'ai';
  import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';
  ```

  with

  ```ts
  import { experimental_createMCPClient } from '@ai-sdk/mcp';
  import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
  ```
