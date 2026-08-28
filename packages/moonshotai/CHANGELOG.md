# @ai-sdk/moonshotai

## 3.0.42

### Patch Changes

- Updated dependencies [90192f1]
  - @ai-sdk/provider-utils@5.0.33

## 3.0.41

### Patch Changes

- 87b49a2: fix(provider/moonshotai): preserve complete raw usage objects
- 48c5f46: Preserve documented Moonshot API error codes in HTTP and streaming errors.
- Updated dependencies [3e125ba]
  - @ai-sdk/provider-utils@5.0.32

## 3.0.40

### Patch Changes

- a336b12: Add first-class Moonshot V1 auto and vision-preview model IDs while preserving custom and retired model ID support.
- e4f665c: Preserve documented Moonshot AI chat response metadata for generate and stream.
- 85463b9: Add Moonshot AI Partial Mode support for continuing a final assistant message.
- d354a42: fix(provider/moonshotai): send max output tokens with the current Moonshot request field
- e5d5cbe: feat(provider/moonshotai): add predicted output support
- 3da2b7d: Support Kimi K3 dynamic tool-loading system messages.

## 3.0.39

### Patch Changes

- a06a14a: fix(provider/moonshotai): align thinking and reasoning options by model
- 8fca314: Support inline text file data and native `ms://` image and video provider references in Moonshot chat prompts.
- 35841f5: feat: normalize mid-stream provider error events across supported providers into public StreamProviderError instances and preserve provider-owned type, code, status, retry, and raw payload metadata
- 1d19b2a: Add Moonshot Chat Completions log probability options and provider metadata.
- d53589a: Accept Moonshot streaming tool calls without indices and preserve choice-level usage.
- 462c498: Normalize Moonshot structured output schemas and enable strict validation by default.
- 8037158: Use native JSON Schema structured outputs for official Moonshot V1 models.
- c88b272: Reject unsupported image and video media types before sending Moonshot chat requests.
- 4cf7c85: Add provider-specific names for Moonshot AI system, user, and assistant messages.
- 1cb0493: fix(provider/moonshotai): omit unsupported sampling settings for Kimi models
- 9645259: Omit required tool choice with a warning for Moonshot Kimi models that reject it.
- Updated dependencies [a9782e1]
- Updated dependencies [35841f5]
- Updated dependencies [d2f3353]
  - @ai-sdk/provider-utils@5.0.31

## 3.0.38

### Patch Changes

- 2214258: Prevent negative text output token counts when providers report reasoning tokens. Perplexity reasoning tokens are now treated as separate from completion tokens.
- Updated dependencies [591d25b]
  - @ai-sdk/provider@4.0.8
  - @ai-sdk/provider-utils@5.0.30

## 3.0.37

### Patch Changes

- Updated dependencies [b74971f]
  - @ai-sdk/provider-utils@5.0.29

## 3.0.36

### Patch Changes

- e6087c9: fix: handle empty string tool call IDs
- Updated dependencies [e6087c9]
  - @ai-sdk/provider-utils@5.0.28

## 3.0.35

### Patch Changes

- 9435df8: feat(provider/moonshotai): normalize tool schemas for Moonshot's MFJS validator. Tuple `items` arrays become `prefixItems`, `type` next to `anyOf` moves into the branches, and non-`object` root schemas fail with a clear client-side error instead of Moonshot's opaque 400. Everything else passes through unchanged; the original schema is still used for AI SDK result validation.

## 3.0.34

### Patch Changes

- Updated dependencies [7fbfc6d]
  - @ai-sdk/provider-utils@5.0.27

## 3.0.33

### Patch Changes

- Updated dependencies [401a4ba]
  - @ai-sdk/provider-utils@5.0.26

## 3.0.32

### Patch Changes

