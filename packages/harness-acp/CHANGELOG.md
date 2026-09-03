# @ai-sdk/harness-acp

## 1.0.39

### Patch Changes

- 951c54d: feat(harness): support `askUserQuestions` tool including support for normalization across harness adapters
- Updated dependencies [951c54d]
  - @ai-sdk/harness@1.0.101

## 1.0.38

### Patch Changes

- 74d252a: fix(harness-acp): preserve terminal events replayed during ACP continuation startup
- 0c37bf0: fix(harness): avoid warning about lack of credential brokering support when `credentialForwarding` callback is used to replace all credentials with ephemeral fake secrets
- Updated dependencies [0c37bf0]
  - @ai-sdk/harness@1.0.100

## 1.0.37

### Patch Changes

- Updated dependencies [6bcc0f8]
  - @ai-sdk/provider-utils@5.0.36
  - @ai-sdk/harness@1.0.99

## 1.0.36

### Patch Changes

- Updated dependencies [5190b67]
  - @ai-sdk/provider-utils@5.0.35
  - @ai-sdk/harness@1.0.98

## 1.0.35

### Patch Changes

- @ai-sdk/harness@1.0.97

## 1.0.34

### Patch Changes

- c0c7fac: feat(harness): add reusable `createReadBridgeAsset()` helper function
- Updated dependencies [c0c7fac]
  - @ai-sdk/harness@1.0.96

## 1.0.33

### Patch Changes

- 371e954: feat(harness): add `createBridgeToken()` and `withBridgeToken()` helpers for bridge backed harness adapters
- 62f481f: fix(harness): fix bridge resolution to no longer look for an alternative path which could cause Turbopack errors
- Updated dependencies [371e954]
- Updated dependencies [87b4858]
  - @ai-sdk/harness@1.0.95

## 1.0.32

### Patch Changes

- 8961fde: feat(harness): allow changing `model` between turns via call options
- Updated dependencies [8961fde]
- Updated dependencies [eb59f2a]
  - @ai-sdk/harness@1.0.94
  - @ai-sdk/provider-utils@5.0.34

## 1.0.31

### Patch Changes

- 7608210: feat(harness): add `model` parameter to `HarnessAgent` instead of having each harness adapter support it on their own constructor functions
- f7bd978: chore(harness): update underlying adapter SDKs to their latest versions
- 14d4fc0: feat(harness): allow changing harness settings between turns via `prepareCall()` support on `HarnessAgent`
- Updated dependencies [cc9f6ce]
- Updated dependencies [7608210]
- Updated dependencies [6f8a2d7]
- Updated dependencies [14d4fc0]
- Updated dependencies [90192f1]
  - @ai-sdk/harness@1.0.93
  - @ai-sdk/provider-utils@5.0.33

## 1.0.30

### Patch Changes

- e0d7cfb: feat(harness): allow harness sessions to optionally authenticate from an isolated environment supplied through the `auth` option, and remove support for the formerly deprecated legacy auth options types
- Updated dependencies [e0d7cfb]
  - @ai-sdk/harness@1.0.92

## 1.0.29

### Patch Changes

- 20312d6: fix(harness-acp): place skills in their harnesses' natively supported directory instead of applying a manual workaround
  - @ai-sdk/harness@1.0.91

## 1.0.28

### Patch Changes

- 0e590d2: feat(harness): harden credential brokering to only apply with correct ephemeral secret
- Updated dependencies [3e125ba]
- Updated dependencies [0e590d2]
  - @ai-sdk/provider-utils@5.0.32
  - @ai-sdk/harness@1.0.90

## 1.0.27

### Patch Changes

- @ai-sdk/harness@1.0.89

## 1.0.26

### Patch Changes

- Updated dependencies [32349cc]
- Updated dependencies [a9782e1]
- Updated dependencies [35841f5]
- Updated dependencies [d2f3353]
  - @ai-sdk/harness@1.0.88
  - @ai-sdk/provider-utils@5.0.31

## 1.0.25

### Patch Changes

- 79186d1: Allow pinned OpenCode and Grok Build install scripts during pnpm 11 sandbox bootstrap.
- b6396ff: feat(harness-acp): support `title` and `toolUseKind` for ACP tools
- 8a15038: feat(harness): add `credentialForwarding` setting to bridge backed harness adapters for granular control
- Updated dependencies [8a15038]
  - @ai-sdk/harness@1.0.87
  - @ai-sdk/provider-utils@5.0.30

## 1.0.24

### Patch Changes

- @ai-sdk/harness@1.0.86

## 1.0.23

### Patch Changes

- 6352c2a: feat(harness-acp): support ACP harnesses that do not have an NPM package via new `install-command` source type
- Updated dependencies [b74971f]
- Updated dependencies [fa6af57]
  - @ai-sdk/provider-utils@5.0.29
  - @ai-sdk/harness@1.0.85

## 1.0.22

### Patch Changes

- @ai-sdk/harness@1.0.84

## 1.0.21

### Patch Changes

- @ai-sdk/harness@1.0.83

## 1.0.20

### Patch Changes

- @ai-sdk/harness@1.0.82

## 1.0.19

### Patch Changes

- Updated dependencies [7f50d28]
  - @ai-sdk/harness@1.0.81

## 1.0.18

### Patch Changes

- @ai-sdk/harness@1.0.80

## 1.0.17

### Patch Changes

- @ai-sdk/harness@1.0.79

## 1.0.16

### Patch Changes

- eace6fb: feat(harness): add experimental support for steering agent conversations mid-turn
- c0595b4: feat(harness): support passing a filesystem and process restricted sandbox session to `HarnessAgentSession`, using fallbacks in favor of the preferred network sandbox session methods
- Updated dependencies [eace6fb]
- Updated dependencies [c0595b4]
  - @ai-sdk/harness@1.0.78

## 1.0.15

### Patch Changes

- Updated dependencies [e6087c9]
  - @ai-sdk/provider-utils@5.0.28
  - @ai-sdk/harness@1.0.77

## 1.0.14

### Patch Changes

- Updated dependencies [fc1970b]
  - @ai-sdk/harness@1.0.76

## 1.0.13

### Patch Changes

- Updated dependencies [d300737]
  - @ai-sdk/harness@1.0.75

## 1.0.12

### Patch Changes

- @ai-sdk/harness@1.0.74

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
