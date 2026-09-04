# @ai-sdk/harness

## 1.0.101

### Patch Changes

- 951c54d: feat(harness): support `askUserQuestions` tool including support for normalization across harness adapters
- Updated dependencies [a51cc94]
- Updated dependencies [d1904d3]
- Updated dependencies [84e5a79]
- Updated dependencies [a8e8ad0]
  - ai@7.0.92

## 1.0.100

### Patch Changes

- 0c37bf0: fix(harness): avoid warning about lack of credential brokering support when `credentialForwarding` callback is used to replace all credentials with ephemeral fake secrets
- Updated dependencies [802af1e]
  - ai@7.0.91

## 1.0.99

### Patch Changes

- Updated dependencies [6bcc0f8]
  - @ai-sdk/provider-utils@5.0.36
  - ai@7.0.90

## 1.0.98

### Patch Changes

- Updated dependencies [5190b67]
  - @ai-sdk/provider@4.0.10
  - @ai-sdk/provider-utils@5.0.35
  - ai@7.0.89

## 1.0.97

### Patch Changes

- Updated dependencies [8b6b756]
- Updated dependencies [e07b577]
  - ai@7.0.88

## 1.0.96

### Patch Changes

- c0c7fac: feat(harness): add reusable `createReadBridgeAsset()` helper function
- Updated dependencies [850d863]
  - ai@7.0.87

## 1.0.95

### Patch Changes

- 371e954: feat(harness): add `createBridgeToken()` and `withBridgeToken()` helpers for bridge backed harness adapters
- 87b4858: feat(harness): enhance per-turn telemetry with recently added per-turn configuration data
- Updated dependencies [11109ae]
  - ai@7.0.86

## 1.0.94

### Patch Changes

- 8961fde: feat(harness): allow changing `model` between turns via call options
- eb59f2a: fix(harness): ensure harness adapters can stream tool input deltas before the complete tool call arrives
- Updated dependencies [55a9981]
- Updated dependencies [dd32de2]
- Updated dependencies [aa45741]
- Updated dependencies [cc29073]
  - ai@7.0.85
  - @ai-sdk/provider@4.0.9
  - @ai-sdk/provider-utils@5.0.34

## 1.0.93

### Patch Changes

- cc9f6ce: fix(harness): stop diagnosing caller-initiated aborts as bridge errors, and serialize bridge turns so a start racing an aborted turn's teardown no longer overlaps it (bounded by a teardown grace period, after which the start proceeds as before)
- 7608210: feat(harness): add `model` parameter to `HarnessAgent` instead of having each harness adapter support it on their own constructor functions
- 6f8a2d7: fix (harness): ensure the harness bootstrap recipe on resumed sessions too. The marker is keyed by recipe identity, so a resume whose bootstrap is already current costs one file read, while a resume into a sandbox bootstrapped by an older adapter build — a snapshot that outlived the harness version that made it — is re-bootstrapped instead of running a stale bridge against a newer host.
- 14d4fc0: feat(harness): allow changing harness settings between turns via `prepareCall()` support on `HarnessAgent`
- Updated dependencies [6669d69]
- Updated dependencies [a6463ca]
- Updated dependencies [e604532]
- Updated dependencies [90192f1]
  - ai@7.0.84
  - @ai-sdk/provider-utils@5.0.33

## 1.0.92

### Patch Changes

- e0d7cfb: feat(harness): allow harness sessions to optionally authenticate from an isolated environment supplied through the `auth` option, and remove support for the formerly deprecated legacy auth options types
  - ai@7.0.83

## 1.0.91

### Patch Changes

- Updated dependencies [8dd86a9]
- Updated dependencies [fda13b3]
- Updated dependencies [957146c]
- Updated dependencies [ce6849a]
  - ai@7.0.83

## 1.0.90

### Patch Changes

- 0e590d2: feat(harness): harden credential brokering to only apply with correct ephemeral secret
- Updated dependencies [3e125ba]
  - ai@7.0.82
  - @ai-sdk/provider-utils@5.0.32

## 1.0.89

### Patch Changes

- ai@7.0.81

## 1.0.88

### Patch Changes

- 32349cc: Surface every host tool approval request when a Pi step emits multiple tool calls.
- Updated dependencies [a9782e1]
- Updated dependencies [35841f5]
- Updated dependencies [d2f3353]
- Updated dependencies [eed7950]
  - @ai-sdk/provider-utils@5.0.31
  - ai@7.0.80

## 1.0.87

### Patch Changes