- b283a6f: feat(provider/moonshotai): own the chat implementation, support video input. The provider no longer builds on `@ai-sdk/openai-compatible`; the converter, language model, and helpers are owned by the package. Video file parts (e.g. `mediaType: 'video/mp4'`) are converted to Moonshot's `video_url` content parts for video-capable models (`kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`, `kimi-k2.5`). Audio and PDF file parts now throw client-side (the API rejects those part types). `reasoningHistory: 'preserved'` now maps to Moonshot's `thinking.keep: 'all'` request field (previously a no-op, the API ignores `reasoning_history`), gated per model with a warning on models without `thinking.keep` support. Adds `promptCacheKey` and `safetyIdentifier` provider options, widens `reasoningEffort` to `'low' | 'high' | 'max'` per Moonshot's docs, maps the generic `reasoning` call option to `reasoning_effort`, and passes `ms://` Files API references through natively (declared in `supportedUrls`).

## 3.0.31

### Patch Changes

- Updated dependencies [83e6510]
  - @ai-sdk/openai-compatible@3.0.28

## 3.0.30

### Patch Changes

- Updated dependencies [ad6a650]
- Updated dependencies [81cd026]
  - @ai-sdk/provider@4.0.7
  - @ai-sdk/provider-utils@5.0.25
  - @ai-sdk/openai-compatible@3.0.27

## 3.0.29

### Patch Changes

- Updated dependencies [1937bef]
  - @ai-sdk/provider-utils@5.0.24
  - @ai-sdk/openai-compatible@3.0.26

## 3.0.28

### Patch Changes

- Updated dependencies [3469d0c]
  - @ai-sdk/provider@4.0.6
  - @ai-sdk/openai-compatible@3.0.25
  - @ai-sdk/provider-utils@5.0.23

## 3.0.27

### Patch Changes

- Updated dependencies [2b60826]
  - @ai-sdk/provider-utils@5.0.22
  - @ai-sdk/openai-compatible@3.0.24

## 3.0.26

### Patch Changes

- Updated dependencies [1bec07d]
  - @ai-sdk/provider-utils@5.0.21
  - @ai-sdk/openai-compatible@3.0.23

## 3.0.25

### Patch Changes

- Updated dependencies [160ccdb]
  - @ai-sdk/provider-utils@5.0.20
  - @ai-sdk/openai-compatible@3.0.22

## 3.0.24

### Patch Changes

- Updated dependencies [79e133c]
  - @ai-sdk/provider@4.0.5
  - @ai-sdk/openai-compatible@3.0.21
  - @ai-sdk/provider-utils@5.0.19

## 3.0.23

### Patch Changes

- 5fc7da5: chore: centralize empty language model usage creation in provider utilities.
- Updated dependencies [5fc7da5]
- Updated dependencies [93b2acd]
  - @ai-sdk/provider-utils@5.0.18
  - @ai-sdk/openai-compatible@3.0.20

## 3.0.22

### Patch Changes

- Updated dependencies [fa95504]
  - @ai-sdk/provider-utils@5.0.17
  - @ai-sdk/openai-compatible@3.0.19

## 3.0.21

### Patch Changes

- Updated dependencies [d8210b6]
- Updated dependencies [b192878]
  - @ai-sdk/provider-utils@5.0.16
  - @ai-sdk/openai-compatible@3.0.18

## 3.0.20

### Patch Changes

- Updated dependencies [1659cd5]
- Updated dependencies [6a5bdff]
  - @ai-sdk/provider-utils@5.0.15
  - @ai-sdk/openai-compatible@3.0.17

## 3.0.19

### Patch Changes

- Updated dependencies [0c464d9]
- Updated dependencies [c49380c]
  - @ai-sdk/provider-utils@5.0.14
  - @ai-sdk/openai-compatible@3.0.16

## 3.0.18

### Patch Changes

- Updated dependencies [1e2f324]
  - @ai-sdk/provider@4.0.4
  - @ai-sdk/openai-compatible@3.0.15
  - @ai-sdk/provider-utils@5.0.13

## 3.0.17

### Patch Changes

- Updated dependencies [02ffdcb]
- Updated dependencies [76cb673]
  - @ai-sdk/provider-utils@5.0.12
  - @ai-sdk/openai-compatible@3.0.14

