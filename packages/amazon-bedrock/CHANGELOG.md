# @ai-sdk/amazon-bedrock

## 3.0.5

### Patch Changes

- c2871e6: fix(provider/amazon-bedrock): resolve opus 4.1 reasoning mode validation error

## 3.0.4

### Patch Changes

- 9aa06a7: filter out blank text blocks

## 3.0.3

### Patch Changes

- c44166d: Add support for Amazon Nova Models, cross region inference profiles and OpenAI gpt-oss in `@ai-sdk/amazon-bedrock` provider
- fbc9f06: feat(amazon-bedrock): add topK support

## 3.0.2

### Patch Changes

- 109fb4d: Add support for Anthropic Claude Opus 4.1 model (anthropic.claude-opus-4-1-20250805-v1:0)

## 3.0.1

### Patch Changes

- Updated dependencies [90d212f]
  - @ai-sdk/provider-utils@3.0.1
  - @ai-sdk/anthropic@2.0.1

## 3.0.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- 97ea26f: chore(providers/bedrock): convert to providerOptions
- 97ea26f: chore(providers/bedrock): use camelCase for providerOptions
- 314edb2: Add API key authentication support for Amazon Bedrock with Bearer token and automatic SigV4 fallback
- fa49207: feat(providers/openai-compatible): convert to providerOptions
- e2aceaf: feat: add raw chunk support
- eb173f1: chore (providers): remove model shorthand deprecation warnings
- a89add7: fix(amazon-bedrock): add structured output support for claude models
- 26735b5: chore(embedding-model): add v2 interface
- a8c8bd5: feat(embed-many): respect supportsParallelCalls & concurrency
- 0893170: fix(amazon-bedrock): handle empty activeTools with tool conversation history
- d9209ca: fix (image-model): `specificationVersion: v1` -> `v2`
- 9301f86: refactor (image-model): rename `ImageModelV1` to `ImageModelV2`
- a10bf62: Fixes "Extra inputs are not permitted" error when using reasoning with Bedrock
- 92c0b4b: chore(providers/bedrock): update embedding model to use providerOptions
- 3593385: fix(bedrock): resolve mime-types of document and images
- d1a034f: feature: using Zod 4 for internal stuff
- c87b7e4: feat (provider/amazon-bedrock): add Claude 4 model ids (claude-sonnet-4-20250514-v1:0, claude-opus-4-20250514-v1:0)
- d546725: fix(provider/amazon-bedrock): use consistent document names for prompt cache effectiveness
- b652872: fix(provider/bedrock): include toolConfig when conversation contains tool content
- 205077b: fix: improve Zod compatibility
- f418dd7: Added anthropic provider defined tool support to amazon bedrock
- 6f231db: fix(providers): always use optional instead of mix of nullish for providerOptions
- 89eaf5e: Add style parameter support for Amazon Bedrock Nova Canvas image generation
- Updated dependencies [a571d6e]
- Updated dependencies [742b7be]
- Updated dependencies [e7fcc86]
- Updated dependencies [7cddb72]
- Updated dependencies [ccce59b]
- Updated dependencies [e2b9e4b]
- Updated dependencies [95857aa]
- Updated dependencies [45c1ea2]
- Updated dependencies [6f6bb89]
- Updated dependencies [ad66c0e]
- Updated dependencies [060370c]
- Updated dependencies [dc714f3]
- Updated dependencies [b5da06a]
- Updated dependencies [8f2854f]
- Updated dependencies [d1a1aa1]
- Updated dependencies [63f9e9b]
- Updated dependencies [5d142ab]
- Updated dependencies [d5f588f]
- Updated dependencies [e025824]
- Updated dependencies [0571b98]
- Updated dependencies [5d959e7]
- Updated dependencies [b6b43c7]
- Updated dependencies [4fef487]
- Updated dependencies [48d257a]
- Updated dependencies [0c0c0b3]
- Updated dependencies [0d2c085]
- Updated dependencies [40acf9b]
- Updated dependencies [9222aeb]
- Updated dependencies [8dfcb11]
- Updated dependencies [9f73965]
- Updated dependencies [e2aceaf]
- Updated dependencies [411e483]
- Updated dependencies [8ba77a7]
- Updated dependencies [fdff8a4]
- Updated dependencies [eb173f1]
- Updated dependencies [4f26d59]
- Updated dependencies [25f3454]
- Updated dependencies [a85c85f]
- Updated dependencies [7b3ae3f]
- Updated dependencies [a166433]
- Updated dependencies [26735b5]
- Updated dependencies [443d8ec]
- Updated dependencies [5c9eec4]
- Updated dependencies [a8c8bd5]
- Updated dependencies [abf9a79]
- Updated dependencies [14c9410]
- Updated dependencies [e86be6f]
- Updated dependencies [9bf7291]
- Updated dependencies [2e13791]
- Updated dependencies [9f95b35]
- Updated dependencies [66962ed]
- Updated dependencies [0d06df6]
- Updated dependencies [472524a]
- Updated dependencies [dd3ff01]
- Updated dependencies [d9c98f4]
- Updated dependencies [05d2819]
- Updated dependencies [9301f86]
- Updated dependencies [0a87932]
- Updated dependencies [c4a2fec]
- Updated dependencies [957b739]
- Updated dependencies [79457bd]
- Updated dependencies [a3f768e]
- Updated dependencies [7435eb5]
- Updated dependencies [8aa9e20]
- Updated dependencies [4617fab]
- Updated dependencies [075711d]
- Updated dependencies [ac34802]
- Updated dependencies [0054544]
- Updated dependencies [269683f]
- Updated dependencies [cb68df0]
- Updated dependencies [ad80501]
- Updated dependencies [68ecf2f]
- Updated dependencies [9e9c809]
- Updated dependencies [32831c6]
- Updated dependencies [6dc848c]
- Updated dependencies [6b98118]
- Updated dependencies [d0f9495]
- Updated dependencies [63d791d]
- Updated dependencies [87b828f]
- Updated dependencies [3f2f00c]
- Updated dependencies [d601ed9]
- Updated dependencies [bfdca8d]
- Updated dependencies [0ff02bb]
- Updated dependencies [b9ddcdd]
- Updated dependencies [91715e5]
- Updated dependencies [7979f7f]
- Updated dependencies [ca8aac6]
- Updated dependencies [39a4fab]
- Updated dependencies [44f4aba]
- Updated dependencies [61ab528]
- Updated dependencies [84577c8]
- Updated dependencies [9bd5ab5]
- Updated dependencies [57edfcb]
- Updated dependencies [faf8446]
- Updated dependencies [7ea4132]
- Updated dependencies [d1a034f]
- Updated dependencies [5c56081]
- Updated dependencies [fd65bc6]
- Updated dependencies [023ba40]
- Updated dependencies [ea7a7c9]
- Updated dependencies [26535e0]
- Updated dependencies [e030615]
- Updated dependencies [6392f60]
- Updated dependencies [5e57fae]
- Updated dependencies [393138b]
- Updated dependencies [c57e248]
- Updated dependencies [88a8ee5]
- Updated dependencies [41fa418]
- Updated dependencies [205077b]
- Updated dependencies [71f938d]
- Updated dependencies [3795467]
- Updated dependencies [28a5ed5]
- Updated dependencies [7182d14]
- Updated dependencies [ee5a9c0]
- Updated dependencies [f418dd7]
- Updated dependencies [c1e6647]
- Updated dependencies [1766ede]
- Updated dependencies [362b048]
- Updated dependencies [399e056]
- Updated dependencies [0b678b2]
- Updated dependencies [811dff3]
- Updated dependencies [f10304b]
- Updated dependencies [dd5fd43]
- Updated dependencies [a753b3a]
- Updated dependencies [33f4a6a]
- Updated dependencies [383cbfa]
- Updated dependencies [27deb4d]
- Updated dependencies [c4df419]
  - @ai-sdk/provider-utils@3.0.0
  - @ai-sdk/provider@2.0.0
  - @ai-sdk/anthropic@2.0.0

