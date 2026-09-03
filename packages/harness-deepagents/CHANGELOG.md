# @ai-sdk/harness-deepagents

## 1.0.101

### Patch Changes

- Updated dependencies [951c54d]
  - @ai-sdk/harness@1.0.101

## 1.0.100

### Patch Changes

- 0c37bf0: fix(harness): avoid warning about lack of credential brokering support when `credentialForwarding` callback is used to replace all credentials with ephemeral fake secrets
- Updated dependencies [0c37bf0]
  - @ai-sdk/harness@1.0.100

## 1.0.99

### Patch Changes

- Updated dependencies [6bcc0f8]
  - @ai-sdk/provider-utils@5.0.36
  - @ai-sdk/harness@1.0.99

## 1.0.98

### Patch Changes

- Updated dependencies [5190b67]
  - @ai-sdk/provider-utils@5.0.35
  - @ai-sdk/harness@1.0.98

## 1.0.97

### Patch Changes

- @ai-sdk/harness@1.0.97

## 1.0.96

### Patch Changes

- c0c7fac: feat(harness): add reusable `createReadBridgeAsset()` helper function
- Updated dependencies [c0c7fac]
  - @ai-sdk/harness@1.0.96

## 1.0.95

### Patch Changes

- 371e954: feat(harness): add `createBridgeToken()` and `withBridgeToken()` helpers for bridge backed harness adapters
- 62f481f: fix(harness): fix bridge resolution to no longer look for an alternative path which could cause Turbopack errors
- Updated dependencies [371e954]
- Updated dependencies [87b4858]
  - @ai-sdk/harness@1.0.95

## 1.0.94

### Patch Changes

- 9ec34bd: Preserve Deep Agents conversation context when a stopped session is resumed.
- 8961fde: feat(harness): allow changing `model` between turns via call options
- Updated dependencies [8961fde]
- Updated dependencies [eb59f2a]
  - @ai-sdk/harness@1.0.94
  - @ai-sdk/provider-utils@5.0.34

## 1.0.93

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

## 1.0.92

### Patch Changes

- e0d7cfb: feat(harness): allow harness sessions to optionally authenticate from an isolated environment supplied through the `auth` option, and remove support for the formerly deprecated legacy auth options types
- Updated dependencies [e0d7cfb]
  - @ai-sdk/harness@1.0.92

## 1.0.91

### Patch Changes

- @ai-sdk/harness@1.0.91

## 1.0.90

### Patch Changes

- 0e590d2: feat(harness): harden credential brokering to only apply with correct ephemeral secret
- Updated dependencies [3e125ba]
- Updated dependencies [0e590d2]
  - @ai-sdk/provider-utils@5.0.32
  - @ai-sdk/harness@1.0.90

## 1.0.89

### Patch Changes

- @ai-sdk/harness@1.0.89

## 1.0.88

### Patch Changes

- Updated dependencies [32349cc]
- Updated dependencies [a9782e1]
- Updated dependencies [35841f5]
- Updated dependencies [d2f3353]
  - @ai-sdk/harness@1.0.88
  - @ai-sdk/provider-utils@5.0.31

## 1.0.87

### Patch Changes

- 8a15038: feat(harness): add `credentialForwarding` setting to bridge backed harness adapters for granular control
- Updated dependencies [8a15038]
  - @ai-sdk/harness@1.0.87
  - @ai-sdk/provider-utils@5.0.30

## 1.0.86

### Patch Changes

- @ai-sdk/harness@1.0.86

## 1.0.85

### Patch Changes

- Updated dependencies [b74971f]
- Updated dependencies [fa6af57]
  - @ai-sdk/provider-utils@5.0.29
  - @ai-sdk/harness@1.0.85

## 1.0.84

### Patch Changes

- @ai-sdk/harness@1.0.84

## 1.0.83

### Patch Changes

- @ai-sdk/harness@1.0.83

## 1.0.82

### Patch Changes

- @ai-sdk/harness@1.0.82

## 1.0.81

### Patch Changes

- Updated dependencies [7f50d28]
  - @ai-sdk/harness@1.0.81

## 1.0.80

### Patch Changes

- @ai-sdk/harness@1.0.80

## 1.0.79

### Patch Changes

- @ai-sdk/harness@1.0.79

## 1.0.78

### Patch Changes