## 3.0.16

### Patch Changes

- Updated dependencies [8b52503]
  - @ai-sdk/openai-compatible@3.0.13

## 3.0.15

### Patch Changes

- Updated dependencies [cd06458]
  - @ai-sdk/provider-utils@5.0.11
  - @ai-sdk/openai-compatible@3.0.12

## 3.0.14

### Patch Changes

- 341616a: feat: add kimi-k3 model and `reasoningEffort` provider option

## 3.0.13

### Patch Changes

- Updated dependencies [0b61267]
  - @ai-sdk/openai-compatible@3.0.11

## 3.0.12

### Patch Changes

- Updated dependencies [31c7be8]
  - @ai-sdk/provider-utils@5.0.10
  - @ai-sdk/openai-compatible@3.0.10

## 3.0.11

### Patch Changes

- Updated dependencies [4be62c1]
- Updated dependencies [7805e4a]
- Updated dependencies [cd12954]
  - @ai-sdk/provider-utils@5.0.9
  - @ai-sdk/openai-compatible@3.0.9

## 3.0.10

### Patch Changes

- Updated dependencies [e193290]
  - @ai-sdk/provider-utils@5.0.8
  - @ai-sdk/openai-compatible@3.0.8

## 3.0.9

### Patch Changes

- Updated dependencies [0f93c57]
  - @ai-sdk/provider@4.0.3
  - @ai-sdk/openai-compatible@3.0.7
  - @ai-sdk/provider-utils@5.0.7

## 3.0.8

### Patch Changes

- Updated dependencies [ac306ed]
  - @ai-sdk/provider-utils@5.0.6
  - @ai-sdk/openai-compatible@3.0.6

## 3.0.7

### Patch Changes

- 5c5c0f5: Add experimental streaming transcription support for transcription models, including OpenAI `gpt-realtime-whisper` and xAI WebSocket STT.
- Updated dependencies [5c5c0f5]
  - @ai-sdk/provider@4.0.2
  - @ai-sdk/provider-utils@5.0.5
  - @ai-sdk/openai-compatible@3.0.5

## 3.0.6

### Patch Changes

- Updated dependencies [c6f5e62]
  - @ai-sdk/provider-utils@5.0.4
  - @ai-sdk/openai-compatible@3.0.4

## 3.0.5

### Patch Changes

- Updated dependencies [8c616f0]
  - @ai-sdk/provider-utils@5.0.3
  - @ai-sdk/openai-compatible@3.0.3

## 3.0.4

### Patch Changes

- Updated dependencies [0274f34]
  - @ai-sdk/provider@4.0.1
  - @ai-sdk/openai-compatible@3.0.2
  - @ai-sdk/provider-utils@5.0.2

## 3.0.3

### Patch Changes

- 5cb600b: feat(moonshotai): support structured outputs for kimi-k2.5

## 3.0.2

### Patch Changes

- Updated dependencies [6a436e3]
  - @ai-sdk/provider-utils@5.0.1
  - @ai-sdk/openai-compatible@3.0.1

## 3.0.1

### Patch Changes

- 995ee1b: feat(moonshotai): support structured outputs for kimi-2.6 and 2.7-code
- 9d6ec49: feat(moonshotai): update kimi model list

## 3.0.0

### Major Changes

- ef992f8: Remove CommonJS exports from all packages. All packages are now ESM-only (`"type": "module"`). Consumers using `require()` must switch to ESM `import` syntax.
- 8359612: Start v7 pre-release
- 04e9009: chore: make provider implementations code patterns more consistent, including renaming certain exported symbols

  For all externally exported symbols that were renamed, the old names continue to work via deprecated aliases.

### Patch Changes