## 3.0.0-beta.15

### Patch Changes

- Updated dependencies [88a8ee5]
  - @ai-sdk/provider-utils@3.0.0-beta.10
  - @ai-sdk/anthropic@2.0.0-beta.13

## 3.0.0-beta.14

### Patch Changes

- f418dd7: Added anthropic provider defined tool support to amazon bedrock
- Updated dependencies [f418dd7]
- Updated dependencies [27deb4d]
  - @ai-sdk/anthropic@2.0.0-beta.12
  - @ai-sdk/provider@2.0.0-beta.2
  - @ai-sdk/provider-utils@3.0.0-beta.9

## 3.0.0-beta.13

### Patch Changes

- eb173f1: chore (providers): remove model shorthand deprecation warnings
- Updated dependencies [dd5fd43]
  - @ai-sdk/provider-utils@3.0.0-beta.8

## 3.0.0-beta.12

### Patch Changes

- 0893170: fix(amazon-bedrock): handle empty activeTools with tool conversation history
- Updated dependencies [e7fcc86]
  - @ai-sdk/provider-utils@3.0.0-beta.7

## 3.0.0-beta.11

### Patch Changes

- a89add7: fix(amazon-bedrock): add structured output support for claude models

## 3.0.0-beta.10

### Patch Changes

