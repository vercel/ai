# @ai-sdk/minimax

## 3.0.69

### Patch Changes

- 61a315e: fix: map the top-level `reasoning` option consistently across providers

  Providers now resolve reasoning the same way:

  1. A provider-specific reasoning setting in `providerOptions` is sent unchanged. OpenAI no longer drops `providerOptions.openai.reasoningEffort` values that are not in its list for the model, and Fireworks no longer rewrites `providerOptions.fireworks.reasoningEffort`. Fireworks also sends top-level `reasoning` values directly instead of rounding them to `'high'` at most, except for model families known to reject `'none'` (GPT-OSS, GLM-5.3, Muse Spark) or `'minimal'` (Nemotron, Inkling).
  2. Otherwise, `reasoning` maps to the closest level the model supports, rounding down, and rounds up only when there is no lower level. For example, `'xhigh'` now maps to `'high'` instead of `'max'` on Anthropic and Bedrock models without `xhigh` effort, and `'medium'` maps to `'low'` instead of `'high'` on DeepSeek, Kimi K3, and Mistral GLM-5.3 models.
  3. `'none'` on a model that cannot disable reasoning maps to the model's lowest level with a compatibility warning, instead of being dropped or sending a request the API rejects. This affects GPT-6 models without `'none'`, xAI grok-4.5 and later, Groq GPT-OSS, Kimi K3, Perplexity, QuiverAI, Bedrock OpenAI `gpt-oss` models, and Gemini 2.5 Pro (minimum thinking budget). Gemini 3 and Anthropic and Bedrock `between_tools` mappings now emit the compatibility warning too.

  `mapReasoningToProviderEffort` now accepts any `reasoning` value, returns an optional `providerOptionsEffort` unchanged, and rounds levels that are missing from the effort map to the closest supported level. `mapReasoningToProviderBudget` maps `'none'` to the minimum reasoning budget, always returns a budget, and uses the default percentage for levels missing from `budgetPercentages`. `OpenAICompatibleChatConfig` adds an optional `mapReasoning` function for mapping the top-level `reasoning` option.

- Updated dependencies [61a315e]
  - @ai-sdk/provider-utils@5.0.71
  - @ai-sdk/anthropic@4.0.92

## 3.0.68

### Patch Changes

- Updated dependencies [50da4c5]
  - @ai-sdk/anthropic@4.0.91

## 3.0.67

### Patch Changes

- Updated dependencies [63bf860]
- Updated dependencies [57086ff]
- Updated dependencies [95348b3]
  - @ai-sdk/anthropic@4.0.90
  - @ai-sdk/provider-utils@5.0.70

## 3.0.66

### Patch Changes

- Updated dependencies [e64ed82]
  - @ai-sdk/provider-utils@5.0.69
  - @ai-sdk/anthropic@4.0.89

## 3.0.65

### Patch Changes

- e729d58: chore(docs): update `README.md` for consistent format and to avoid duplication
- Updated dependencies [5475347]
- Updated dependencies [e729d58]
  - @ai-sdk/provider@4.0.34
  - @ai-sdk/provider-utils@5.0.68
  - @ai-sdk/anthropic@4.0.88

## 3.0.64

### Patch Changes

- Updated dependencies [8202f5b]
- Updated dependencies [85d84a1]
  - @ai-sdk/provider-utils@5.0.67
  - @ai-sdk/provider@4.0.33
  - @ai-sdk/anthropic@4.0.87

## 3.0.63

### Patch Changes

- Updated dependencies [43ad966]
- Updated dependencies [10026d1]
- Updated dependencies [aac6026]
  - @ai-sdk/anthropic@4.0.86
  - @ai-sdk/provider@4.0.32
  - @ai-sdk/provider-utils@5.0.66

## 3.0.62

### Patch Changes

- 39a776b: Add a shared encodePathSegment helper and use it to encode provider-returned identifiers in credentialed follow-up request paths.
- 0b025d7: Defer construction of provider validation schemas until first use to reduce package import time.
- Updated dependencies [b089ce8]
- Updated dependencies [39a776b]
- Updated dependencies [d39b41d]
- Updated dependencies [bc1a2e9]
  - @ai-sdk/provider-utils@5.0.65
  - @ai-sdk/anthropic@4.0.85