- 8a15038: feat(harness): add `credentialForwarding` setting to bridge backed harness adapters for granular control
- Updated dependencies [b251584]
- Updated dependencies [591d25b]
- Updated dependencies [9de0baf]
  - ai@7.0.79
  - @ai-sdk/provider@4.0.8
  - @ai-sdk/provider-utils@5.0.30

## 1.0.86

### Patch Changes

- Updated dependencies [96970bb]
  - ai@7.0.78

## 1.0.85

### Patch Changes

- fa6af57: fix(harness): emit builtin tool results after approval continuations
- Updated dependencies [b74971f]
  - @ai-sdk/provider-utils@5.0.29
  - ai@7.0.77

## 1.0.84

### Patch Changes

- Updated dependencies [c6d57f3]
- Updated dependencies [677a707]
  - ai@7.0.76

## 1.0.83

### Patch Changes

- Updated dependencies [8978ad8]
  - ai@7.0.75

## 1.0.82

### Patch Changes

- ai@7.0.74

## 1.0.81

### Patch Changes

- 7f50d28: feat(harness): make `destroy` on `HarnessV1NetworkSandboxSession` mandatory
  - ai@7.0.73

## 1.0.80

### Patch Changes

- ai@7.0.72

## 1.0.79

### Patch Changes

- Updated dependencies [9a37469]
  - ai@7.0.71

## 1.0.78

### Patch Changes

- eace6fb: feat(harness): add experimental support for steering agent conversations mid-turn
- c0595b4: feat(harness): support passing a filesystem and process restricted sandbox session to `HarnessAgentSession`, using fallbacks in favor of the preferred network sandbox session methods

## 1.0.77

### Patch Changes

- Updated dependencies [e6087c9]
- Updated dependencies [9566914]
- Updated dependencies [b181020]
- Updated dependencies [7054073]
- Updated dependencies [a828527]
- Updated dependencies [d3cc3fe]
  - @ai-sdk/provider-utils@5.0.28
  - ai@7.0.70

## 1.0.76

### Patch Changes

- fc1970b: feat(harness): allow passing caller-owned `sandboxSession` to `HarnessAgent.createSession()` and in that case allow omitting the then unnecessary `sandbox` arg from `HarnessAgent` constructor
  - ai@7.0.69

## 1.0.75

### Patch Changes

- d300737: fix(harness): keep the runtime's error message on failed provider-executed tool results
  - ai@7.0.68

## 1.0.74

### Patch Changes

- ai@7.0.67

## 1.0.73

### Patch Changes

- 62a9c2a: feat(harness): add support for structured output to `HarnessAgent` via `output` property
- d25cae2: fix(harness): claim the bridge event stream on start/resume instead of on connect

## 1.0.72

### Patch Changes

- 69bb613: feat(harness): support request transformations in network sandbox abstraction and use it to apply credential brokering when available
- 52bc889: feat(harness): add `getPortEndpoint()` as more comprehensive replacement to `getPortUrl()` (now deprecated) in `HarnessV1NetworkSandboxSession`
- 4cd4989: chore(harness): decouple bridge based harness bootstrap recipe logic from dynamic params and enforce unique harnesses in `prepareSandboxForHarness()` helper
- Updated dependencies [0782259]
- Updated dependencies [2fd1214]
  - ai@7.0.66

## 1.0.71

### Patch Changes

- 8d717b3: Execute independent host tool calls concurrently within a harness step.
- Updated dependencies [dc8caae]
- Updated dependencies [72ec74f]
- Updated dependencies [c5b0515]
  - ai@7.0.65

## 1.0.70

### Patch Changes

- ai@7.0.64

## 1.0.69

### Patch Changes

- Updated dependencies [d0a5807]
- Updated dependencies [dcf33e8]
  - ai@7.0.63

## 1.0.68

### Patch Changes

- Updated dependencies [e0bcf52]
  - ai@7.0.62

## 1.0.67

### Patch Changes

- Updated dependencies [326054b]
- Updated dependencies [975bb28]
- Updated dependencies [7fbfc6d]
  - ai@7.0.61
  - @ai-sdk/provider-utils@5.0.27

## 1.0.66

### Patch Changes

- 9ee30bf: fix(harness): pass instructions appended to system / developer prompt instead of using the workaround of first user prompt
- Updated dependencies [79c52ef]
  - ai@7.0.60

## 1.0.65

### Patch Changes

- a03ff6c: feat(harness): add support for per-harness MCP servers
- Updated dependencies [401a4ba]
  - @ai-sdk/provider-utils@5.0.26
  - ai@7.0.59

## 1.0.64

### Patch Changes

