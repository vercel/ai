# @ai-sdk/harness

## 1.0.0-canary.13

### Patch Changes

- ai@7.0.0-canary.176

## 1.0.0-canary.12

### Patch Changes

- Updated dependencies [6ec57f5]
  - ai@7.0.0-canary.175

## 1.0.0-canary.11

### Patch Changes

- be83911: fix(harness): reject bridge startup when the WebSocket port cannot be bound

## 1.0.0-canary.10

### Patch Changes

- ai@7.0.0-canary.174

## 1.0.0-canary.9

### Patch Changes

- ai@7.0.0-canary.173

## 1.0.0-canary.8

### Patch Changes

- aae0138: fix(harness): make listening for sandbox bridge readiness compatible with Bun

## 1.0.0-canary.7

### Patch Changes

- 3d87086: fix(harness): guard against invalid resuming a session vs continuing a turn
- 1ea15a3: fix(harness): fix various bugs with harness skills not being correctly processed by the harness adapters
- Updated dependencies [aeda373]
- Updated dependencies [25a64f8]
- Updated dependencies [375fdd7]
- Updated dependencies [f18b08f]
- Updated dependencies [b4507d5]
  - @ai-sdk/provider-utils@5.0.0-canary.48
  - ai@7.0.0-canary.172

## 1.0.0-canary.6

### Patch Changes

- Updated dependencies [89ad56f]
- Updated dependencies [f9a496f]
- Updated dependencies [3295831]
  - ai@7.0.0-canary.171

## 1.0.0-canary.5

### Patch Changes

- d77bed4: chore(harness): separate harness spec types (v1) from consumer-facing types
- Updated dependencies [bae5e2b]
- Updated dependencies [69d7128]
  - ai@7.0.0-canary.170
  - @ai-sdk/provider-utils@5.0.0-canary.47

## 1.0.0-canary.4

### Patch Changes

- 3d9a50c: feat(harness): implement harness adapters for Claude Code, Codex, Pi

## 1.0.0-canary.3

### Patch Changes

- 21d3d60: feat(harness): implement harness specification
- Updated dependencies [a5018ab]
- Updated dependencies [21d3d60]
- Updated dependencies [426dbbb]
- Updated dependencies [7fd3360]
  - ai@7.0.0-canary.169

## 1.0.0-canary.2

### Patch Changes

- 6c7a3e5: Start the `1.0.0` canary release line for the experimental harness and sandbox packages. They were unintentionally published as `0.0.0-canary.*` because they were scaffolded with a `0.0.0-canary.0` premajor version, which semver could not advance past on a major bump.

## 0.0.0-canary.1

### Major Changes

- 9d6dbe0: feat(harness): add sandbox specific expansion for harness abstraction, add `sandbox-just-bash` and `sandbox-vercel`