## 3.0.61

### Patch Changes

- 9d13c4d: Add the MiniMax M3.1 Flash model ID to the MiniMax and AI Gateway providers.
- Updated dependencies [9d13c4d]
- Updated dependencies [0c2a9de]
- Updated dependencies [200c47f]
  - @ai-sdk/anthropic@4.0.84
  - @ai-sdk/provider@4.0.31
  - @ai-sdk/provider-utils@5.0.64

## 3.0.60

### Patch Changes

- Updated dependencies [60cc252]
  - @ai-sdk/provider@4.0.30
  - @ai-sdk/anthropic@4.0.83
  - @ai-sdk/provider-utils@5.0.63

## 3.0.59

### Patch Changes

- Updated dependencies [0957554]
  - @ai-sdk/provider@4.0.29
  - @ai-sdk/provider-utils@5.0.62
  - @ai-sdk/anthropic@4.0.82

## 3.0.58

### Patch Changes

- Updated dependencies [130e871]
- Updated dependencies [e254e96]
  - @ai-sdk/provider@4.0.28
  - @ai-sdk/anthropic@4.0.81
  - @ai-sdk/provider-utils@5.0.61

## 3.0.57

### Patch Changes

- Updated dependencies [2e89fa4]
- Updated dependencies [40d0aec]
- Updated dependencies [40a4ce1]
  - @ai-sdk/provider-utils@5.0.60
  - @ai-sdk/anthropic@4.0.80

## 3.0.56

### Patch Changes

- Updated dependencies [1ccc7fb]
- Updated dependencies [9667bf2]
- Updated dependencies [c91c857]
- Updated dependencies [e57803c]
- Updated dependencies [81663cc]
- Updated dependencies [e57803c]
  - @ai-sdk/anthropic@4.0.79
  - @ai-sdk/provider-utils@5.0.59
  - @ai-sdk/provider@4.0.27

## 3.0.55

### Patch Changes

- Updated dependencies [4dbc902]
  - @ai-sdk/provider@4.0.26
  - @ai-sdk/anthropic@4.0.78
  - @ai-sdk/provider-utils@5.0.58

## 3.0.54

### Patch Changes

- Updated dependencies [c01cbb8]
  - @ai-sdk/anthropic@4.0.77

## 3.0.53

### Patch Changes

- Updated dependencies [9184a35]
  - @ai-sdk/provider@4.0.25
  - @ai-sdk/provider-utils@5.0.57
  - @ai-sdk/anthropic@4.0.76

## 3.0.52

### Patch Changes

- Updated dependencies [866e884]
  - @ai-sdk/anthropic@4.0.75

## 3.0.51

### Patch Changes

- Updated dependencies [d3bcad9]
  - @ai-sdk/provider@4.0.24
  - @ai-sdk/anthropic@4.0.74
  - @ai-sdk/provider-utils@5.0.56

## 3.0.50

### Patch Changes

- Updated dependencies [fc1e19e]
- Updated dependencies [5094ebd]
- Updated dependencies [268225c]
- Updated dependencies [0af2f7c]
  - @ai-sdk/provider-utils@5.0.55
  - @ai-sdk/anthropic@4.0.73
  - @ai-sdk/provider@4.0.23

## 3.0.49

### Patch Changes

- Updated dependencies [2959d35]
- Updated dependencies [b5dfea1]
- Updated dependencies [686cca9]
- Updated dependencies [59116e6]
  - @ai-sdk/provider@4.0.22
  - @ai-sdk/provider-utils@5.0.54
  - @ai-sdk/anthropic@4.0.72

## 3.0.48

### Patch Changes

- Updated dependencies [c35458e]
  - @ai-sdk/anthropic@4.0.71

## 3.0.47

### Patch Changes

- Updated dependencies [8c65988]
- Updated dependencies [527a163]
  - @ai-sdk/provider@4.0.21
  - @ai-sdk/provider-utils@5.0.53
  - @ai-sdk/anthropic@4.0.70