- b652872: fix(provider/bedrock): include toolConfig when conversation contains tool content
- Updated dependencies [ac34802]
  - @ai-sdk/provider-utils@3.0.0-beta.6

## 3.0.0-beta.9

### Patch Changes

- Updated dependencies [57edfcb]
- Updated dependencies [383cbfa]
  - @ai-sdk/provider-utils@3.0.0-beta.5

## 3.0.0-beta.8

### Patch Changes

- 205077b: fix: improve Zod compatibility
- Updated dependencies [205077b]
  - @ai-sdk/provider-utils@3.0.0-beta.4

## 3.0.0-beta.7

### Patch Changes

- 314edb2: Add API key authentication support for Amazon Bedrock with Bearer token and automatic SigV4 fallback

## 3.0.0-beta.6

### Patch Changes

- Updated dependencies [05d2819]
  - @ai-sdk/provider-utils@3.0.0-beta.3

## 3.0.0-beta.5

### Patch Changes

- 89eaf5e: Add style parameter support for Amazon Bedrock Nova Canvas image generation

## 3.0.0-beta.4

### Patch Changes

- a10bf62: Fixes "Extra inputs are not permitted" error when using reasoning with Bedrock

## 3.0.0-beta.3

### Patch Changes

- 3593385: fix(bedrock): resolve mime-types of document and images

## 3.0.0-beta.2

### Patch Changes

- d1a034f: feature: using Zod 4 for internal stuff
- Updated dependencies [0571b98]
- Updated dependencies [39a4fab]
- Updated dependencies [d1a034f]
  - @ai-sdk/provider-utils@3.0.0-beta.2

## 3.0.0-beta.1

### Patch Changes

- Updated dependencies [742b7be]
- Updated dependencies [7cddb72]
- Updated dependencies [ccce59b]
- Updated dependencies [e2b9e4b]
- Updated dependencies [45c1ea2]
- Updated dependencies [e025824]
- Updated dependencies [0d06df6]
- Updated dependencies [472524a]
- Updated dependencies [dd3ff01]
- Updated dependencies [7435eb5]
- Updated dependencies [cb68df0]
- Updated dependencies [bfdca8d]
- Updated dependencies [44f4aba]
- Updated dependencies [023ba40]
- Updated dependencies [5e57fae]
- Updated dependencies [71f938d]
- Updated dependencies [28a5ed5]
  - @ai-sdk/provider@2.0.0-beta.1
  - @ai-sdk/provider-utils@3.0.0-beta.1

## 3.0.0-alpha.15

### Patch Changes

- Updated dependencies [48d257a]
- Updated dependencies [8ba77a7]
  - @ai-sdk/provider@2.0.0-alpha.15
  - @ai-sdk/provider-utils@3.0.0-alpha.15

## 3.0.0-alpha.14

### Patch Changes

- Updated dependencies [b5da06a]
- Updated dependencies [63f9e9b]
- Updated dependencies [2e13791]
  - @ai-sdk/provider@2.0.0-alpha.14
  - @ai-sdk/provider-utils@3.0.0-alpha.14

## 3.0.0-alpha.13

### Patch Changes

- Updated dependencies [68ecf2f]
  - @ai-sdk/provider@2.0.0-alpha.13
  - @ai-sdk/provider-utils@3.0.0-alpha.13

## 3.0.0-alpha.12

### Patch Changes

- e2aceaf: feat: add raw chunk support
- Updated dependencies [e2aceaf]
  - @ai-sdk/provider@2.0.0-alpha.12
  - @ai-sdk/provider-utils@3.0.0-alpha.12

## 3.0.0-alpha.11

### Patch Changes

- d546725: fix(provider/amazon-bedrock): use consistent document names for prompt cache effectiveness
- Updated dependencies [c1e6647]
  - @ai-sdk/provider@2.0.0-alpha.11
  - @ai-sdk/provider-utils@3.0.0-alpha.11

## 3.0.0-alpha.10

### Patch Changes

