# @ai-sdk/moonshotai

## 2.0.54

### Patch Changes

- Updated dependencies [cc23556]
  - @ai-sdk/provider-utils@4.0.50

## 2.0.53

### Patch Changes

- e19917b: Add first-class Moonshot V1 auto and vision-preview model IDs while preserving custom and retired model ID support.
- dd5da26: Add Moonshot AI Partial Mode support for continuing a final assistant message.
- 921b74f: fix(provider/moonshotai): preserve complete raw usage objects
- 1fef0bb: Preserve documented Moonshot API error codes in HTTP and streaming errors.
- 84108e5: Add provider-specific names for Moonshot AI system, user, and assistant messages.
- a88fd1b: feat(provider/moonshotai): add predicted output support
- 38bf9fa: Support Kimi K3 dynamic tool-loading system messages.

## 2.0.52

### Patch Changes

- 645e673: Preserve documented Moonshot AI chat response metadata for generate and stream.
- fe34c75: Add Moonshot Chat Completions log probability options and provider metadata.
- Updated dependencies [9a521b9]
  - @ai-sdk/provider-utils@4.0.49

## 2.0.51

### Patch Changes

- 8e81d87: Accept Moonshot streaming tool calls without indices and preserve choice-level usage.
- d48615f: Normalize Moonshot structured output schemas and enable strict validation by default.
- b6d6564: Use native JSON Schema structured outputs for official Moonshot V1 models.
- aa748d8: Reject unsupported image and video media types before sending Moonshot chat requests.
- e565062: fix(provider/moonshotai): send max output tokens with the current Moonshot request field

## 2.0.50

### Patch Changes

- 172effc: fix(provider/moonshotai): align thinking and reasoning options by model
- cc1743a: fix(provider/moonshotai): omit unsupported sampling settings for Kimi models
- 12e6be3: Omit required tool choice with a warning for Moonshot Kimi models that reject it.

## 2.0.49

### Patch Changes

- 313a441: Prevent negative text output token counts when providers report reasoning tokens. Perplexity reasoning tokens are now treated as separate from completion tokens.
- Updated dependencies [5642849]
  - @ai-sdk/provider-utils@4.0.48

## 2.0.48

### Patch Changes

- Updated dependencies [2d172fb]
  - @ai-sdk/provider-utils@4.0.47

## 2.0.47

### Patch Changes

- c01944c: feat(provider/moonshotai): normalize tool schemas for Moonshot's MFJS validator. Tuple `items` arrays become `prefixItems`, `type` next to `anyOf` moves into the branches, and non-`object` root schemas fail with a clear client-side error instead of Moonshot's opaque 400. Everything else passes through unchanged; the original schema is still used for AI SDK result validation.

## 2.0.46

### Patch Changes

- Updated dependencies [31205a4]
  - @ai-sdk/provider-utils@4.0.46

## 2.0.45

### Patch Changes

- 4d1b345: feat(provider/moonshotai): own the chat implementation, support video input. The provider no longer builds on `@ai-sdk/openai-compatible`; the converter, language model, and helpers are owned by the package. Video file parts (e.g. `mediaType: 'video/mp4'`) are converted to Moonshot's `video_url` content parts for video-capable models (`kimi-k3`, `kimi-k2.7-code`, `kimi-k2.6`, `kimi-k2.5`). Audio and PDF file parts now throw client-side (the API rejects those part types). `reasoningHistory: 'preserved'` now maps to Moonshot's `thinking.keep: 'all'` request field (previously a no-op, the API ignores `reasoning_history`), gated per model with a warning on models without `thinking.keep` support. Adds `promptCacheKey` and `safetyIdentifier` provider options, widens `reasoningEffort` to `'low' | 'high' | 'max'` per Moonshot's docs, maps the generic `reasoning` call option to `reasoning_effort`, and passes `ms://` Files API references through natively (declared in `supportedUrls`).

## 2.0.44

### Patch Changes

- Updated dependencies [b2a4d5a]
  - @ai-sdk/provider-utils@4.0.45
  - @ai-sdk/openai-compatible@2.0.67

## 2.0.43

### Patch Changes

- Updated dependencies [de18066]
- Updated dependencies [2171d15]
  - @ai-sdk/openai-compatible@2.0.66
  - @ai-sdk/provider@3.0.15
  - @ai-sdk/provider-utils@4.0.44

## 2.0.42

### Patch Changes

- Updated dependencies [dab0a08]
  - @ai-sdk/provider-utils@4.0.43
  - @ai-sdk/openai-compatible@2.0.65

## 2.0.41

### Patch Changes

- Updated dependencies [ee2bf30]
  - @ai-sdk/provider-utils@4.0.42
  - @ai-sdk/openai-compatible@2.0.64

## 2.0.40

### Patch Changes

- Updated dependencies [9ecdefe]
  - @ai-sdk/provider-utils@4.0.41
  - @ai-sdk/openai-compatible@2.0.63

## 2.0.39

### Patch Changes

- Updated dependencies [19093fd]
  - @ai-sdk/provider-utils@4.0.40
  - @ai-sdk/openai-compatible@2.0.62

## 2.0.38

### Patch Changes

- 103056e: feat: add kimi-k3 model and `reasoningEffort` provider option

## 2.0.37

### Patch Changes

- Updated dependencies [94fda5c]
  - @ai-sdk/openai-compatible@2.0.61

## 2.0.36

### Patch Changes