- 38fc777: Add AI Gateway hint to provider READMEs
- 9f0e36c: trigger release for all packages after provenance setup
- 8f3e1da: chore(openai-compat): update v3 specs to v4
- 7fc6bd6: Raise minimum supported Node.js version to 22. Supported versions: 22, 24, and 26.
- 0c4c275: trigger initial canary release
- 258c093: chore: ensure consistent import handling and avoid import duplicates or cycles
- b8396f0: trigger initial beta release
- 90e2d8a: chore: fix unused vars not being flagged by our lint tooling
- b3976a2: Add workflow serialization support to all provider models.

  **`@ai-sdk/provider-utils`:** New `serializeModel()` helper that extracts only serializable properties from a model instance, filtering out functions and objects containing functions. Third-party provider authors can use this to add workflow support to their own models.

  **All providers:** `headers` is now optional in provider config types. This is non-breaking — existing code that passes `headers` continues to work. Custom provider implementations that construct model configs manually can now omit `headers`, which is useful when models are deserialized from a workflow step boundary where auth is provided separately.

  All provider model classes now include `WORKFLOW_SERIALIZE` and `WORKFLOW_DESERIALIZE` static methods, enabling them to cross workflow step boundaries without serialization errors.

## 3.0.0-beta.58

### Patch Changes

- Updated dependencies [0416e3e]
  - @ai-sdk/provider@4.0.0-beta.20
  - @ai-sdk/openai-compatible@3.0.0-beta.58
  - @ai-sdk/provider-utils@5.0.0-beta.50

## 3.0.0-beta.57

### Patch Changes

- b8396f0: trigger initial beta release
- Updated dependencies [b8396f0]
  - @ai-sdk/openai-compatible@3.0.0-beta.57
  - @ai-sdk/provider-utils@5.0.0-beta.49
  - @ai-sdk/provider@4.0.0-beta.19

## 3.0.0-canary.56

### Patch Changes

- Updated dependencies [aeda373]
- Updated dependencies [375fdd7]
- Updated dependencies [b4507d5]
  - @ai-sdk/provider-utils@5.0.0-canary.48
  - @ai-sdk/openai-compatible@3.0.0-canary.56

## 3.0.0-canary.55

### Patch Changes

- Updated dependencies [bae5e2b]
  - @ai-sdk/provider-utils@5.0.0-canary.47
  - @ai-sdk/openai-compatible@3.0.0-canary.55

## 3.0.0-canary.54

### Patch Changes

- Updated dependencies [ce769dd]
  - @ai-sdk/provider@4.0.0-canary.18
  - @ai-sdk/openai-compatible@3.0.0-canary.54
  - @ai-sdk/provider-utils@5.0.0-canary.46

## 3.0.0-canary.53

### Patch Changes

- Updated dependencies [ee798eb]
- Updated dependencies [daf6637]
  - @ai-sdk/provider-utils@5.0.0-canary.45
  - @ai-sdk/openai-compatible@3.0.0-canary.53

## 3.0.0-canary.52

### Patch Changes

- Updated dependencies [6c93e36]
- Updated dependencies [f617ac2]
  - @ai-sdk/provider-utils@5.0.0-canary.44
  - @ai-sdk/openai-compatible@3.0.0-canary.52

## 3.0.0-canary.51

### Patch Changes

- Updated dependencies [9f1e1ba]
  - @ai-sdk/openai-compatible@3.0.0-canary.51

## 3.0.0-canary.50

### Patch Changes

- 7fc6bd6: Raise minimum supported Node.js version to 22. Supported versions: 22, 24, and 26.
- Updated dependencies [7fc6bd6]
  - @ai-sdk/openai-compatible@3.0.0-canary.50
  - @ai-sdk/provider-utils@5.0.0-canary.43
  - @ai-sdk/provider@4.0.0-canary.17

## 3.0.0-canary.49

### Patch Changes

- Updated dependencies [a6617c5]
  - @ai-sdk/provider-utils@5.0.0-canary.42
  - @ai-sdk/openai-compatible@3.0.0-canary.49

## 3.0.0-canary.48

### Patch Changes