- Updated dependencies [c4df419]
  - @ai-sdk/provider@2.0.0-alpha.10
  - @ai-sdk/provider-utils@3.0.0-alpha.10

## 3.0.0-alpha.9

### Patch Changes

- c87b7e4: feat (provider/amazon-bedrock): add Claude 4 model ids (claude-sonnet-4-20250514-v1:0, claude-opus-4-20250514-v1:0)
- Updated dependencies [811dff3]
  - @ai-sdk/provider@2.0.0-alpha.9
  - @ai-sdk/provider-utils@3.0.0-alpha.9

## 3.0.0-alpha.8

### Patch Changes

- Updated dependencies [4fef487]
- Updated dependencies [9222aeb]
  - @ai-sdk/provider-utils@3.0.0-alpha.8
  - @ai-sdk/provider@2.0.0-alpha.8

## 3.0.0-alpha.7

### Patch Changes

- Updated dependencies [5c56081]
  - @ai-sdk/provider@2.0.0-alpha.7
  - @ai-sdk/provider-utils@3.0.0-alpha.7

## 3.0.0-alpha.6

### Patch Changes

- Updated dependencies [0d2c085]
  - @ai-sdk/provider@2.0.0-alpha.6
  - @ai-sdk/provider-utils@3.0.0-alpha.6

## 3.0.0-alpha.4

### Patch Changes

- Updated dependencies [dc714f3]
  - @ai-sdk/provider@2.0.0-alpha.4
  - @ai-sdk/provider-utils@3.0.0-alpha.4

## 3.0.0-alpha.3

### Patch Changes

- Updated dependencies [6b98118]
  - @ai-sdk/provider@2.0.0-alpha.3
  - @ai-sdk/provider-utils@3.0.0-alpha.3

## 3.0.0-alpha.2

### Patch Changes

- Updated dependencies [26535e0]
  - @ai-sdk/provider@2.0.0-alpha.2
  - @ai-sdk/provider-utils@3.0.0-alpha.2

## 3.0.0-alpha.1

### Patch Changes

- Updated dependencies [3f2f00c]
  - @ai-sdk/provider@2.0.0-alpha.1
  - @ai-sdk/provider-utils@3.0.0-alpha.1

## 3.0.0-canary.19

### Patch Changes

- Updated dependencies [faf8446]
  - @ai-sdk/provider-utils@3.0.0-canary.19

## 3.0.0-canary.18

### Patch Changes

- Updated dependencies [40acf9b]
  - @ai-sdk/provider-utils@3.0.0-canary.18

## 3.0.0-canary.17

### Patch Changes

- Updated dependencies [ea7a7c9]
  - @ai-sdk/provider-utils@3.0.0-canary.17

## 3.0.0-canary.16

### Patch Changes

- Updated dependencies [87b828f]
  - @ai-sdk/provider-utils@3.0.0-canary.16

## 3.0.0-canary.15

### Patch Changes

- a8c8bd5: feat(embed-many): respect supportsParallelCalls & concurrency
- 6f231db: fix(providers): always use optional instead of mix of nullish for providerOptions
- Updated dependencies [a571d6e]
- Updated dependencies [a8c8bd5]
- Updated dependencies [7979f7f]
- Updated dependencies [41fa418]
  - @ai-sdk/provider-utils@3.0.0-canary.15
  - @ai-sdk/provider@2.0.0-canary.14

## 3.0.0-canary.14

### Patch Changes

- Updated dependencies [957b739]
- Updated dependencies [9bd5ab5]
  - @ai-sdk/provider-utils@3.0.0-canary.14
  - @ai-sdk/provider@2.0.0-canary.13

## 3.0.0-canary.13

### Patch Changes

- d9209ca: fix (image-model): `specificationVersion: v1` -> `v2`
- Updated dependencies [7b3ae3f]
- Updated dependencies [0ff02bb]
  - @ai-sdk/provider@2.0.0-canary.12
  - @ai-sdk/provider-utils@3.0.0-canary.13

## 3.0.0-canary.12

### Patch Changes

- Updated dependencies [9bf7291]
- Updated dependencies [4617fab]
- Updated dependencies [e030615]
  - @ai-sdk/provider@2.0.0-canary.11
  - @ai-sdk/provider-utils@3.0.0-canary.12

## 3.0.0-canary.11

### Patch Changes

- 9301f86: refactor (image-model): rename `ImageModelV1` to `ImageModelV2`
- Updated dependencies [66962ed]
- Updated dependencies [9301f86]
- Updated dependencies [a3f768e]
  - @ai-sdk/provider-utils@3.0.0-canary.11
  - @ai-sdk/provider@2.0.0-canary.10

