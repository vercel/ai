# @ai-sdk/mcp

## 1.0.1

### Patch Changes

- Updated dependencies [29264a3]
  - @ai-sdk/provider-utils@4.0.1

## 1.0.0

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

### Patch Changes

- 90ede04: feat(mcp): make MCPClient stable
- 6f1577e: fix(mcp): pass json header for refreshAuth
- 17c04d4: feat(mcp): expose `_meta` field from MCP tool definitions
- 1cff766: feat(packages/mcp): add support for MCP server prompts exposed
- 3ed5519: chore: rename ToolCallOptions to ToolExecutionOptions
- ba2ca2d: feat(mcp): add the possibility to define client version in mcp client definition
- f702df2: feat(mcp): add client elicitation support
- 5939b92: feat(mcp): adding resources support to MCP client
- Updated dependencies
  - @ai-sdk/provider@3.0.0
  - @ai-sdk/provider-utils@4.0.0

## 1.0.0-beta.46

### Patch Changes

- Updated dependencies [475189e]
  - @ai-sdk/provider@3.0.0-beta.32
  - @ai-sdk/provider-utils@4.0.0-beta.59

## 1.0.0-beta.45

### Patch Changes

- Updated dependencies [2625a04]
  - @ai-sdk/provider@3.0.0-beta.31
  - @ai-sdk/provider-utils@4.0.0-beta.58

## 1.0.0-beta.44

### Patch Changes

- Updated dependencies [cbf52cd]
  - @ai-sdk/provider@3.0.0-beta.30
  - @ai-sdk/provider-utils@4.0.0-beta.57

## 1.0.0-beta.43

### Patch Changes

- Updated dependencies [9549c9e]
  - @ai-sdk/provider@3.0.0-beta.29
  - @ai-sdk/provider-utils@4.0.0-beta.56

## 1.0.0-beta.42

### Patch Changes

- Updated dependencies [50b70d6]
  - @ai-sdk/provider-utils@4.0.0-beta.55

## 1.0.0-beta.41

### Patch Changes

- Updated dependencies [9061dc0]
  - @ai-sdk/provider-utils@4.0.0-beta.54
  - @ai-sdk/provider@3.0.0-beta.28

## 1.0.0-beta.40

### Patch Changes

- 90ede04: feat(mcp): make MCPClient stable

## 1.0.0-beta.39

### Patch Changes

- Updated dependencies [366f50b]
  - @ai-sdk/provider@3.0.0-beta.27
  - @ai-sdk/provider-utils@4.0.0-beta.53

## 1.0.0-beta.38

### Patch Changes

- Updated dependencies [763d04a]
  - @ai-sdk/provider-utils@4.0.0-beta.52

## 1.0.0-beta.37

### Patch Changes

- Updated dependencies [c1efac4]
  - @ai-sdk/provider-utils@4.0.0-beta.51

## 1.0.0-beta.36

### Patch Changes

- Updated dependencies [32223c8]
  - @ai-sdk/provider-utils@4.0.0-beta.50

## 1.0.0-beta.35

### Patch Changes

- Updated dependencies [83e5744]
  - @ai-sdk/provider-utils@4.0.0-beta.49

## 1.0.0-beta.34

### Patch Changes

- Updated dependencies [960ec8f]
  - @ai-sdk/provider-utils@4.0.0-beta.48

## 1.0.0-beta.33

### Patch Changes

- Updated dependencies [e9e157f]
  - @ai-sdk/provider-utils@4.0.0-beta.47

## 1.0.0-beta.32

### Patch Changes

- Updated dependencies [81e29ab]
  - @ai-sdk/provider-utils@4.0.0-beta.46

## 1.0.0-beta.31

### Patch Changes

- Updated dependencies [3bd2689]
  - @ai-sdk/provider@3.0.0-beta.26
  - @ai-sdk/provider-utils@4.0.0-beta.45

## 1.0.0-beta.30

### Patch Changes

- 6f1577e: fix(mcp): pass json header for refreshAuth

## 1.0.0-beta.29

### Patch Changes

- Updated dependencies [53f3368]
  - @ai-sdk/provider@3.0.0-beta.25
  - @ai-sdk/provider-utils@4.0.0-beta.44

## 1.0.0-beta.28

### Patch Changes

- Updated dependencies [dce03c4]
  - @ai-sdk/provider-utils@4.0.0-beta.43
  - @ai-sdk/provider@3.0.0-beta.24

## 1.0.0-beta.27

### Patch Changes