- Updated dependencies [28dfa06]
- Updated dependencies [e93fa91]
  - @ai-sdk/provider-utils@5.0.0-canary.41
  - @ai-sdk/openai-compatible@3.0.0-canary.48

## 3.0.0-canary.47

### Patch Changes

- Updated dependencies [a7de9c9]
  - @ai-sdk/provider-utils@5.0.0-canary.40
  - @ai-sdk/openai-compatible@3.0.0-canary.47

## 3.0.0-canary.46

### Patch Changes

- Updated dependencies [105f95b]
  - @ai-sdk/provider-utils@5.0.0-canary.39
  - @ai-sdk/openai-compatible@3.0.0-canary.46

## 3.0.0-canary.45

### Patch Changes

- Updated dependencies [ca446f8]
  - @ai-sdk/provider-utils@5.0.0-canary.38
  - @ai-sdk/openai-compatible@3.0.0-canary.45

## 3.0.0-canary.44

### Patch Changes

- Updated dependencies [d848405]
  - @ai-sdk/provider-utils@5.0.0-canary.37
  - @ai-sdk/openai-compatible@3.0.0-canary.44

## 3.0.0-canary.43

### Patch Changes

- Updated dependencies [ca39020]
  - @ai-sdk/provider-utils@5.0.0-canary.36
  - @ai-sdk/openai-compatible@3.0.0-canary.43

## 3.0.0-canary.42

### Patch Changes

- Updated dependencies [f634bac]
  - @ai-sdk/provider-utils@5.0.0-canary.35
  - @ai-sdk/openai-compatible@3.0.0-canary.42

## 3.0.0-canary.41

### Patch Changes

- Updated dependencies [69254e0]
- Updated dependencies [3015fc3]
  - @ai-sdk/provider-utils@5.0.0-canary.34
  - @ai-sdk/openai-compatible@3.0.0-canary.41

## 3.0.0-canary.40

### Patch Changes

- Updated dependencies [2427d88]
  - @ai-sdk/provider-utils@5.0.0-canary.33
  - @ai-sdk/openai-compatible@3.0.0-canary.40

## 3.0.0-canary.39

### Patch Changes

- Updated dependencies [5463d0d]
  - @ai-sdk/provider-utils@5.0.0-canary.32
  - @ai-sdk/provider@4.0.0-canary.16
  - @ai-sdk/openai-compatible@3.0.0-canary.39

## 3.0.0-canary.38

### Patch Changes

- Updated dependencies [cd9c311]
  - @ai-sdk/openai-compatible@3.0.0-canary.38

## 3.0.0-canary.37

### Patch Changes

- 0c4c275: trigger initial canary release
- Updated dependencies [0c4c275]
  - @ai-sdk/openai-compatible@3.0.0-canary.37
  - @ai-sdk/provider-utils@5.0.0-canary.31
  - @ai-sdk/provider@4.0.0-canary.15

## 3.0.0-beta.36

### Patch Changes

- Updated dependencies [e59c955]
  - @ai-sdk/openai-compatible@3.0.0-beta.36

## 3.0.0-beta.35

### Major Changes

- 04e9009: chore: make provider implementations code patterns more consistent, including renaming certain exported symbols

  For all externally exported symbols that were renamed, the old names continue to work via deprecated aliases.

### Patch Changes

- Updated dependencies [08d2129]
- Updated dependencies [04e9009]
  - @ai-sdk/provider-utils@5.0.0-beta.30
  - @ai-sdk/openai-compatible@3.0.0-beta.35

## 3.0.0-beta.34

### Patch Changes

- 258c093: chore: ensure consistent import handling and avoid import duplicates or cycles
- Updated dependencies [9bd6512]
- Updated dependencies [258c093]
- Updated dependencies [b6783da]
  - @ai-sdk/openai-compatible@3.0.0-beta.34
  - @ai-sdk/provider-utils@5.0.0-beta.29
  - @ai-sdk/provider@4.0.0-beta.14

## 3.0.0-beta.33

### Patch Changes