## 3.0.0-canary.10

### Patch Changes

- Updated dependencies [e86be6f]
  - @ai-sdk/provider@2.0.0-canary.9
  - @ai-sdk/provider-utils@3.0.0-canary.10

## 3.0.0-canary.9

### Patch Changes

- 92c0b4b: chore(providers/bedrock): update embedding model to use providerOptions
- Updated dependencies [95857aa]
- Updated dependencies [7ea4132]
  - @ai-sdk/provider@2.0.0-canary.8
  - @ai-sdk/provider-utils@3.0.0-canary.9

## 3.0.0-canary.8

### Patch Changes

- Updated dependencies [5d142ab]
- Updated dependencies [b6b43c7]
- Updated dependencies [8aa9e20]
- Updated dependencies [3795467]
  - @ai-sdk/provider-utils@3.0.0-canary.8
  - @ai-sdk/provider@2.0.0-canary.7

## 3.0.0-canary.7

### Patch Changes

- fa49207: feat(providers/openai-compatible): convert to providerOptions
- 26735b5: chore(embedding-model): add v2 interface
- Updated dependencies [26735b5]
- Updated dependencies [443d8ec]
- Updated dependencies [14c9410]
- Updated dependencies [d9c98f4]
- Updated dependencies [c4a2fec]
- Updated dependencies [0054544]
- Updated dependencies [9e9c809]
- Updated dependencies [32831c6]
- Updated dependencies [d0f9495]
- Updated dependencies [fd65bc6]
- Updated dependencies [393138b]
- Updated dependencies [7182d14]
  - @ai-sdk/provider@2.0.0-canary.6
  - @ai-sdk/provider-utils@3.0.0-canary.7

## 3.0.0-canary.6

### Patch Changes

- 97ea26f: chore(providers/bedrock): convert to providerOptions
- 97ea26f: chore(providers/bedrock): use camelCase for providerOptions
- Updated dependencies [411e483]
- Updated dependencies [79457bd]
- Updated dependencies [ad80501]
- Updated dependencies [1766ede]
- Updated dependencies [f10304b]
  - @ai-sdk/provider@2.0.0-canary.5
  - @ai-sdk/provider-utils@3.0.0-canary.6

## 3.0.0-canary.5

### Patch Changes

- Updated dependencies [6f6bb89]
  - @ai-sdk/provider@2.0.0-canary.4
  - @ai-sdk/provider-utils@3.0.0-canary.5

## 3.0.0-canary.4

### Patch Changes

- Updated dependencies [d1a1aa1]
  - @ai-sdk/provider@2.0.0-canary.3
  - @ai-sdk/provider-utils@3.0.0-canary.4

## 3.0.0-canary.3

### Patch Changes

- Updated dependencies [a166433]
- Updated dependencies [abf9a79]
- Updated dependencies [9f95b35]
- Updated dependencies [0a87932]
- Updated dependencies [6dc848c]
  - @ai-sdk/provider-utils@3.0.0-canary.3
  - @ai-sdk/provider@2.0.0-canary.2

## 3.0.0-canary.2

### Patch Changes

- Updated dependencies [c57e248]
- Updated dependencies [33f4a6a]
  - @ai-sdk/provider@2.0.0-canary.1
  - @ai-sdk/provider-utils@3.0.0-canary.2

## 3.0.0-canary.1

### Patch Changes

- Updated dependencies [060370c]
- Updated dependencies [0c0c0b3]
- Updated dependencies [63d791d]
  - @ai-sdk/provider-utils@3.0.0-canary.1

## 3.0.0-canary.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- Updated dependencies [d5f588f]
  - @ai-sdk/provider-utils@3.0.0-canary.0
  - @ai-sdk/provider@2.0.0-canary.0

## 2.2.4

### Patch Changes

- Updated dependencies [28be004]
  - @ai-sdk/provider-utils@2.2.3

## 2.2.3

### Patch Changes

- Updated dependencies [b01120e]
  - @ai-sdk/provider-utils@2.2.2

## 2.2.2

### Patch Changes

- 2085e59: feat (provider/amazon-bedrock): support tool results with image parts

## 2.2.1

### Patch Changes

- Updated dependencies [f10f0fa]
  - @ai-sdk/provider-utils@2.2.1

## 2.2.0

### Minor Changes

- 5bc638d: AI SDK 4.2

### Patch Changes

