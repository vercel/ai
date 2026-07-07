# @ai-sdk/mcp

## 0.0.23

### Patch Changes

- 01a2b53: Prevent streamable HTTP MCP background SSE disconnects from surfacing as unhandled promise rejections.

## 0.0.22

### Patch Changes

- Updated dependencies [b85c4fb]
  - @ai-sdk/provider-utils@3.0.28

## 0.0.21

### Patch Changes

- Updated dependencies [9169261]
  - @ai-sdk/provider-utils@3.0.27

## 0.0.20

### Patch Changes

- 1673f7b: fix (mcp): handle SSE messages without explicit event fields

## 0.0.19

### Patch Changes

- d872a7a: fix(mcp): lock first sse endpoint received via event
- f4cd468: fix(mcp): prevent prototype-named tools from bypassing the `schemas` allowlist

  When using `client.tools({ schemas })` to expose only an explicitly allowed
  subset of an MCP server's tools, the allowlist check used the `in` operator,
  which also matches inherited `Object.prototype` properties. A server-advertised
  tool named `constructor`, `toString`, `__proto__`, etc. would pass the check
  even though the developer never defined it in `schemas`, and was then exposed to
  the model and executable. The check now uses `Object.hasOwn`, so only
  explicitly defined tools are returned.

- Updated dependencies [9f67efe]
- Updated dependencies [eea9166]
  - @ai-sdk/provider-utils@3.0.26

## 0.0.18

### Patch Changes

- 783fa6c: chore: ensure consistent import handling and avoid import duplicates or cycles
- c327fb9: fix(mcp): prevent prototype pollution by using secureJsonParse
- Updated dependencies [783fa6c]
  - @ai-sdk/provider-utils@3.0.25
  - @ai-sdk/provider@2.0.3

## 0.0.17

### Patch Changes

- 0a00b9b: trigger release for all packages after provenance setup
- Updated dependencies [0a00b9b]
  - @ai-sdk/provider@2.0.2
  - @ai-sdk/provider-utils@3.0.24

## 0.0.16

### Patch Changes

- Updated dependencies [a27a978]
  - @ai-sdk/provider-utils@3.0.23

## 0.0.15

### Patch Changes

- Updated dependencies [6a2f01b]
- Updated dependencies [17d64e3]
  - @ai-sdk/provider-utils@3.0.22

## 0.0.14

### Patch Changes

- Updated dependencies [20565b8]
  - @ai-sdk/provider-utils@3.0.21

## 0.0.13

### Patch Changes

- 526fe8d: fix: trigger new release for `@ai-v5` dist-tag
- Updated dependencies [526fe8d]
  - @ai-sdk/provider@2.0.1
  - @ai-sdk/provider-utils@3.0.20

## 0.0.12

### Patch Changes

- Updated dependencies [ef6d784]
  - @ai-sdk/provider-utils@3.0.19

## 0.0.11

### Patch Changes

- Updated dependencies [d1dbe5d]
  - @ai-sdk/provider-utils@3.0.18

## 0.0.10

### Patch Changes

- 638de7b: feat(mcp): add the possibility to define client version in mcp client definition

## 0.0.9

### Patch Changes

- 89b59d7: feat(mcp): add client elicitation support

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
  import { experimental_createMCPClient } from "ai";
  import { Experimental_StdioMCPTransport } from "ai/mcp-stdio";
  ```

  with

  ```ts
  import { experimental_createMCPClient } from "@ai-sdk/mcp";
  import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
  ```