- 9f0e36c: trigger release for all packages after provenance setup
- Updated dependencies [9f0e36c]
  - @ai-sdk/openai-compatible@3.0.0-beta.33
  - @ai-sdk/provider@4.0.0-beta.13
  - @ai-sdk/provider-utils@5.0.0-beta.28

## 3.0.0-beta.32

### Patch Changes

- Updated dependencies [ab81968]
- Updated dependencies [785fe16]
- Updated dependencies [67df0a0]
- Updated dependencies [befb78c]
- Updated dependencies [0458559]
- Updated dependencies [58a2ad7]
- Updated dependencies [5852c0a]
- Updated dependencies [fc92055]
  - @ai-sdk/openai-compatible@3.0.0-beta.32
  - @ai-sdk/provider-utils@5.0.0-beta.27

## 3.0.0-beta.31

### Patch Changes

- Updated dependencies [2e98477]
- Updated dependencies [bfb756d]
  - @ai-sdk/provider-utils@5.0.0-beta.26
  - @ai-sdk/openai-compatible@3.0.0-beta.31

## 3.0.0-beta.30

### Patch Changes

- Updated dependencies [eea8d98]
  - @ai-sdk/provider-utils@5.0.0-beta.25
  - @ai-sdk/openai-compatible@3.0.0-beta.30

## 3.0.0-beta.29

### Patch Changes

- Updated dependencies [f807e45]
  - @ai-sdk/provider-utils@5.0.0-beta.24
  - @ai-sdk/openai-compatible@3.0.0-beta.29

## 3.0.0-beta.28

### Patch Changes

- Updated dependencies [350ea38]
  - @ai-sdk/provider-utils@5.0.0-beta.23
  - @ai-sdk/openai-compatible@3.0.0-beta.28

## 3.0.0-beta.27

### Patch Changes

- Updated dependencies [083947b]
  - @ai-sdk/provider-utils@5.0.0-beta.22
  - @ai-sdk/openai-compatible@3.0.0-beta.27

## 3.0.0-beta.26

### Patch Changes

- Updated dependencies [add1126]
  - @ai-sdk/provider-utils@5.0.0-beta.21
  - @ai-sdk/openai-compatible@3.0.0-beta.26

## 3.0.0-beta.25

### Patch Changes

- b3976a2: Add workflow serialization support to all provider models.

  **`@ai-sdk/provider-utils`:** New `serializeModel()` helper that extracts only serializable properties from a model instance, filtering out functions and objects containing functions. Third-party provider authors can use this to add workflow support to their own models.

  **All providers:** `headers` is now optional in provider config types. This is non-breaking — existing code that passes `headers` continues to work. Custom provider implementations that construct model configs manually can now omit `headers`, which is useful when models are deserialized from a workflow step boundary where auth is provided separately.

  All provider model classes now include `WORKFLOW_SERIALIZE` and `WORKFLOW_DESERIALIZE` static methods, enabling them to cross workflow step boundaries without serialization errors.

- Updated dependencies [b3976a2]
- Updated dependencies [ff5eba1]
  - @ai-sdk/provider-utils@5.0.0-beta.20
  - @ai-sdk/openai-compatible@3.0.0-beta.25
  - @ai-sdk/provider@4.0.0-beta.12

## 3.0.0-beta.24

### Major Changes

- ef992f8: Remove CommonJS exports from all packages. All packages are now ESM-only (`"type": "module"`). Consumers using `require()` must switch to ESM `import` syntax.

### Patch Changes

- Updated dependencies [ef992f8]
  - @ai-sdk/openai-compatible@3.0.0-beta.24
  - @ai-sdk/provider@4.0.0-beta.11
  - @ai-sdk/provider-utils@5.0.0-beta.19

## 3.0.0-beta.23

### Patch Changes

- 90e2d8a: chore: fix unused vars not being flagged by our lint tooling
- Updated dependencies [90e2d8a]
  - @ai-sdk/openai-compatible@3.0.0-beta.23
  - @ai-sdk/provider-utils@5.0.0-beta.18

