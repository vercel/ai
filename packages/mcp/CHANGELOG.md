# @ai-sdk/mcp

## 0.0.8

### Patch Changes

- Updated dependencies [056c471]
  - @ai-sdk/provider-utils@3.0.17

## 0.0.7

### Patch Changes

- 51aa5de: backport: test server
- Updated dependencies [51aa5de]
  - @ai-sdk/provider-utils@3.0.16

## 0.0.6

### Patch Changes

- 1cba565: feat(packages/mcp): add support for MCP server prompts exposed

## 0.0.5

### Patch Changes

- Updated dependencies [f2da310]
  - @ai-sdk/provider-utils@3.0.15

## 0.0.4

### Patch Changes

- Updated dependencies [949718b]
  - @ai-sdk/provider-utils@3.0.14

## 0.0.3

### Patch Changes

- f796ddc: feat(mcp): adding resources support to MCP client

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