- Updated dependencies [72ad23f]
- Updated dependencies [ad6a650]
- Updated dependencies [81cd026]
  - ai@7.0.58
  - @ai-sdk/provider@4.0.7
  - @ai-sdk/provider-utils@5.0.25

## 1.0.63

### Patch Changes

- Updated dependencies [1937bef]
  - @ai-sdk/provider-utils@5.0.24
  - ai@7.0.57

## 1.0.62

### Patch Changes

- 25c9120: Expose provider metadata on language-model-call end callbacks and telemetry spans.
- Updated dependencies [25c9120]
- Updated dependencies [89080c8]
- Updated dependencies [79d6195]
  - ai@7.0.56

## 1.0.61

### Patch Changes

- Updated dependencies [3469d0c]
  - @ai-sdk/provider@4.0.6
  - ai@7.0.55
  - @ai-sdk/provider-utils@5.0.23

## 1.0.60

### Patch Changes

- Updated dependencies [a6b17a2]
- Updated dependencies [5615eb7]
- Updated dependencies [36a3ff6]
  - ai@7.0.54

## 1.0.59

### Patch Changes

- 81bcf2e: feat(harness): add `HarnessBridgeCapabilityUnsupportedError` for bridge code that needs to flag missing capability
- Updated dependencies [cd0177b]
- Updated dependencies [2b60826]
- Updated dependencies [a09fdef]
  - ai@7.0.53
  - @ai-sdk/provider-utils@5.0.22

## 1.0.58

### Patch Changes

- Updated dependencies [3836a85]
- Updated dependencies [1bec07d]
  - ai@7.0.52
  - @ai-sdk/provider-utils@5.0.21

## 1.0.57

### Patch Changes

- Updated dependencies [160ccdb]
  - @ai-sdk/provider-utils@5.0.20
  - ai@7.0.51

## 1.0.56

### Patch Changes

- Updated dependencies [79e133c]
- Updated dependencies [da64b51]
  - @ai-sdk/provider@4.0.5
  - ai@7.0.50
  - @ai-sdk/provider-utils@5.0.19

## 1.0.55

### Patch Changes

- 2c0a8aa: fix(harness): remove unused and unnecessary `workingDirectory` property from `HarnessV1BootstrapCommand`
- 861d423: feat(harness): improve harness sandbox auth error handling and expose `getHarnessErrorMessage()` helper
- 8f10600: fix(harness): rename harness bridge `detach` to `stop` and `shutdown` to `destroy` for clarity
  - ai@7.0.49

## 1.0.54

### Patch Changes

- ai@7.0.48

## 1.0.53

### Patch Changes

- bdde5d9: fix(harness): avoid placing harness bootstrap files in `/tmp` and instead use sandbox working directory
- Updated dependencies [5fc7da5]
- Updated dependencies [93b2acd]
  - @ai-sdk/provider-utils@5.0.18
  - ai@7.0.47

## 1.0.52

### Patch Changes

- ai@7.0.46

## 1.0.51

### Patch Changes

- 226a679: fix(harness): emit the final result or error after an approved host tool continuation executes.
- Updated dependencies [d6ce0ee]
- Updated dependencies [fa95504]
- Updated dependencies [349afe7]
  - ai@7.0.45
  - @ai-sdk/provider-utils@5.0.17

## 1.0.50

### Patch Changes

- Updated dependencies [015acb4]
  - ai@7.0.44

## 1.0.49

### Patch Changes

- Updated dependencies [d8210b6]
- Updated dependencies [b192878]
  - @ai-sdk/provider-utils@5.0.16
  - ai@7.0.43

## 1.0.48

### Patch Changes

- Updated dependencies [1659cd5]
- Updated dependencies [60f97f6]
- Updated dependencies [6a5bdff]
- Updated dependencies [6de2ec1]
  - @ai-sdk/provider-utils@5.0.15
  - ai@7.0.42

## 1.0.47

### Patch Changes

- Updated dependencies [2e2224b]
  - ai@7.0.41

## 1.0.46

### Patch Changes

- Updated dependencies [c3782a6]
  - ai@7.0.40

## 1.0.45

### Patch Changes

- Updated dependencies [0c464d9]
- Updated dependencies [09a52cb]
- Updated dependencies [c49380c]
  - @ai-sdk/provider-utils@5.0.14
  - ai@7.0.39

## 1.0.44

### Patch Changes

- Updated dependencies [7bd6bdd]
- Updated dependencies [1e2f324]
  - ai@7.0.38
  - @ai-sdk/provider@4.0.4
  - @ai-sdk/provider-utils@5.0.13