## 3.0.0-beta.22

### Patch Changes

- Updated dependencies [3ae1786]
  - @ai-sdk/provider-utils@5.0.0-beta.17
  - @ai-sdk/openai-compatible@3.0.0-beta.22

## 3.0.0-beta.21

### Patch Changes

- Updated dependencies [176466a]
  - @ai-sdk/provider@4.0.0-beta.10
  - @ai-sdk/openai-compatible@3.0.0-beta.21
  - @ai-sdk/provider-utils@5.0.0-beta.16

## 3.0.0-beta.20

### Patch Changes

- Updated dependencies [e311194]
  - @ai-sdk/provider@4.0.0-beta.9
  - @ai-sdk/openai-compatible@3.0.0-beta.20
  - @ai-sdk/provider-utils@5.0.0-beta.15

## 3.0.0-beta.19

### Patch Changes

- Updated dependencies [34bd95d]
- Updated dependencies [008271d]
  - @ai-sdk/provider@4.0.0-beta.8
  - @ai-sdk/openai-compatible@3.0.0-beta.19
  - @ai-sdk/provider-utils@5.0.0-beta.14

## 3.0.0-beta.18

### Patch Changes

- Updated dependencies [b0c2869]
- Updated dependencies [7e26e81]
  - @ai-sdk/provider-utils@5.0.0-beta.13
  - @ai-sdk/openai-compatible@3.0.0-beta.18

## 3.0.0-beta.17

### Patch Changes

- Updated dependencies [816ff67]
  - @ai-sdk/openai-compatible@3.0.0-beta.17

## 3.0.0-beta.16

### Patch Changes

- Updated dependencies [46d1149]
  - @ai-sdk/provider-utils@5.0.0-beta.12
  - @ai-sdk/openai-compatible@3.0.0-beta.16

## 3.0.0-beta.15

### Patch Changes

- Updated dependencies [6fd51c0]
  - @ai-sdk/provider-utils@5.0.0-beta.11
  - @ai-sdk/provider@4.0.0-beta.7
  - @ai-sdk/openai-compatible@3.0.0-beta.15

## 3.0.0-beta.14

### Patch Changes

- Updated dependencies [c29a26f]
  - @ai-sdk/openai-compatible@3.0.0-beta.14
  - @ai-sdk/provider-utils@5.0.0-beta.10
  - @ai-sdk/provider@4.0.0-beta.6

## 3.0.0-beta.13

### Patch Changes

- 38fc777: Add AI Gateway hint to provider READMEs
- Updated dependencies [38fc777]
  - @ai-sdk/openai-compatible@3.0.0-beta.13

## 3.0.0-beta.12

### Patch Changes

- Updated dependencies [2e17091]
  - @ai-sdk/provider-utils@5.0.0-beta.9
  - @ai-sdk/openai-compatible@3.0.0-beta.12

## 3.0.0-beta.11

### Patch Changes

- Updated dependencies [986c6fd]
- Updated dependencies [493295c]
  - @ai-sdk/provider-utils@5.0.0-beta.8
  - @ai-sdk/openai-compatible@3.0.0-beta.11

## 3.0.0-beta.10

### Patch Changes

- Updated dependencies [1f509d4]
  - @ai-sdk/provider-utils@5.0.0-beta.7
  - @ai-sdk/provider@4.0.0-beta.5
  - @ai-sdk/openai-compatible@3.0.0-beta.10

## 3.0.0-beta.9

### Patch Changes

- Updated dependencies [74d520f]
  - @ai-sdk/openai-compatible@3.0.0-beta.9

## 3.0.0-beta.8

### Patch Changes

- Updated dependencies [3887c70]
  - @ai-sdk/provider-utils@5.0.0-beta.6
  - @ai-sdk/provider@4.0.0-beta.4
  - @ai-sdk/openai-compatible@3.0.0-beta.8

## 3.0.0-beta.7

### Patch Changes

