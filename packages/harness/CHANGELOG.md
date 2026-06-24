# @ai-sdk/harness

## 1.0.0-beta.25

### Patch Changes

- ai@7.0.0-beta.186

## 1.0.0-beta.24

### Patch Changes

- Updated dependencies [75763b0]
  - ai@7.0.0-beta.185

## 1.0.0-beta.23

### Patch Changes

- 57e0a59: fix(harness): ensure finish chunk's total usage is actually coming from total usage

## 1.0.0-beta.22

### Patch Changes

- Updated dependencies [0416e3e]
  - @ai-sdk/provider@4.0.0-beta.20
  - ai@7.0.0-beta.184
  - @ai-sdk/provider-utils@5.0.0-beta.50

## 1.0.0-beta.21

### Patch Changes

- ai@7.0.0-beta.183

## 1.0.0-beta.20

### Patch Changes

- e5d4a24: chore(harness): update ws package
- Updated dependencies [cc6ab90]
  - ai@7.0.0-beta.182

## 1.0.0-beta.19

### Patch Changes

- Updated dependencies [6a2caf9]
  - ai@7.0.0-beta.181

## 1.0.0-beta.18

### Patch Changes

- Updated dependencies [81a284b]
  - ai@7.0.0-beta.180

## 1.0.0-beta.17

### Patch Changes

- 534dac6: fix(harness): fix incomplete OIDC token support for AI Gateway auth in harness adapters

## 1.0.0-beta.16

### Patch Changes

- ai@7.0.0-beta.179

## 1.0.0-beta.15

### Patch Changes

- Updated dependencies [b097c52]
  - ai@7.0.0-beta.178

## 1.0.0-beta.14

### Patch Changes

- b8396f0: trigger initial beta release
- Updated dependencies [b8396f0]
  - @ai-sdk/provider-utils@5.0.0-beta.49
  - @ai-sdk/provider@4.0.0-beta.19
  - ai@7.0.0-beta.177

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