- eace6fb: feat(harness): add experimental support for steering agent conversations mid-turn
- c0595b4: feat(harness): support passing a filesystem and process restricted sandbox session to `HarnessAgentSession`, using fallbacks in favor of the preferred network sandbox session methods
- Updated dependencies [eace6fb]
- Updated dependencies [c0595b4]
  - @ai-sdk/harness@1.0.78

## 1.0.77

### Patch Changes

- Updated dependencies [e6087c9]
  - @ai-sdk/provider-utils@5.0.28
  - @ai-sdk/harness@1.0.77

## 1.0.76

### Patch Changes

- Updated dependencies [fc1970b]
  - @ai-sdk/harness@1.0.76

## 1.0.75

### Patch Changes

- Updated dependencies [d300737]
  - @ai-sdk/harness@1.0.75

## 1.0.74

### Patch Changes

- @ai-sdk/harness@1.0.74

## 1.0.73

### Patch Changes

- 62a9c2a: feat(harness): add support for structured output to `HarnessAgent` via `output` property
- Updated dependencies [62a9c2a]
- Updated dependencies [d25cae2]
  - @ai-sdk/harness@1.0.73

## 1.0.72

### Patch Changes

- 69bb613: feat(harness): support request transformations in network sandbox abstraction and use it to apply credential brokering when available
- 52bc889: feat(harness): add `getPortEndpoint()` as more comprehensive replacement to `getPortUrl()` (now deprecated) in `HarnessV1NetworkSandboxSession`
- 4cd4989: chore(harness): decouple bridge based harness bootstrap recipe logic from dynamic params and enforce unique harnesses in `prepareSandboxForHarness()` helper
- Updated dependencies [69bb613]
- Updated dependencies [52bc889]
- Updated dependencies [4cd4989]
  - @ai-sdk/harness@1.0.72

## 1.0.71

### Patch Changes

- 83fe754: chore(harness): simplify the `auth` param to be a simple string to choose the auth method
- Updated dependencies [8d717b3]
  - @ai-sdk/harness@1.0.71

## 1.0.70

### Patch Changes

- 616730a: fix(harness): fix missing reasoning controls

## 1.0.69

### Patch Changes

- @ai-sdk/harness@1.0.70

## 1.0.68

### Patch Changes

- @ai-sdk/harness@1.0.69

## 1.0.67

### Patch Changes

- @ai-sdk/harness@1.0.68

## 1.0.66

### Patch Changes

- Updated dependencies [7fbfc6d]
  - @ai-sdk/provider-utils@5.0.27
  - @ai-sdk/harness@1.0.67

## 1.0.65

### Patch Changes

- 9ee30bf: fix(harness): pass instructions appended to system / developer prompt instead of using the workaround of first user prompt
- Updated dependencies [9ee30bf]
  - @ai-sdk/harness@1.0.66

## 1.0.64

### Patch Changes

- a03ff6c: feat(harness): add support for per-harness MCP servers
- fc3baaf: feat(harness): add optional `mintBridgeToken(sandboxId)` to harness settings to control the bridge token value
- Updated dependencies [401a4ba]
- Updated dependencies [a03ff6c]
  - @ai-sdk/provider-utils@5.0.26
  - @ai-sdk/harness@1.0.65

## 1.0.63

### Patch Changes

- Updated dependencies [81cd026]
  - @ai-sdk/provider-utils@5.0.25
  - @ai-sdk/harness@1.0.64

## 1.0.62

### Patch Changes

- Updated dependencies [1937bef]
  - @ai-sdk/provider-utils@5.0.24
  - @ai-sdk/harness@1.0.63

## 1.0.61

### Patch Changes

- Updated dependencies [25c9120]
  - @ai-sdk/harness@1.0.62

## 1.0.60

### Patch Changes

- @ai-sdk/harness@1.0.61
- @ai-sdk/provider-utils@5.0.23

## 1.0.59

### Patch Changes

- @ai-sdk/harness@1.0.60

## 1.0.58

### Patch Changes

- Updated dependencies [2b60826]
- Updated dependencies [81bcf2e]
  - @ai-sdk/provider-utils@5.0.22
  - @ai-sdk/harness@1.0.59

## 1.0.57

### Patch Changes

- Updated dependencies [1bec07d]
  - @ai-sdk/provider-utils@5.0.21
  - @ai-sdk/harness@1.0.58

## 1.0.56

### Patch Changes

- Updated dependencies [160ccdb]
  - @ai-sdk/provider-utils@5.0.20
  - @ai-sdk/harness@1.0.57

## 1.0.55

### Patch Changes