- Updated dependencies [5bc638d]
  - @ai-sdk/provider@1.1.0
  - @ai-sdk/provider-utils@2.2.0

## 2.1.6

### Patch Changes

- Updated dependencies [d0c4659]
  - @ai-sdk/provider-utils@2.1.15

## 2.1.5

### Patch Changes

- Updated dependencies [0bd5bc6]
  - @ai-sdk/provider@1.0.12
  - @ai-sdk/provider-utils@2.1.14

## 2.1.4

### Patch Changes

- d65df9d: feat (provider/amazon-bedrock): support AWS credential providers

## 2.1.3

### Patch Changes

- Updated dependencies [2e1101a]
  - @ai-sdk/provider@1.0.11
  - @ai-sdk/provider-utils@2.1.13

## 2.1.2

### Patch Changes

- Updated dependencies [1531959]
  - @ai-sdk/provider-utils@2.1.12

## 2.1.1

### Patch Changes

- a841484: fix (provider/bedrock): support budgetTokens

## 2.1.0

### Minor Changes

- cf7d818: feat (providers/amazon-bedrock): Add reasoning support to amazon-bedrock

## 2.0.6

### Patch Changes

- Updated dependencies [e1d3d42]
  - @ai-sdk/provider@1.0.10
  - @ai-sdk/provider-utils@2.1.11

## 2.0.5

### Patch Changes

- 58c3411: feat (provider/amazon-bedrock): add generate image support for Amazon Nova Canvas

## 2.0.4

### Patch Changes

- Updated dependencies [ddf9740]
  - @ai-sdk/provider@1.0.9
  - @ai-sdk/provider-utils@2.1.10

## 2.0.3

### Patch Changes

- d1475de: feat (provider/amazon-bedrock): add support for cache points

## 2.0.2

### Patch Changes

- Updated dependencies [2761f06]
  - @ai-sdk/provider@1.0.8
  - @ai-sdk/provider-utils@2.1.9

## 2.0.1

### Patch Changes

- Updated dependencies [2e898b4]
  - @ai-sdk/provider-utils@2.1.8

## 2.0.0

### Major Changes

- 3ff4ef8: feat (provider/amazon-bedrock): remove dependence on AWS SDK Bedrock client library

### Patch Changes

- Updated dependencies [3ff4ef8]
  - @ai-sdk/provider-utils@2.1.7

## 1.1.6

### Patch Changes

- Updated dependencies [d89c3b9]
  - @ai-sdk/provider@1.0.7
  - @ai-sdk/provider-utils@2.1.6

## 1.1.5

### Patch Changes

- Updated dependencies [3a602ca]
  - @ai-sdk/provider-utils@2.1.5

## 1.1.4

### Patch Changes

- Updated dependencies [066206e]
  - @ai-sdk/provider-utils@2.1.4

## 1.1.3

### Patch Changes

- Updated dependencies [39e5c1f]
  - @ai-sdk/provider-utils@2.1.3

## 1.1.2

### Patch Changes

- Updated dependencies [ed012d2]
- Updated dependencies [3a58a2e]
  - @ai-sdk/provider-utils@2.1.2
  - @ai-sdk/provider@1.0.6

## 1.1.1

### Patch Changes

- Updated dependencies [e7a9ec9]
- Updated dependencies [0a699f1]
  - @ai-sdk/provider-utils@2.1.1
  - @ai-sdk/provider@1.0.5

## 1.1.0

### Minor Changes

- 62ba5ad: release: AI SDK 4.1

### Patch Changes

- Updated dependencies [62ba5ad]
  - @ai-sdk/provider-utils@2.1.0

## 1.0.9

### Patch Changes

- Updated dependencies [00114c5]
  - @ai-sdk/provider-utils@2.0.8

## 1.0.8

### Patch Changes

- Updated dependencies [90fb95a]
- Updated dependencies [e6dfef4]
- Updated dependencies [6636db6]
  - @ai-sdk/provider-utils@2.0.7

## 1.0.7

### Patch Changes

- Updated dependencies [19a2ce7]
- Updated dependencies [19a2ce7]
- Updated dependencies [6337688]
  - @ai-sdk/provider@1.0.4
  - @ai-sdk/provider-utils@2.0.6

## 1.0.6

### Patch Changes

- 5ed5e45: chore (config): Use ts-library.json tsconfig for no-UI libs.
- Updated dependencies [5ed5e45]
  - @ai-sdk/provider-utils@2.0.5
  - @ai-sdk/provider@1.0.3