## 1.0.43

### Patch Changes

- a9a22e1: fix(harness): fix telemetry end events to report `final-step` text and reasoning for multi-step turns
- 9e4e816: fix(harness): avoid emitting `onTurnFinished` / `onTurnFailed` when turn is suspended mid-flight
- ea3063f: fix(harness): remove broken bridge `channel.interrupt()` layer and its usage

## 1.0.42

### Patch Changes

- ai@7.0.37

## 1.0.41

### Patch Changes

- a94425b: fix(harness): ensure harness telemetry hooks are awaited before stream processing continues
- 2de0611: fix(harness): avoid incorrectly marked invalid tool calls due to `dynamic` flag being dropped
- Updated dependencies [7fa85b2]
  - ai@7.0.36

## 1.0.40

### Patch Changes

- 59a2306: fix(harness): execute host tools through telemetry context wrappers
- 5f65e61: feat(harness): add support for `stopWhen` control to `HarnessAgent` (e.g. `isStepCount(1)`)
- Updated dependencies [7f6650b]
- Updated dependencies [106ea59]
  - ai@7.0.35

## 1.0.39

### Patch Changes

- 86a84c9: fix(harness): settle a turn aborted by the caller's abortSignal with an `abort` stream part instead of an AbortError `error` part, matching `streamText`'s abort contract
  - ai@7.0.34

## 1.0.38

### Patch Changes

- Updated dependencies [02ffdcb]
- Updated dependencies [76cb673]
- Updated dependencies [e808fa5]
- Updated dependencies [33647d7]
  - @ai-sdk/provider-utils@5.0.12
  - ai@7.0.33

## 1.0.37

### Patch Changes

- b460541: fix(harness): properly support client-side / host-side tools and handle unfinished turn semantics
- 079591e: fix (harness): emit the message-level `start` part on HarnessAgent streams so `toUIMessageStream` persistence mode can inject the response message id
- Updated dependencies [6cd7c74]
- Updated dependencies [e35bcae]
- Updated dependencies [a4eb3f3]
  - ai@7.0.32

## 1.0.36

### Patch Changes

- Updated dependencies [70f18c3]
- Updated dependencies [cd06458]
  - ai@7.0.31
  - @ai-sdk/provider-utils@5.0.11

## 1.0.35

### Patch Changes

- ai@7.0.30

## 1.0.34

### Patch Changes

- ai@7.0.29

## 1.0.33

### Patch Changes

- Updated dependencies [0bc8d4f]
  - ai@7.0.28

## 1.0.32

### Patch Changes

- Updated dependencies [ac01b79]
- Updated dependencies [31c7be8]
- Updated dependencies [2696562]
  - ai@7.0.27
  - @ai-sdk/provider-utils@5.0.10

## 1.0.31

### Patch Changes

- Updated dependencies [27d294d]
  - ai@7.0.26

## 1.0.30

### Patch Changes

- Updated dependencies [4be62c1]
- Updated dependencies [7805e4a]
- Updated dependencies [7805e4a]
- Updated dependencies [f8e82fd]
- Updated dependencies [cd12954]
  - @ai-sdk/provider-utils@5.0.9
  - ai@7.0.25

## 1.0.29

### Patch Changes

- Updated dependencies [e193290]
- Updated dependencies [e193290]
  - @ai-sdk/provider-utils@5.0.8
  - ai@7.0.24

## 1.0.28

### Patch Changes

- Updated dependencies [930f949]
  - ai@7.0.23

## 1.0.27

### Patch Changes

- Updated dependencies [8f89c25]
  - ai@7.0.22

## 1.0.26

### Patch Changes

- Updated dependencies [308a519]
  - ai@7.0.21

## 1.0.25

### Patch Changes

- 44e988a: fix(harness): fix harness tool approval regression

## 1.0.24

### Patch Changes

- Updated dependencies [b9ac19f]
- Updated dependencies [a4186d6]
  - ai@7.0.20

## 1.0.23

### Patch Changes

- 39c8276: fix(harness): improve opaque sandbox bridge error handling
- 91fe6d8: fix(harness): emit `finish-step` stream parts correctly per the underlying model steps
- 0be5014: fix(harness): fix obsolete portions of harness package readme

## 1.0.22

### Patch Changes

- Updated dependencies [be7f05a]
- Updated dependencies [ee55a07]
- Updated dependencies [aad737d]
- Updated dependencies [0f93c57]
  - ai@7.0.19
  - @ai-sdk/provider@4.0.3
  - @ai-sdk/provider-utils@5.0.7

## 1.0.21

### Patch Changes