- Updated dependencies [06fb54c]
  - @ai-sdk/provider-utils@4.0.39
  - @ai-sdk/openai-compatible@2.0.60

## 2.0.35

### Patch Changes

- Updated dependencies [e1af05f]
  - @ai-sdk/provider@3.0.14
  - @ai-sdk/openai-compatible@2.0.59
  - @ai-sdk/provider-utils@4.0.38

## 2.0.34

### Patch Changes

- Updated dependencies [4d4e176]
- Updated dependencies [bef93ae]
- Updated dependencies [d559de9]
- Updated dependencies [327642b]
  - @ai-sdk/openai-compatible@2.0.58
  - @ai-sdk/provider-utils@4.0.37

## 2.0.33

### Patch Changes

- Updated dependencies [0952964]
  - @ai-sdk/provider-utils@4.0.36
  - @ai-sdk/openai-compatible@2.0.57

## 2.0.32

### Patch Changes

- Updated dependencies [ea1e95b]
  - @ai-sdk/provider-utils@4.0.35
  - @ai-sdk/openai-compatible@2.0.56

## 2.0.31

### Patch Changes

- Updated dependencies [fa850e6]
  - @ai-sdk/provider@3.0.13
  - @ai-sdk/openai-compatible@2.0.55
  - @ai-sdk/provider-utils@4.0.34

## 2.0.30

### Patch Changes

- f605175: feat(moonshotai): support structured outputs for kimi-k2.5
- d2e3358: feat(moonshotai): support structured outputs for kimi-2.6 and 2.7-code

## 2.0.29

### Patch Changes

- Updated dependencies [b30e43a]
  - @ai-sdk/provider-utils@4.0.33
  - @ai-sdk/openai-compatible@2.0.54

## 2.0.28

### Patch Changes

- Updated dependencies [f19334d]
  - @ai-sdk/provider@3.0.12
  - @ai-sdk/openai-compatible@2.0.53
  - @ai-sdk/provider-utils@4.0.32

## 2.0.27

### Patch Changes

- 1b40ac7: Publish all packages under the `@ai-v6` dist tag.
- Updated dependencies [1b40ac7]
  - @ai-sdk/openai-compatible@2.0.52
  - @ai-sdk/provider-utils@4.0.31
  - @ai-sdk/provider@3.0.11

## 2.0.26

### Patch Changes

- Updated dependencies [779f5cd]
  - @ai-sdk/provider-utils@4.0.30
  - @ai-sdk/openai-compatible@2.0.51

## 2.0.25

### Patch Changes

- Updated dependencies [bfa5864]
- Updated dependencies [f42aa79]
  - @ai-sdk/provider-utils@4.0.29
  - @ai-sdk/openai-compatible@2.0.50

## 2.0.24

### Patch Changes

- Updated dependencies [942f2f8]
  - @ai-sdk/provider-utils@4.0.28
  - @ai-sdk/openai-compatible@2.0.49

## 2.0.23

### Patch Changes

- Updated dependencies [e40e1d4]
  - @ai-sdk/openai-compatible@2.0.48

## 2.0.22

### Patch Changes

- Updated dependencies [f591416]
  - @ai-sdk/provider-utils@4.0.27
  - @ai-sdk/openai-compatible@2.0.47

## 2.0.21

### Patch Changes

- Updated dependencies [38966ab]
  - @ai-sdk/openai-compatible@2.0.46

## 2.0.20

### Patch Changes

- Updated dependencies [6043d24]
  - @ai-sdk/openai-compatible@2.0.45

## 2.0.19

### Patch Changes

- Updated dependencies [7beadf0]
  - @ai-sdk/provider-utils@4.0.26
  - @ai-sdk/openai-compatible@2.0.44

## 2.0.18

### Patch Changes

- a727da4: chore: ensure consistent import handling and avoid import duplicates or cycles
- Updated dependencies [a727da4]
  - @ai-sdk/openai-compatible@2.0.43
  - @ai-sdk/provider-utils@4.0.25
  - @ai-sdk/provider@3.0.10

## 2.0.17

### Patch Changes

- a7f3c72: trigger release for all packages after provenance setup
- Updated dependencies [a7f3c72]
- Updated dependencies [408a2ad]
  - @ai-sdk/openai-compatible@2.0.42
  - @ai-sdk/provider@3.0.9
  - @ai-sdk/provider-utils@4.0.24

## 2.0.16

### Patch Changes

- d42076d: Add AI Gateway hint to provider READMEs
- Updated dependencies [d42076d]
  - @ai-sdk/openai-compatible@2.0.41

## 2.0.15

### Patch Changes

- Updated dependencies [01c9c16]
  - @ai-sdk/openai-compatible@2.0.40

## 2.0.14

### Patch Changes

- Updated dependencies [6247886]
  - @ai-sdk/provider-utils@4.0.23
  - @ai-sdk/openai-compatible@2.0.39

## 2.0.13

### Patch Changes

- Updated dependencies [0469aed]
  - @ai-sdk/provider-utils@4.0.22
  - @ai-sdk/openai-compatible@2.0.38

## 2.0.12

### Patch Changes

- 055cd68: fix: publish v6 to latest npm dist tag
- Updated dependencies [055cd68]
  - @ai-sdk/openai-compatible@2.0.37
  - @ai-sdk/provider-utils@4.0.21

## 2.0.11

### Patch Changes

- Updated dependencies [64ac0fd]
  - @ai-sdk/provider-utils@4.0.20
  - @ai-sdk/openai-compatible@2.0.36

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
