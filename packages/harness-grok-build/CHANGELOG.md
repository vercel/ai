# @ai-sdk/harness-grok-build

## 1.0.10

### Patch Changes

- 62a9c2a: feat(harness): add support for structured output to `HarnessAgent` via `output` property
- Updated dependencies [62a9c2a]
- Updated dependencies [d25cae2]
  - @ai-sdk/harness-acp@1.0.11
  - @ai-sdk/harness@1.0.73

## 1.0.9

### Patch Changes

- Updated dependencies [8d05a55]
  - @ai-sdk/harness-acp@1.0.10

## 1.0.8

### Patch Changes

- 69bb613: feat(harness): support request transformations in network sandbox abstraction and use it to apply credential brokering when available
- a72aca4: fix(harness-grok-build): inject bridge `package.json` and `pnpm-lock.yaml` files at build time instead of reading them at runtime to fix runtime errors in certain environments
- Updated dependencies [69bb613]
- Updated dependencies [52bc889]
- Updated dependencies [4cd4989]
  - @ai-sdk/harness-acp@1.0.9
  - @ai-sdk/harness@1.0.72

## 1.0.7

### Patch Changes

- Updated dependencies [8d717b3]
  - @ai-sdk/harness@1.0.71
  - @ai-sdk/harness-acp@1.0.8

## 1.0.6

### Patch Changes

- @ai-sdk/harness@1.0.70
- @ai-sdk/harness-acp@1.0.7

## 1.0.5

### Patch Changes

- @ai-sdk/harness@1.0.69
- @ai-sdk/harness-acp@1.0.6

## 1.0.4

### Patch Changes

- @ai-sdk/harness@1.0.68
- @ai-sdk/harness-acp@1.0.5

## 1.0.3

### Patch Changes

- Updated dependencies [7fbfc6d]
  - @ai-sdk/provider-utils@5.0.27
  - @ai-sdk/harness@1.0.67
  - @ai-sdk/harness-acp@1.0.4

## 1.0.2

### Patch Changes

- 9ee30bf: fix(harness): pass instructions appended to system / developer prompt instead of using the workaround of first user prompt
- Updated dependencies [9ee30bf]
  - @ai-sdk/harness-acp@1.0.3
  - @ai-sdk/harness@1.0.66

## 1.0.1

### Patch Changes

- a03ff6c: feat(harness): add support for per-harness MCP servers
- fc3baaf: feat(harness): add optional `mintBridgeToken(sandboxId)` to harness settings to control the bridge token value
- Updated dependencies [401a4ba]
- Updated dependencies [a03ff6c]
- Updated dependencies [fc3baaf]
  - @ai-sdk/provider-utils@5.0.26
  - @ai-sdk/harness-acp@1.0.2
  - @ai-sdk/harness@1.0.65

## 1.0.0

### Major Changes

- bb54c38: feat(harness-grok-build): add Grok Build harness built on top of ACP adapter

### Patch Changes

- Updated dependencies [6f54e1d]
- Updated dependencies [15d0475]
- Updated dependencies [faaabb0]
- Updated dependencies [81cd026]
  - @ai-sdk/harness-acp@1.0.1
  - @ai-sdk/provider-utils@5.0.25
  - @ai-sdk/harness@1.0.64
