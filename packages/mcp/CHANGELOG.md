# @ai-sdk/mcp

## 1.0.0-beta.3

### Patch Changes

- 5939b92: feat(mcp): adding resources support to MCP client

## 1.0.0-beta.2

### Patch Changes

- Updated dependencies [58920e0]
  - @ai-sdk/provider-utils@4.0.0-beta.22

## 1.0.0-beta.1

### Patch Changes

- Updated dependencies [293a6b7]
  - @ai-sdk/provider-utils@4.0.0-beta.21

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