- @ai-sdk/harness@1.0.56
- @ai-sdk/provider-utils@5.0.19

## 1.0.54

### Patch Changes

- 8f10600: fix(harness): rename harness bridge `detach` to `stop` and `shutdown` to `destroy` for clarity
- Updated dependencies [2c0a8aa]
- Updated dependencies [861d423]
- Updated dependencies [8f10600]
  - @ai-sdk/harness@1.0.55

## 1.0.53

### Patch Changes

- @ai-sdk/harness@1.0.54

## 1.0.52

### Patch Changes

- bdde5d9: fix(harness): avoid placing harness bootstrap files in `/tmp` and instead use sandbox working directory
- Updated dependencies [5fc7da5]
- Updated dependencies [bdde5d9]
- Updated dependencies [93b2acd]
  - @ai-sdk/provider-utils@5.0.18
  - @ai-sdk/harness@1.0.53

## 1.0.51

### Patch Changes

- @ai-sdk/harness@1.0.52

## 1.0.50

### Patch Changes

- Updated dependencies [fa95504]
- Updated dependencies [226a679]
  - @ai-sdk/provider-utils@5.0.17
  - @ai-sdk/harness@1.0.51

## 1.0.49

### Patch Changes

- @ai-sdk/harness@1.0.50

## 1.0.48

### Patch Changes

- Updated dependencies [d8210b6]
- Updated dependencies [b192878]
  - @ai-sdk/provider-utils@5.0.16
  - @ai-sdk/harness@1.0.49

## 1.0.47

### Patch Changes

- Updated dependencies [1659cd5]
- Updated dependencies [6a5bdff]
  - @ai-sdk/provider-utils@5.0.15
  - @ai-sdk/harness@1.0.48

## 1.0.46

### Patch Changes

- @ai-sdk/harness@1.0.47

## 1.0.45

### Patch Changes

- @ai-sdk/harness@1.0.46

## 1.0.44

### Patch Changes

- Updated dependencies [0c464d9]
- Updated dependencies [c49380c]
  - @ai-sdk/provider-utils@5.0.14
  - @ai-sdk/harness@1.0.45

## 1.0.43

### Patch Changes

- @ai-sdk/harness@1.0.44
- @ai-sdk/provider-utils@5.0.13

## 1.0.42

### Patch Changes

- ea3063f: fix(harness): remove broken bridge `channel.interrupt()` layer and its usage
- Updated dependencies [a9a22e1]
- Updated dependencies [9e4e816]
- Updated dependencies [ea3063f]
  - @ai-sdk/harness@1.0.43

## 1.0.41

### Patch Changes

- @ai-sdk/harness@1.0.42

## 1.0.40

### Patch Changes

- 07c977a: chore(harness): refactor bridge code to break out stream event emission from launcher to make it testable
- 8c96d41: fix(harness-deepagents): fix Deep Agents missing model ID in telemetry
- 5c1a6af: fix(harness-deepagents): fix overly limiting override of Deep Agents recursion limit default
- Updated dependencies [a94425b]
- Updated dependencies [2de0611]
  - @ai-sdk/harness@1.0.41

## 1.0.39

### Patch Changes

- Updated dependencies [59a2306]
- Updated dependencies [5f65e61]
  - @ai-sdk/harness@1.0.40

## 1.0.38

### Patch Changes

- Updated dependencies [86a84c9]
  - @ai-sdk/harness@1.0.39

## 1.0.37

### Patch Changes

- f5cdb2d: chore(harness): update primary SDK dependencies
- Updated dependencies [02ffdcb]
- Updated dependencies [76cb673]
  - @ai-sdk/provider-utils@5.0.12
  - @ai-sdk/harness@1.0.38

## 1.0.36

### Patch Changes

- Updated dependencies [b460541]
- Updated dependencies [079591e]
  - @ai-sdk/harness@1.0.37

## 1.0.35

### Patch Changes

- Updated dependencies [cd06458]
  - @ai-sdk/provider-utils@5.0.11
  - @ai-sdk/harness@1.0.36

## 1.0.34

### Patch Changes

- @ai-sdk/harness@1.0.35

## 1.0.33

### Patch Changes

- @ai-sdk/harness@1.0.34

## 1.0.32

### Patch Changes

- @ai-sdk/harness@1.0.33

## 1.0.31

### Patch Changes

- Updated dependencies [31c7be8]
  - @ai-sdk/provider-utils@5.0.10
  - @ai-sdk/harness@1.0.32

## 1.0.30

### Patch Changes