## 3.0.46

### Patch Changes

- ede5b89: chore: migrate package builds from tsup to tsdown
- Updated dependencies [ede5b89]
- Updated dependencies [a587f55]
  - @ai-sdk/anthropic@4.0.69
  - @ai-sdk/provider@4.0.20
  - @ai-sdk/provider-utils@5.0.52

## 3.0.45

### Patch Changes

- c2511c1: fix: use standards-compliant User-Agent header
- Updated dependencies [c2511c1]
  - @ai-sdk/anthropic@4.0.68
  - @ai-sdk/provider-utils@5.0.51

## 3.0.44

### Patch Changes

- Updated dependencies [e361d39]
- Updated dependencies [8373a22]
  - @ai-sdk/anthropic@4.0.67

## 3.0.43

### Patch Changes

- Updated dependencies [e3605f6]
- Updated dependencies [525efc5]
  - @ai-sdk/provider-utils@5.0.50
  - @ai-sdk/provider@4.0.19
  - @ai-sdk/anthropic@4.0.66

## 3.0.42

### Patch Changes

- Updated dependencies [af9597b]
- Updated dependencies [bc49f78]
  - @ai-sdk/provider-utils@5.0.49
  - @ai-sdk/anthropic@4.0.65

## 3.0.41

### Patch Changes

- Updated dependencies [67f8000]
- Updated dependencies [be877ff]
  - @ai-sdk/anthropic@4.0.64
  - @ai-sdk/provider-utils@5.0.48

## 3.0.40

### Patch Changes

- Updated dependencies [154221f]
  - @ai-sdk/anthropic@4.0.63

## 3.0.39

### Patch Changes

- Updated dependencies [fe07867]
- Updated dependencies [a4b0940]
- Updated dependencies [771e74b]
  - @ai-sdk/provider-utils@5.0.47
  - @ai-sdk/anthropic@4.0.62

## 3.0.38

### Patch Changes

- Updated dependencies [ffb0e76]
- Updated dependencies [3733d6e]
  - @ai-sdk/provider@4.0.18
  - @ai-sdk/anthropic@4.0.61
  - @ai-sdk/provider-utils@5.0.46

## 3.0.37

### Patch Changes

- Updated dependencies [49295bb]
  - @ai-sdk/anthropic@4.0.60

## 3.0.36

### Patch Changes

- Updated dependencies [f7b7b2a]
  - @ai-sdk/anthropic@4.0.59

## 3.0.35

### Patch Changes

- Updated dependencies [2973485]
- Updated dependencies [a4db5ea]
- Updated dependencies [2937ea2]
  - @ai-sdk/provider-utils@5.0.45
  - @ai-sdk/anthropic@4.0.58

## 3.0.34

### Patch Changes

- Updated dependencies [0455398]
  - @ai-sdk/provider-utils@5.0.44
  - @ai-sdk/anthropic@4.0.57

## 3.0.33

### Patch Changes

- Updated dependencies [d4d96bf]
- Updated dependencies [215b25e]
- Updated dependencies [d4d96bf]
- Updated dependencies [a7dd893]
- Updated dependencies [3456e2c]
- Updated dependencies [c4e76de]
  - @ai-sdk/anthropic@4.0.56
  - @ai-sdk/provider-utils@5.0.43
  - @ai-sdk/provider@4.0.17

## 3.0.32

### Patch Changes

- Updated dependencies [132bdae]
- Updated dependencies [91c2128]
- Updated dependencies [2cd80b3]
- Updated dependencies [d06bb2a]
- Updated dependencies [123d71f]
- Updated dependencies [2fa5e0e]
  - @ai-sdk/anthropic@4.0.55
  - @ai-sdk/provider-utils@5.0.42
  - @ai-sdk/provider@4.0.16

## 3.0.31

### Patch Changes

- Updated dependencies [5c0054d]
- Updated dependencies [39535af]
  - @ai-sdk/provider@4.0.15
  - @ai-sdk/anthropic@4.0.54
  - @ai-sdk/provider-utils@5.0.41