- Updated dependencies [776b617]
  - @ai-sdk/provider-utils@5.0.0-beta.5
  - @ai-sdk/provider@4.0.0-beta.3
  - @ai-sdk/openai-compatible@3.0.0-beta.7

## 3.0.0-beta.6

### Patch Changes

- Updated dependencies [61753c3]
  - @ai-sdk/provider-utils@5.0.0-beta.4
  - @ai-sdk/openai-compatible@3.0.0-beta.6

## 3.0.0-beta.5

### Patch Changes

- Updated dependencies [f7d4f01]
  - @ai-sdk/provider-utils@5.0.0-beta.3
  - @ai-sdk/provider@4.0.0-beta.2
  - @ai-sdk/openai-compatible@3.0.0-beta.5

## 3.0.0-beta.4

### Patch Changes

- Updated dependencies [5c2a5a2]
  - @ai-sdk/provider@4.0.0-beta.1
  - @ai-sdk/openai-compatible@3.0.0-beta.4
  - @ai-sdk/provider-utils@5.0.0-beta.2

## 3.0.0-beta.3

### Patch Changes

- 8f3e1da: chore(openai-compat): update v3 specs to v4
- Updated dependencies [8f3e1da]
  - @ai-sdk/openai-compatible@3.0.0-beta.3

## 3.0.0-beta.2

### Patch Changes

- Updated dependencies [45b3d76]
- Updated dependencies [f7295cb]
  - @ai-sdk/openai-compatible@3.0.0-beta.2

## 3.0.0-beta.1

### Patch Changes

- Updated dependencies [531251e]
  - @ai-sdk/provider-utils@5.0.0-beta.1
  - @ai-sdk/openai-compatible@3.0.0-beta.1

## 3.0.0-beta.0

### Major Changes

- 8359612: Start v7 pre-release

### Patch Changes

- Updated dependencies [8359612]
  - @ai-sdk/openai-compatible@3.0.0-beta.0
  - @ai-sdk/provider@4.0.0-beta.0
  - @ai-sdk/provider-utils@5.0.0-beta.0

## 2.0.10

### Patch Changes

- Updated dependencies [ad4cfc2]
  - @ai-sdk/provider-utils@4.0.19
  - @ai-sdk/openai-compatible@2.0.35

## 2.0.9

### Patch Changes

- Updated dependencies [824b295]
  - @ai-sdk/provider-utils@4.0.18
  - @ai-sdk/openai-compatible@2.0.34

## 2.0.8

### Patch Changes

- Updated dependencies [89caf28]
  - @ai-sdk/openai-compatible@2.0.33

## 2.0.7

### Patch Changes

- Updated dependencies [08336f1]
  - @ai-sdk/provider-utils@4.0.17
  - @ai-sdk/openai-compatible@2.0.32

## 2.0.6

### Patch Changes

- Updated dependencies [58bc42d]
  - @ai-sdk/provider-utils@4.0.16
  - @ai-sdk/openai-compatible@2.0.31

## 2.0.5

### Patch Changes

- Updated dependencies [4024a3a]
  - @ai-sdk/provider-utils@4.0.15
  - @ai-sdk/openai-compatible@2.0.30

## 2.0.4

### Patch Changes

- 99fbed8: feat: normalize provider specific model options type names and ensure they are exported
- Updated dependencies [99fbed8]
  - @ai-sdk/openai-compatible@2.0.29

## 2.0.3

### Patch Changes

- d999bdf: fix (provider/moonshotai): include usage when streaming

## 2.0.2

### Patch Changes

- Updated dependencies [7168375]
  - @ai-sdk/provider@3.0.8
  - @ai-sdk/openai-compatible@2.0.28
  - @ai-sdk/provider-utils@4.0.14

## 2.0.1

### Patch Changes

- Updated dependencies [9e490ad]
  - @ai-sdk/openai-compatible@2.0.27

## 2.0.0

### Major Changes

- a57c1df: feat(provider): add Moonshot AI provider

## 1.0.0

### Major Changes

- 36268ff: feat(provider): add Moonshot AI provider