- @ai-sdk/harness@1.0.31

## 1.0.29

### Patch Changes

- Updated dependencies [4be62c1]
- Updated dependencies [7805e4a]
- Updated dependencies [cd12954]
  - @ai-sdk/provider-utils@5.0.9
  - @ai-sdk/harness@1.0.30

## 1.0.28

### Patch Changes

- Updated dependencies [e193290]
  - @ai-sdk/provider-utils@5.0.8
  - @ai-sdk/harness@1.0.29

## 1.0.27

### Patch Changes

- @ai-sdk/harness@1.0.28

## 1.0.26

### Patch Changes

- @ai-sdk/harness@1.0.27

## 1.0.25

### Patch Changes

- @ai-sdk/harness@1.0.26

## 1.0.24

### Patch Changes

- Updated dependencies [44e988a]
  - @ai-sdk/harness@1.0.25

## 1.0.23

### Patch Changes

- @ai-sdk/harness@1.0.24

## 1.0.22

### Patch Changes

- 39c8276: fix(harness): improve opaque sandbox bridge error handling
- 91fe6d8: fix(harness): emit `finish-step` stream parts correctly per the underlying model steps
- Updated dependencies [39c8276]
- Updated dependencies [91fe6d8]
- Updated dependencies [0be5014]
  - @ai-sdk/harness@1.0.23

## 1.0.21

### Patch Changes

- @ai-sdk/harness@1.0.22
- @ai-sdk/provider-utils@5.0.7

## 1.0.20

### Patch Changes

- Updated dependencies [ac306ed]
  - @ai-sdk/provider-utils@5.0.6
  - @ai-sdk/harness@1.0.21

## 1.0.19

### Patch Changes

- b2d0306: feat(harness): send `User-Agent` and `x-client-app` headers in harness adapters
- Updated dependencies [b7aa06a]
  - @ai-sdk/harness@1.0.20

## 1.0.18

### Patch Changes

- @ai-sdk/harness@1.0.19

## 1.0.17

### Patch Changes

- @ai-sdk/harness@1.0.18

## 1.0.16

### Patch Changes

- Updated dependencies [5c5c0f5]
  - @ai-sdk/provider-utils@5.0.5
  - @ai-sdk/harness@1.0.17

## 1.0.15

### Patch Changes

- @ai-sdk/harness@1.0.16

## 1.0.14

### Patch Changes

- Updated dependencies [c6f5e62]
  - @ai-sdk/provider-utils@5.0.4
  - @ai-sdk/harness@1.0.15

## 1.0.13

### Patch Changes

- @ai-sdk/harness@1.0.14

## 1.0.12

### Patch Changes

- Updated dependencies [8c616f0]
  - @ai-sdk/provider-utils@5.0.3
  - @ai-sdk/harness@1.0.13

## 1.0.11

### Patch Changes

- 7859cea: feat(harness): add tool filtering via `activeTools` and `inactiveTools`
- c857346: feat(harness): add utility functions for certain duplicated layers in harnesses
- Updated dependencies [7859cea]
- Updated dependencies [c857346]
  - @ai-sdk/harness@1.0.12

## 1.0.10

### Patch Changes

- @ai-sdk/harness@1.0.11

## 1.0.9

### Patch Changes

- @ai-sdk/harness@1.0.10
- @ai-sdk/provider-utils@5.0.2

## 1.0.8

### Patch Changes

- @ai-sdk/harness@1.0.9

## 1.0.7

### Patch Changes

- @ai-sdk/harness@1.0.8

## 1.0.6

### Patch Changes

- @ai-sdk/harness@1.0.7

## 1.0.5

### Patch Changes

- Updated dependencies [6a436e3]
  - @ai-sdk/provider-utils@5.0.1
  - @ai-sdk/harness@1.0.6

## 1.0.4

### Patch Changes

- @ai-sdk/harness@1.0.5

## 1.0.3

### Patch Changes

- c493634: fix(harness): fix harness Zod usage to be v3/v4 compatible
- Updated dependencies [c493634]
  - @ai-sdk/harness@1.0.4

## 1.0.2

### Patch Changes

- Updated dependencies [51d10a0]
  - @ai-sdk/harness@1.0.3

## 1.0.1

### Patch Changes

- @ai-sdk/harness@1.0.2

## 1.0.0

### Major Changes

- 9a37622: feat(harness-deepagents): add Deep Agents harness adapter

### Patch Changes

- @ai-sdk/harness@1.0.1
