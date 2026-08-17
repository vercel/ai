# @ai-sdk/harness-acp

## 1.0.11

### Patch Changes

- 62a9c2a: feat(harness): add support for structured output to `HarnessAgent` via `output` property
- Updated dependencies [62a9c2a]
- Updated dependencies [d25cae2]
  - @ai-sdk/harness@1.0.73

## 1.0.10

### Patch Changes

- 8d05a55: fix(harness-acp): fix incorrect `finish-step` emission timing

## 1.0.9

### Patch Changes

- 69bb613: feat(harness): support request transformations in network sandbox abstraction and use it to apply credential brokering when available
- 52bc889: feat(harness): add `getPortEndpoint()` as more comprehensive replacement to `getPortUrl()` (now deprecated) in `HarnessV1NetworkSandboxSession`
- 4cd4989: chore(harness): decouple bridge based harness bootstrap recipe logic from dynamic params and enforce unique harnesses in `prepareSandboxForHarness()` helper
- Updated dependencies [69bb613]
- Updated dependencies [52bc889]
- Updated dependencies [4cd4989]
  - @ai-sdk/harness@1.0.72

## 1.0.8

### Patch Changes

- Updated dependencies [8d717b3]
  - @ai-sdk/harness@1.0.71

## 1.0.7

### Patch Changes

- @ai-sdk/harness@1.0.70

## 1.0.6

### Patch Changes

- @ai-sdk/harness@1.0.69

## 1.0.5

### Patch Changes

- @ai-sdk/harness@1.0.68

## 1.0.4

### Patch Changes

- Updated dependencies [7fbfc6d]
  - @ai-sdk/provider-utils@5.0.27
  - @ai-sdk/harness@1.0.67

## 1.0.3

### Patch Changes

- 9ee30bf: fix(harness): pass instructions appended to system / developer prompt instead of using the workaround of first user prompt
- Updated dependencies [9ee30bf]
  - @ai-sdk/harness@1.0.66

## 1.0.2

### Patch Changes

- a03ff6c: feat(harness): add support for per-harness MCP servers
- fc3baaf: feat(harness): add optional `mintBridgeToken(sandboxId)` to harness settings to control the bridge token value
- Updated dependencies [401a4ba]
- Updated dependencies [a03ff6c]
  - @ai-sdk/provider-utils@5.0.26
  - @ai-sdk/harness@1.0.65

## 1.0.1

### Patch Changes

- 6f54e1d: feat(harness-acp): further simplify public `createACP()` API
- 15d0475: fix(harness-acp): defer auth resolution until session start to correctly recognize available credentials
- faaabb0: fix(harness-acp): improve bridge error handling to prevent infinite hang on certain errors
- Updated dependencies [81cd026]
  - @ai-sdk/provider-utils@5.0.25
  - @ai-sdk/harness@1.0.64

## 1.0.0

### Major Changes

- ff0f708: feat(harness-acp): introduce ACP harness adapter as a meta adapter to connect to any ACP compatible harness

### Patch Changes

- Updated dependencies [1937bef]
  - @ai-sdk/provider-utils@5.0.24
  - @ai-sdk/harness@1.0.63