- 3ed5519: chore: rename ToolCallOptions to ToolExecutionOptions
- Updated dependencies [3ed5519]
  - @ai-sdk/provider-utils@4.0.0-beta.42

## 1.0.0-beta.26

### Patch Changes

- 17c04d4: feat(mcp): expose `_meta` field from MCP tool definitions

## 1.0.0-beta.25

### Patch Changes

- Updated dependencies [1bd7d32]
  - @ai-sdk/provider-utils@4.0.0-beta.41
  - @ai-sdk/provider@3.0.0-beta.23

## 1.0.0-beta.24

### Patch Changes

- Updated dependencies [544d4e8]
  - @ai-sdk/provider-utils@4.0.0-beta.40
  - @ai-sdk/provider@3.0.0-beta.22

## 1.0.0-beta.23

### Patch Changes

- Updated dependencies [954c356]
  - @ai-sdk/provider-utils@4.0.0-beta.39
  - @ai-sdk/provider@3.0.0-beta.21

## 1.0.0-beta.22

### Patch Changes

- Updated dependencies [03849b0]
  - @ai-sdk/provider-utils@4.0.0-beta.38

## 1.0.0-beta.21

### Patch Changes

- Updated dependencies [457318b]
  - @ai-sdk/provider@3.0.0-beta.20
  - @ai-sdk/provider-utils@4.0.0-beta.37

## 1.0.0-beta.20

### Patch Changes

- Updated dependencies [8d9e8ad]
  - @ai-sdk/provider@3.0.0-beta.19
  - @ai-sdk/provider-utils@4.0.0-beta.36

## 1.0.0-beta.19

### Patch Changes

- Updated dependencies [10d819b]
  - @ai-sdk/provider@3.0.0-beta.18
  - @ai-sdk/provider-utils@4.0.0-beta.35

## 1.0.0-beta.18

### Patch Changes

- ba2ca2d: feat(mcp): add the possibility to define client version in mcp client definition

## 1.0.0-beta.17

### Patch Changes

- f702df2: feat(mcp): add client elicitation support

## 1.0.0-beta.16

### Patch Changes

- Updated dependencies [db913bd]
  - @ai-sdk/provider@3.0.0-beta.17
  - @ai-sdk/provider-utils@4.0.0-beta.34

## 1.0.0-beta.15

### Patch Changes

- Updated dependencies [b681d7d]
  - @ai-sdk/provider@3.0.0-beta.16
  - @ai-sdk/provider-utils@4.0.0-beta.33

## 1.0.0-beta.14

### Patch Changes

- Updated dependencies [32d8dbb]
  - @ai-sdk/provider-utils@4.0.0-beta.32

## 1.0.0-beta.13

### Patch Changes

- 1cff766: feat(packages/mcp): add support for MCP server prompts exposed

## 1.0.0-beta.12

### Patch Changes

- Updated dependencies [bb36798]
  - @ai-sdk/provider@3.0.0-beta.15
  - @ai-sdk/provider-utils@4.0.0-beta.31

## 1.0.0-beta.11

### Patch Changes

- Updated dependencies [4f16c37]
  - @ai-sdk/provider-utils@4.0.0-beta.30

## 1.0.0-beta.10

### Patch Changes

- Updated dependencies [af3780b]
  - @ai-sdk/provider@3.0.0-beta.14
  - @ai-sdk/provider-utils@4.0.0-beta.29

## 1.0.0-beta.9

### Patch Changes

- Updated dependencies [016b111]
  - @ai-sdk/provider-utils@4.0.0-beta.28

## 1.0.0-beta.8

### Patch Changes

- Updated dependencies [37c58a0]
  - @ai-sdk/provider@3.0.0-beta.13
  - @ai-sdk/provider-utils@4.0.0-beta.27

## 1.0.0-beta.7

### Patch Changes

- Updated dependencies [d1bdadb]
  - @ai-sdk/provider@3.0.0-beta.12
  - @ai-sdk/provider-utils@4.0.0-beta.26

## 1.0.0-beta.6

### Patch Changes

- Updated dependencies [4c44a5b]
  - @ai-sdk/provider@3.0.0-beta.11
  - @ai-sdk/provider-utils@4.0.0-beta.25

## 1.0.0-beta.5

### Patch Changes

- Updated dependencies [0c3b58b]
  - @ai-sdk/provider@3.0.0-beta.10
  - @ai-sdk/provider-utils@4.0.0-beta.24

## 1.0.0-beta.4

### Patch Changes

- Updated dependencies [a755db5]
  - @ai-sdk/provider@3.0.0-beta.9
  - @ai-sdk/provider-utils@4.0.0-beta.23

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