- Updated dependencies [ac306ed]
  - @ai-sdk/provider-utils@5.0.6
  - ai@7.0.18

## 1.0.20

### Patch Changes

- b7aa06a: fix(harness): include step numbers on harness step-end telemetry events.
  - ai@7.0.17

## 1.0.19

### Patch Changes

- Updated dependencies [a8f9b6d]
  - ai@7.0.16

## 1.0.18

### Patch Changes

- ai@7.0.15

## 1.0.17

### Patch Changes

- 5c5c0f5: Add experimental streaming transcription support for transcription models, including OpenAI `gpt-realtime-whisper` and xAI WebSocket STT.
- Updated dependencies [5c5c0f5]
  - ai@7.0.14
  - @ai-sdk/provider@4.0.2
  - @ai-sdk/provider-utils@5.0.5

## 1.0.16

### Patch Changes

- ai@7.0.13

## 1.0.15

### Patch Changes

- Updated dependencies [ecfeb6f]
- Updated dependencies [a193137]
- Updated dependencies [c6f5e62]
  - ai@7.0.12
  - @ai-sdk/provider-utils@5.0.4

## 1.0.14

### Patch Changes

- Updated dependencies [0a87626]
  - ai@7.0.11

## 1.0.13

### Patch Changes

- Updated dependencies [8c616f0]
  - ai@7.0.10
  - @ai-sdk/provider-utils@5.0.3

## 1.0.12

### Patch Changes

- 7859cea: feat(harness): add tool filtering via `activeTools` and `inactiveTools`
- c857346: feat(harness): add utility functions for certain duplicated layers in harnesses

## 1.0.11

### Patch Changes

- ai@7.0.9

## 1.0.10

### Patch Changes

- Updated dependencies [0274f34]
  - @ai-sdk/provider@4.0.1
  - ai@7.0.8
  - @ai-sdk/provider-utils@5.0.2

## 1.0.9

### Patch Changes

- Updated dependencies [d598481]
  - ai@7.0.7

## 1.0.8

### Patch Changes

- Updated dependencies [989402d]
  - ai@7.0.6

## 1.0.7

### Patch Changes

- Updated dependencies [a2750db]
  - ai@7.0.5

## 1.0.6

### Patch Changes

- Updated dependencies [6a436e3]
  - @ai-sdk/provider-utils@5.0.1
  - ai@7.0.4

## 1.0.5

### Patch Changes

- ai@7.0.3

## 1.0.4

### Patch Changes

- c493634: fix(harness): fix harness Zod usage to be v3/v4 compatible

## 1.0.3

### Patch Changes

- 51d10a0: feat(harness): add `prepareSandboxForHarness` utility to prepare a caller-owned sandbox for one or more harnesses

## 1.0.2

### Patch Changes

- ai@7.0.2

## 1.0.1

### Patch Changes

- ai@7.0.1

## 1.0.0

### Major Changes

- 9d6dbe0: feat(harness): add sandbox specific expansion for harness abstraction, add `sandbox-just-bash` and `sandbox-vercel`

### Patch Changes

- e5d4a24: chore(harness): update ws package
- aae0138: fix(harness): make listening for sandbox bridge readiness compatible with Bun
- be83911: fix(harness): reject bridge startup when the WebSocket port cannot be bound
- 3d87086: fix(harness): guard against invalid resuming a session vs continuing a turn
- d77bed4: chore(harness): separate harness spec types (v1) from consumer-facing types
- 21d3d60: feat(harness): implement harness specification
- 3d9a50c: feat(harness): implement harness adapters for Claude Code, Codex, Pi
- 57e0a59: fix(harness): ensure finish chunk's total usage is actually coming from total usage
- 6c7a3e5: Start the `1.0.0` canary release line for the experimental harness and sandbox packages. They were unintentionally published as `0.0.0-canary.*` because they were scaffolded with a `0.0.0-canary.0` premajor version, which semver could not advance past on a major bump.
- 1ea15a3: fix(harness): fix various bugs with harness skills not being correctly processed by the harness adapters
- a83a367: feat(harness): allow pre-snapshot `sandboxConfig.onBootstrap` callback in `HarnessAgent`
- b8396f0: trigger initial beta release
- 534dac6: fix(harness): fix incomplete OIDC token support for AI Gateway auth in harness adapters

## 1.0.0-beta.27

### Patch Changes

- ai@7.0.0-beta.187

## 1.0.0-beta.26

### Patch Changes

- a83a367: feat(harness): allow pre-snapshot `sandboxConfig.onBootstrap` callback in `HarnessAgent`

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