## 3.0.30

### Patch Changes

- Updated dependencies [5ec21a6]
- Updated dependencies [7469a3b]
- Updated dependencies [e4292e7]
- Updated dependencies [813bb36]
- Updated dependencies [c43e4b7]
  - @ai-sdk/anthropic@4.0.53
  - @ai-sdk/provider@4.0.14
  - @ai-sdk/provider-utils@5.0.40

## 3.0.29

### Patch Changes

- ef3bac4: Forward `webhookUrl` as `callback_url` in `doStart` for application-owned receivers. Document challenge verification and terminal-status handling requirements. `generateVideo({ webhook })` continues to fall back to SDK polling without invoking the webhook factory.
- Updated dependencies [9942196]
- Updated dependencies [5a7e647]
  - @ai-sdk/provider@4.0.13
  - @ai-sdk/anthropic@4.0.52
  - @ai-sdk/provider-utils@5.0.39

## 3.0.28

### Patch Changes

- Updated dependencies [912fb01]
  - @ai-sdk/provider@4.0.12
  - @ai-sdk/anthropic@4.0.51
  - @ai-sdk/provider-utils@5.0.38

## 3.0.27

### Patch Changes

- 46cea63: Add asynchronous start/status support for MiniMax video generation while preserving existing polling behavior.

## 3.0.26

### Patch Changes

- Updated dependencies [a4ba394]
- Updated dependencies [45099da]
- Updated dependencies [9e1d1b2]
- Updated dependencies [a495511]
  - @ai-sdk/provider@4.0.11
  - @ai-sdk/anthropic@4.0.50
  - @ai-sdk/provider-utils@5.0.37

## 3.0.25

### Patch Changes

- Updated dependencies [65397d7]
  - @ai-sdk/anthropic@4.0.49

## 3.0.24

### Patch Changes

- a580ec8: feat(minimax): validate video status polling redirects for MiniMax, Kling AI, and ByteDance
- Updated dependencies [4d25a08]
- Updated dependencies [6bcc0f8]
  - @ai-sdk/anthropic@4.0.48
  - @ai-sdk/provider-utils@5.0.36

## 3.0.23

### Patch Changes

- Updated dependencies [5190b67]
  - @ai-sdk/provider@4.0.10
  - @ai-sdk/provider-utils@5.0.35
  - @ai-sdk/anthropic@4.0.47

## 3.0.22

### Patch Changes

- 5366b7b: Add model-aware MiniMax 480P and 768P video resolutions, duration limits, and reference-input validation.
- 5366b7b: Map MiniMax 480P and 768P frame sizes onto their named video resolution tiers, so a typed top-level `resolution` can reach them.
- Updated dependencies [aa45741]
  - @ai-sdk/anthropic@4.0.46
  - @ai-sdk/provider@4.0.9
  - @ai-sdk/provider-utils@5.0.34

## 3.0.21

### Patch Changes

- Updated dependencies [90192f1]
  - @ai-sdk/provider-utils@5.0.33
  - @ai-sdk/anthropic@4.0.45

## 3.0.20

### Patch Changes

- Updated dependencies [3e125ba]
  - @ai-sdk/provider-utils@5.0.32
  - @ai-sdk/anthropic@4.0.44

## 3.0.19

### Patch Changes

- Updated dependencies [7de3612]
- Updated dependencies [a9782e1]
- Updated dependencies [35841f5]
- Updated dependencies [d2f3353]
  - @ai-sdk/anthropic@4.0.43
  - @ai-sdk/provider-utils@5.0.31

## 3.0.18

### Patch Changes

- Updated dependencies [591d25b]
  - @ai-sdk/anthropic@4.0.42
  - @ai-sdk/provider@4.0.8
  - @ai-sdk/provider-utils@5.0.30

## 3.0.17

### Patch Changes

- Updated dependencies [b74971f]
  - @ai-sdk/provider-utils@5.0.29
  - @ai-sdk/anthropic@4.0.41

## 3.0.16

### Patch Changes

