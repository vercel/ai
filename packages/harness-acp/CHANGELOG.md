# @ai-sdk/harness-acp

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
