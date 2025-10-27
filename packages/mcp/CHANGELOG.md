# @ai-sdk/mcp

## 0.0.2

### Patch Changes

- Updated dependencies [1e05490]
  - @ai-sdk/provider-utils@3.0.13

## 0.0.1

### Patch Changes

- 22ab538: feat(ai): add OAuth for MCP clients + refactor to new package

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