## 1.0.5

### Patch Changes

- Updated dependencies [09a9cab]
  - @ai-sdk/provider@1.0.2
  - @ai-sdk/provider-utils@2.0.4

## 1.0.4

### Patch Changes

- Updated dependencies [0984f0b]
  - @ai-sdk/provider-utils@2.0.3

## 1.0.3

### Patch Changes

- Updated dependencies [b446ae5]
  - @ai-sdk/provider@1.0.1
  - @ai-sdk/provider-utils@2.0.2

## 1.0.2

### Patch Changes

- b748dfb: feat (providers): update model lists

## 1.0.1

### Patch Changes

- Updated dependencies [c3ab5de]
  - @ai-sdk/provider-utils@2.0.1

## 1.0.0

### Major Changes

- 66060f7: chore (release): bump major version to 4.0

### Patch Changes

- Updated dependencies [b469a7e]
- Updated dependencies [dce4158]
- Updated dependencies [c0ddc24]
- Updated dependencies [b1da952]
- Updated dependencies [dce4158]
- Updated dependencies [8426f55]
- Updated dependencies [db46ce5]
  - @ai-sdk/provider-utils@2.0.0
  - @ai-sdk/provider@1.0.0

## 1.0.0-canary.3

### Patch Changes

- Updated dependencies [8426f55]
  - @ai-sdk/provider-utils@2.0.0-canary.3

## 1.0.0-canary.2

### Patch Changes

- Updated dependencies [dce4158]
- Updated dependencies [dce4158]
  - @ai-sdk/provider-utils@2.0.0-canary.2

## 1.0.0-canary.1

### Patch Changes

- Updated dependencies [b1da952]
  - @ai-sdk/provider-utils@2.0.0-canary.1

## 1.0.0-canary.0

### Major Changes

- 66060f7: chore (release): bump major version to 4.0

### Patch Changes

- Updated dependencies [b469a7e]
- Updated dependencies [c0ddc24]
- Updated dependencies [db46ce5]
  - @ai-sdk/provider-utils@2.0.0-canary.0
  - @ai-sdk/provider@1.0.0-canary.0

## 0.0.36

### Patch Changes

- e6042b1: feat (provider/anthropic): add haiku 3.5 model ids

## 0.0.35

### Patch Changes

- ac380e3: fix (provider/anthropic): continuation mode with 3+ steps

## 0.0.34

### Patch Changes

- b01bbb7: fix (provider/bedrock): tool calling broken w/ sonnet 3.5

## 0.0.33

### Patch Changes

- bc0ffc5: feat (provider/bedrock): add file content part support

## 0.0.32

### Patch Changes

- 3b1b69a: feat: provider-defined tools
- Updated dependencies [aa98cdb]
- Updated dependencies [1486128]
- Updated dependencies [7b937c5]
- Updated dependencies [3b1b69a]
- Updated dependencies [811a317]
  - @ai-sdk/provider-utils@1.0.22
  - @ai-sdk/provider@0.0.26

## 0.0.31

### Patch Changes

- Updated dependencies [b9b0d7b]
  - @ai-sdk/provider@0.0.25
  - @ai-sdk/provider-utils@1.0.21

## 0.0.30

### Patch Changes

- 59d1abf: feat (provider/bedrock): support Bedrock amazon.titan-embed-text-v1 and amazon.titan-embed-text-v2:0 embeddings

## 0.0.29

### Patch Changes

- 8c3847e: fix (provider/bedrock): update amazon bedrock package to use safe version of aws sdk

## 0.0.28

### Patch Changes

- Updated dependencies [d595d0d]
  - @ai-sdk/provider@0.0.24
  - @ai-sdk/provider-utils@1.0.20

## 0.0.27

### Patch Changes

- 8a15307: fix (provider/bedrock): support assistant messages with trailing whitespace

## 0.0.26

### Patch Changes

- 8f080f4: fix (provider/bedrock): support parallel tool calls in streaming mode

## 0.0.25

### Patch Changes

- Updated dependencies [273f696]
  - @ai-sdk/provider-utils@1.0.19

## 0.0.24

### Patch Changes

- 01fc6c0: feat (provider/amazon-bedrock): support guardrails

## 0.0.23

### Patch Changes

- Updated dependencies [03313cd]
- Updated dependencies [3be7c1c]
  - @ai-sdk/provider-utils@1.0.18
  - @ai-sdk/provider@0.0.23

## 0.0.22

### Patch Changes