- Updated dependencies [e6087c9]
  - @ai-sdk/provider-utils@5.0.28
  - @ai-sdk/anthropic@4.0.40

## 3.0.15

### Patch Changes

- Updated dependencies [4579b08]
  - @ai-sdk/anthropic@4.0.39

## 3.0.14

### Patch Changes

- Updated dependencies [7fbfc6d]
  - @ai-sdk/provider-utils@5.0.27
  - @ai-sdk/anthropic@4.0.38

## 3.0.13

### Patch Changes

- Updated dependencies [401a4ba]
  - @ai-sdk/provider-utils@5.0.26
  - @ai-sdk/anthropic@4.0.37

## 3.0.12

### Patch Changes

- Updated dependencies [ad6a650]
- Updated dependencies [81cd026]
  - @ai-sdk/provider@4.0.7
  - @ai-sdk/provider-utils@5.0.25
  - @ai-sdk/anthropic@4.0.36

## 3.0.11

### Patch Changes

- Updated dependencies [1937bef]
  - @ai-sdk/provider-utils@5.0.24
  - @ai-sdk/anthropic@4.0.35

## 3.0.10

### Patch Changes

- Updated dependencies [e6415bd]
  - @ai-sdk/anthropic@4.0.34

## 3.0.9

### Patch Changes

- Updated dependencies [3469d0c]
  - @ai-sdk/provider@4.0.6
  - @ai-sdk/anthropic@4.0.33
  - @ai-sdk/provider-utils@5.0.23

## 3.0.8

### Patch Changes

- Updated dependencies [8b96941]
  - @ai-sdk/anthropic@4.0.32

## 3.0.7

### Patch Changes

- Updated dependencies [2b60826]
- Updated dependencies [7a9da75]
  - @ai-sdk/provider-utils@5.0.22
  - @ai-sdk/anthropic@4.0.31

## 3.0.6

### Patch Changes

- Updated dependencies [1bec07d]
  - @ai-sdk/provider-utils@5.0.21
  - @ai-sdk/anthropic@4.0.30

## 3.0.5

### Patch Changes

- Updated dependencies [160ccdb]
  - @ai-sdk/provider-utils@5.0.20
  - @ai-sdk/anthropic@4.0.29

## 3.0.4

### Patch Changes

- 79e133c: async APIs for generateVideo (poll, webhook)

  Adds an asynchronous start/status flow to the experimental video model
  interface (`VideoModelV4`): models may now implement `doStart`, `doStatus`,
  and `handleWebhookOption` instead of (or in addition to) `doGenerate`, and
  `experimental_generateVideo` accepts `poll` and `webhook` options to
  orchestrate completion via polling or webhooks. Polling configuration can use
  a custom delay implementation for durable workflow compatibility.

- Updated dependencies [9337ecd]
- Updated dependencies [79e133c]
  - @ai-sdk/anthropic@4.0.28
  - @ai-sdk/provider@4.0.5
  - @ai-sdk/provider-utils@5.0.19

## 3.0.3

### Patch Changes

- 494f1ac: fix(provider/minimax): send a default `16:9` ratio for MiniMax-H3 text-to-video

## 3.0.2

### Patch Changes

- 1d36c72: Add video model support to the MiniMax provider (`minimax.video`) for the MiniMax-H3 model, including text-to-video, first/last-frame, and reference-to-video generation.
- Updated dependencies [5fc7da5]
- Updated dependencies [93b2acd]
  - @ai-sdk/provider-utils@5.0.18
  - @ai-sdk/anthropic@4.0.27

## 3.0.1

### Patch Changes

- Updated dependencies [dc0c28e]
- Updated dependencies [fa95504]
  - @ai-sdk/anthropic@4.0.26
  - @ai-sdk/provider-utils@5.0.17

## 3.0.0

### Major Changes

- 5b5335f: Add MiniMax provider with language model support for the MiniMax-M model series.

### Patch Changes

- Updated dependencies [d8210b6]
- Updated dependencies [b192878]
  - @ai-sdk/provider-utils@5.0.16
  - @ai-sdk/anthropic@4.0.25