- c434799: feat (provider/bedrock): support multiple leading system messages

## 0.0.21

### Patch Changes

- 26515cb: feat (ai/provider): introduce ProviderV1 specification
- Updated dependencies [26515cb]
  - @ai-sdk/provider@0.0.22
  - @ai-sdk/provider-utils@1.0.17

## 0.0.20

### Patch Changes

- Updated dependencies [09f895f]
  - @ai-sdk/provider-utils@1.0.16

## 0.0.19

### Patch Changes

- d67fa9c: feat (provider/amazon-bedrock): add support for session tokens
- Updated dependencies [d67fa9c]
  - @ai-sdk/provider-utils@1.0.15

## 0.0.18

### Patch Changes

- Updated dependencies [f2c025e]
  - @ai-sdk/provider@0.0.21
  - @ai-sdk/provider-utils@1.0.14

## 0.0.17

### Patch Changes

- Updated dependencies [6ac355e]
  - @ai-sdk/provider@0.0.20
  - @ai-sdk/provider-utils@1.0.13

## 0.0.16

### Patch Changes

- Updated dependencies [dd712ac]
  - @ai-sdk/provider-utils@1.0.12

## 0.0.15

### Patch Changes

- 89b18ca: fix (ai/provider): send finish reason 'unknown' by default
- Updated dependencies [dd4a0f5]
  - @ai-sdk/provider@0.0.19
  - @ai-sdk/provider-utils@1.0.11

## 0.0.14

### Patch Changes

- Updated dependencies [4bd27a9]
- Updated dependencies [845754b]
  - @ai-sdk/provider-utils@1.0.10
  - @ai-sdk/provider@0.0.18

## 0.0.13

### Patch Changes

- Updated dependencies [029af4c]
  - @ai-sdk/provider@0.0.17
  - @ai-sdk/provider-utils@1.0.9

## 0.0.12

### Patch Changes

- Updated dependencies [d58517b]
  - @ai-sdk/provider@0.0.16
  - @ai-sdk/provider-utils@1.0.8

## 0.0.11

### Patch Changes

- Updated dependencies [96aed25]
  - @ai-sdk/provider@0.0.15
  - @ai-sdk/provider-utils@1.0.7

## 0.0.10

### Patch Changes

- Updated dependencies [9614584]
- Updated dependencies [0762a22]
  - @ai-sdk/provider-utils@1.0.6

## 0.0.9

### Patch Changes

- a8d1c9e9: feat (ai/core): parallel image download
- Updated dependencies [a8d1c9e9]
  - @ai-sdk/provider-utils@1.0.5
  - @ai-sdk/provider@0.0.14

## 0.0.8

### Patch Changes

- Updated dependencies [4f88248f]
  - @ai-sdk/provider-utils@1.0.4

## 0.0.7

### Patch Changes

- 2b9da0f0: feat (core): support stopSequences setting.
- a5b58845: feat (core): support topK setting
- 4aa8deb3: feat (provider): support responseFormat setting in provider api
- 13b27ec6: chore (ai/core): remove grammar mode
- Updated dependencies [2b9da0f0]
- Updated dependencies [a5b58845]
- Updated dependencies [4aa8deb3]
- Updated dependencies [13b27ec6]
  - @ai-sdk/provider@0.0.13
  - @ai-sdk/provider-utils@1.0.3

## 0.0.6

### Patch Changes

- 42b11b8e: fix (provider/aws-bedrock): pass tool parameters for object generation without stringify

## 0.0.5

### Patch Changes

- Updated dependencies [b7290943]
  - @ai-sdk/provider@0.0.12
  - @ai-sdk/provider-utils@1.0.2

## 0.0.4

### Patch Changes

- Updated dependencies [d481729f]
  - @ai-sdk/provider-utils@1.0.1

## 0.0.3

### Patch Changes

- 5edc6110: feat (ai/core): add custom request header support
- Updated dependencies [5edc6110]
- Updated dependencies [5edc6110]
- Updated dependencies [5edc6110]
  - @ai-sdk/provider@0.0.11
  - @ai-sdk/provider-utils@1.0.0

## 0.0.2

### Patch Changes

- 542a2b28: feat (@ai-sdk/bedrock): support custom bedrock configuration

## 0.0.1

### Patch Changes

- 02f6a088: feat (@ai-sdk/amazon-bedrock): add Amazon Bedrock provider
- Updated dependencies [02f6a088]
  - @ai-sdk/provider-utils@0.0.16
