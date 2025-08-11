# @ai-sdk/google-vertex

## 3.0.5

### Patch Changes

- Updated dependencies [961dda1]
  - @ai-sdk/google@2.0.4

## 3.0.4

### Patch Changes

- Updated dependencies [9fb0252]
  - @ai-sdk/google@2.0.3

## 3.0.3

### Patch Changes

- Updated dependencies [90d212f]
  - @ai-sdk/provider-utils@3.0.1
  - @ai-sdk/anthropic@2.0.1
  - @ai-sdk/google@2.0.2

## 3.0.2

### Patch Changes

- b9cd900: feat(providers/google-vertex) Add TaskType support for Text Embedding Model
- Updated dependencies [f5464aa]
  - @ai-sdk/google@2.0.1

## 3.0.1

### Patch Changes

- 11e3ba4: Make revisedPrompt nullish in schema

## 3.0.0

### Major Changes

- d5f588f: AI SDK 5
- 516be5b: ### Move Image Model Settings into generate options

  Image Models no longer have settings. Instead, `maxImagesPerCall` can be passed directly to `generateImage()`. All other image settings can be passed to `providerOptions[provider]`.

  Before

  ```js
  await generateImage({
    model: luma.image('photon-flash-1', {
      maxImagesPerCall: 5,
      pollIntervalMillis: 500,
    }),
    prompt,
    n: 10,
  });
  ```

  After

  ```js
  await generateImage({
    model: luma.image('photon-flash-1'),
    prompt,
    n: 10,
    maxImagesPerCall: 5,
    providerOptions: {
      luma: { pollIntervalMillis: 5 },
    },
  });
  ```

  Pull Request: https://github.com/vercel/ai/pull/6180

### Minor Changes

- 6ca44f2: Fixed global region for vertex provider

### Patch Changes

- 8e171f5: feat (provider/google-vertex): add imagen-3.0-generate-002
- cea5997: chore(providers/google-vertex): update embedding model to use providerOptions
- 9ccce3a: feat (google-vertex): Set `.providerMetaData` for image model responses
- e2aceaf: feat: add raw chunk support
- 26735b5: chore(embedding-model): add v2 interface
- 443d8ec: feat(embedding-model-v2): add response body field
- 5c9eec4: chore(providers/anthropic): switch to providerOptions
- 66962ed: fix(packages): export node10 compatible types
- d9209ca: fix (image-model): `specificationVersion: v1` -> `v2`
- 9301f86: refactor (image-model): rename `ImageModelV1` to `ImageModelV2`
- 7378473: chore(providers/google): switch to providerOptions
- 779d916: feat: add provider option schemas for vertex imagegen and google genai
- 91715e5: fix (provider/google-vertex): fix anthropic support for image urls in messages
- d1a034f: feature: using Zod 4 for internal stuff
- fd65bc6: chore(embedding-model-v2): rename rawResponse to response
- 205077b: fix: improve Zod compatibility
- bb13f18: Add reasoning token output support for gemini models via Vertex AI Provider
- Updated dependencies [a571d6e]
- Updated dependencies [742b7be]
- Updated dependencies [e7fcc86]
- Updated dependencies [78e7fa9]
- Updated dependencies [7cddb72]
- Updated dependencies [ccce59b]
- Updated dependencies [e2b9e4b]
- Updated dependencies [95857aa]
- Updated dependencies [45c1ea2]
- Updated dependencies [6f6bb89]
- Updated dependencies [ad66c0e]
- Updated dependencies [f916255]
- Updated dependencies [060370c]
- Updated dependencies [dc714f3]
- Updated dependencies [b5da06a]
- Updated dependencies [8f2854f]
- Updated dependencies [d1a1aa1]
- Updated dependencies [63f9e9b]
- Updated dependencies [5d142ab]
- Updated dependencies [d5f588f]
- Updated dependencies [e025824]
- Updated dependencies [19a4336]
- Updated dependencies [0571b98]
- Updated dependencies [5d959e7]
- Updated dependencies [8af9e03]
- Updated dependencies [b6b43c7]
- Updated dependencies [4fef487]
- Updated dependencies [48d257a]
- Updated dependencies [0c0c0b3]
- Updated dependencies [0d2c085]
- Updated dependencies [1a635b5]
- Updated dependencies [40acf9b]
- Updated dependencies [888b750]
- Updated dependencies [9222aeb]
- Updated dependencies [3259565]
- Updated dependencies [8dfcb11]
- Updated dependencies [9f73965]
- Updated dependencies [e2aceaf]
- Updated dependencies [411e483]
- Updated dependencies [8ba77a7]
- Updated dependencies [fdff8a4]
- Updated dependencies [eb173f1]
- Updated dependencies [4f26d59]
- Updated dependencies [25f3454]
- Updated dependencies [6a16dcf]
- Updated dependencies [a85c85f]
- Updated dependencies [7b3ae3f]
- Updated dependencies [a166433]
- Updated dependencies [26735b5]
- Updated dependencies [5cf30ea]
- Updated dependencies [443d8ec]
- Updated dependencies [5c9eec4]
- Updated dependencies [a8c8bd5]
- Updated dependencies [abf9a79]
- Updated dependencies [14c9410]
- Updated dependencies [e86be6f]
- Updated dependencies [9bf7291]
- Updated dependencies [c68931f]
- Updated dependencies [2e13791]
- Updated dependencies [9f95b35]
- Updated dependencies [66962ed]
- Updated dependencies [0d06df6]
- Updated dependencies [472524a]
- Updated dependencies [dd3ff01]
- Updated dependencies [a313780]
- Updated dependencies [d9c98f4]
- Updated dependencies [05d2819]
- Updated dependencies [9301f86]
- Updated dependencies [fd98925]
- Updated dependencies [0a87932]
- Updated dependencies [c4a2fec]
- Updated dependencies [957b739]
- Updated dependencies [79457bd]
- Updated dependencies [a3f768e]
- Updated dependencies [cb787ac]
- Updated dependencies [7378473]
- Updated dependencies [7435eb5]
- Updated dependencies [f07a6d4]
- Updated dependencies [8aa9e20]
- Updated dependencies [4617fab]
- Updated dependencies [075711d]
- Updated dependencies [75f03b1]
- Updated dependencies [779d916]
- Updated dependencies [ac34802]
- Updated dependencies [0054544]
- Updated dependencies [269683f]
- Updated dependencies [581a9be]
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
- Updated dependencies [2e06f14]
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
- Updated dependencies [8e6b69d]
- Updated dependencies [42fcd32]
- Updated dependencies [d1a034f]
- Updated dependencies [5c56081]
- Updated dependencies [fd65bc6]
- Updated dependencies [023ba40]
- Updated dependencies [ea7a7c9]
- Updated dependencies [26535e0]
- Updated dependencies [e030615]
- Updated dependencies [6392f60]
- Updated dependencies [878bf45]
- Updated dependencies [5e57fae]
- Updated dependencies [393138b]
- Updated dependencies [c57e248]
- Updated dependencies [0f05690]
- Updated dependencies [7badba2]
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
  - @ai-sdk/google@2.0.0
  - @ai-sdk/anthropic@2.0.0

## 3.0.0-beta.21

### Patch Changes

- Updated dependencies [88a8ee5]
  - @ai-sdk/provider-utils@3.0.0-beta.10
  - @ai-sdk/anthropic@2.0.0-beta.13
  - @ai-sdk/google@2.0.0-beta.19

## 3.0.0-beta.20

### Patch Changes

- Updated dependencies [78e7fa9]
- Updated dependencies [0f05690]
- Updated dependencies [f418dd7]
- Updated dependencies [27deb4d]
  - @ai-sdk/google@2.0.0-beta.18
  - @ai-sdk/anthropic@2.0.0-beta.12
  - @ai-sdk/provider@2.0.0-beta.2
  - @ai-sdk/provider-utils@3.0.0-beta.9

## 3.0.0-beta.19

### Patch Changes

- Updated dependencies [eb173f1]
- Updated dependencies [dd5fd43]
  - @ai-sdk/anthropic@2.0.0-beta.11
  - @ai-sdk/google@2.0.0-beta.17
  - @ai-sdk/provider-utils@3.0.0-beta.8

## 3.0.0-beta.18

### Patch Changes

- Updated dependencies [e7fcc86]
- Updated dependencies [269683f]
  - @ai-sdk/provider-utils@3.0.0-beta.7
  - @ai-sdk/anthropic@2.0.0-beta.10
  - @ai-sdk/google@2.0.0-beta.16

## 3.0.0-beta.17

### Patch Changes

- Updated dependencies [4f26d59]
- Updated dependencies [ac34802]
- Updated dependencies [a753b3a]
  - @ai-sdk/anthropic@2.0.0-beta.9
  - @ai-sdk/provider-utils@3.0.0-beta.6
  - @ai-sdk/google@2.0.0-beta.15

## 3.0.0-beta.16

### Patch Changes

- Updated dependencies [75f03b1]
  - @ai-sdk/google@2.0.0-beta.14

## 3.0.0-beta.15

### Patch Changes

- Updated dependencies [57edfcb]
- Updated dependencies [383cbfa]
  - @ai-sdk/provider-utils@3.0.0-beta.5
  - @ai-sdk/anthropic@2.0.0-beta.8
  - @ai-sdk/google@2.0.0-beta.13

## 3.0.0-beta.14

### Patch Changes

- 205077b: fix: improve Zod compatibility
- Updated dependencies [205077b]
  - @ai-sdk/provider-utils@3.0.0-beta.4
  - @ai-sdk/anthropic@2.0.0-beta.7
  - @ai-sdk/google@2.0.0-beta.12

## 3.0.0-beta.13

### Patch Changes

- Updated dependencies [6a16dcf]
  - @ai-sdk/google@2.0.0-beta.11

## 3.0.0-beta.12

### Minor Changes

- 6ca44f2: Fixed global region for vertex provider

### Patch Changes

- Updated dependencies [05d2819]
- Updated dependencies [7badba2]
  - @ai-sdk/provider-utils@3.0.0-beta.3
  - @ai-sdk/google@2.0.0-beta.10
  - @ai-sdk/anthropic@2.0.0-beta.6

## 3.0.0-beta.11

### Patch Changes

- Updated dependencies [8af9e03]
  - @ai-sdk/google@2.0.0-beta.9

## 3.0.0-beta.10

### Patch Changes

- Updated dependencies [b9ddcdd]
  - @ai-sdk/anthropic@2.0.0-beta.5

## 3.0.0-beta.9

### Patch Changes

- Updated dependencies [2e06f14]
  - @ai-sdk/google@2.0.0-beta.8

## 3.0.0-beta.8

### Patch Changes

- Updated dependencies [19a4336]
  - @ai-sdk/google@2.0.0-beta.7

## 3.0.0-beta.7

### Patch Changes

- Updated dependencies [fdff8a4]
- Updated dependencies [84577c8]
  - @ai-sdk/anthropic@2.0.0-beta.4

## 3.0.0-beta.6

### Patch Changes

- Updated dependencies [878bf45]
  - @ai-sdk/google@2.0.0-beta.6

## 3.0.0-beta.5

### Patch Changes

- Updated dependencies [42fcd32]
  - @ai-sdk/google@2.0.0-beta.5

## 3.0.0-beta.4

### Patch Changes

- Updated dependencies [c68931f]
- Updated dependencies [8e6b69d]
  - @ai-sdk/google@2.0.0-beta.4

## 3.0.0-beta.3

### Patch Changes

- d1a034f: feature: using Zod 4 for internal stuff
- Updated dependencies [0571b98]
- Updated dependencies [a85c85f]
- Updated dependencies [cb787ac]
- Updated dependencies [39a4fab]
- Updated dependencies [d1a034f]
- Updated dependencies [0b678b2]
  - @ai-sdk/provider-utils@3.0.0-beta.2
  - @ai-sdk/anthropic@2.0.0-beta.3
  - @ai-sdk/google@2.0.0-beta.3

## 3.0.0-beta.2

### Patch Changes

- Updated dependencies [a313780]
- Updated dependencies [d601ed9]
  - @ai-sdk/google@2.0.0-beta.2
  - @ai-sdk/anthropic@2.0.0-beta.2

## 3.0.0-beta.1

### Patch Changes

- Updated dependencies [742b7be]
- Updated dependencies [7cddb72]
- Updated dependencies [ccce59b]
- Updated dependencies [e2b9e4b]
- Updated dependencies [45c1ea2]
- Updated dependencies [8f2854f]
- Updated dependencies [e025824]
- Updated dependencies [5d959e7]
- Updated dependencies [9f73965]
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
- Updated dependencies [399e056]
  - @ai-sdk/provider@2.0.0-beta.1
  - @ai-sdk/provider-utils@3.0.0-beta.1
  - @ai-sdk/anthropic@2.0.0-beta.1
  - @ai-sdk/google@2.0.0-beta.1

## 3.0.0-alpha.15

### Patch Changes

- Updated dependencies [48d257a]
- Updated dependencies [8ba77a7]
  - @ai-sdk/provider@2.0.0-alpha.15
  - @ai-sdk/provider-utils@3.0.0-alpha.15
  - @ai-sdk/anthropic@2.0.0-alpha.15
  - @ai-sdk/google@2.0.0-alpha.15

## 3.0.0-alpha.14

### Patch Changes

- Updated dependencies [b5da06a]
- Updated dependencies [63f9e9b]
- Updated dependencies [2e13791]
- Updated dependencies [6392f60]
  - @ai-sdk/provider@2.0.0-alpha.14
  - @ai-sdk/anthropic@2.0.0-alpha.14
  - @ai-sdk/google@2.0.0-alpha.14
  - @ai-sdk/provider-utils@3.0.0-alpha.14

## 3.0.0-alpha.13

### Patch Changes

- Updated dependencies [8dfcb11]
- Updated dependencies [68ecf2f]
- Updated dependencies [ee5a9c0]
  - @ai-sdk/anthropic@2.0.0-alpha.13
  - @ai-sdk/provider@2.0.0-alpha.13
  - @ai-sdk/google@2.0.0-alpha.13
  - @ai-sdk/provider-utils@3.0.0-alpha.13

## 3.0.0-alpha.12

### Patch Changes

- e2aceaf: feat: add raw chunk support
- Updated dependencies [e2aceaf]
  - @ai-sdk/anthropic@2.0.0-alpha.12
  - @ai-sdk/google@2.0.0-alpha.12
  - @ai-sdk/provider@2.0.0-alpha.12
  - @ai-sdk/provider-utils@3.0.0-alpha.12

## 3.0.0-alpha.11

### Patch Changes

- Updated dependencies [25f3454]
- Updated dependencies [c1e6647]
  - @ai-sdk/anthropic@2.0.0-alpha.11
  - @ai-sdk/provider@2.0.0-alpha.11
  - @ai-sdk/google@2.0.0-alpha.11
  - @ai-sdk/provider-utils@3.0.0-alpha.11

## 3.0.0-alpha.10

### Patch Changes

- bb13f18: Add reasoning token output support for gemini models via Vertex AI Provider
- Updated dependencies [581a9be]
- Updated dependencies [c4df419]
  - @ai-sdk/google@2.0.0-alpha.10
  - @ai-sdk/provider@2.0.0-alpha.10
  - @ai-sdk/anthropic@2.0.0-alpha.10
  - @ai-sdk/provider-utils@3.0.0-alpha.10

## 3.0.0-alpha.9

### Patch Changes

- Updated dependencies [362b048]
- Updated dependencies [811dff3]
  - @ai-sdk/anthropic@2.0.0-alpha.9
  - @ai-sdk/provider@2.0.0-alpha.9
  - @ai-sdk/google@2.0.0-alpha.9
  - @ai-sdk/provider-utils@3.0.0-alpha.9

## 3.0.0-alpha.8

### Patch Changes

- Updated dependencies [ad66c0e]
- Updated dependencies [4fef487]
- Updated dependencies [1a635b5]
- Updated dependencies [9222aeb]
- Updated dependencies [075711d]
  - @ai-sdk/anthropic@2.0.0-alpha.8
  - @ai-sdk/provider-utils@3.0.0-alpha.8
  - @ai-sdk/google@2.0.0-alpha.8
  - @ai-sdk/provider@2.0.0-alpha.8

## 3.0.0-alpha.7

### Patch Changes

- Updated dependencies [5c56081]
  - @ai-sdk/provider@2.0.0-alpha.7
  - @ai-sdk/anthropic@2.0.0-alpha.7
  - @ai-sdk/google@2.0.0-alpha.7
  - @ai-sdk/provider-utils@3.0.0-alpha.7

## 3.0.0-alpha.6

### Patch Changes

- Updated dependencies [0d2c085]
  - @ai-sdk/provider@2.0.0-alpha.6
  - @ai-sdk/anthropic@2.0.0-alpha.6
  - @ai-sdk/google@2.0.0-alpha.6
  - @ai-sdk/provider-utils@3.0.0-alpha.6

## 3.0.0-alpha.4

### Patch Changes

- 9ccce3a: feat (google-vertex): Set `.providerMetaData` for image model responses
- Updated dependencies [dc714f3]
- Updated dependencies [ca8aac6]
  - @ai-sdk/provider@2.0.0-alpha.4
  - @ai-sdk/anthropic@2.0.0-alpha.4
  - @ai-sdk/google@2.0.0-alpha.4
  - @ai-sdk/provider-utils@3.0.0-alpha.4

## 3.0.0-alpha.3

### Patch Changes

- Updated dependencies [6b98118]
  - @ai-sdk/provider@2.0.0-alpha.3
  - @ai-sdk/anthropic@2.0.0-alpha.3
  - @ai-sdk/google@2.0.0-alpha.3
  - @ai-sdk/provider-utils@3.0.0-alpha.3

## 3.0.0-alpha.2

### Patch Changes

- Updated dependencies [26535e0]
  - @ai-sdk/provider@2.0.0-alpha.2
  - @ai-sdk/anthropic@2.0.0-alpha.2
  - @ai-sdk/google@2.0.0-alpha.2
  - @ai-sdk/provider-utils@3.0.0-alpha.2

## 3.0.0-alpha.1

### Patch Changes

- Updated dependencies [3f2f00c]
  - @ai-sdk/provider@2.0.0-alpha.1
  - @ai-sdk/anthropic@2.0.0-alpha.1
  - @ai-sdk/google@2.0.0-alpha.1
  - @ai-sdk/provider-utils@3.0.0-alpha.1

## 3.0.0-canary.20

### Patch Changes

- Updated dependencies [faf8446]
  - @ai-sdk/provider-utils@3.0.0-canary.19
  - @ai-sdk/anthropic@2.0.0-canary.19
  - @ai-sdk/google@2.0.0-canary.20

## 3.0.0-canary.19

### Patch Changes

- Updated dependencies [40acf9b]
  - @ai-sdk/provider-utils@3.0.0-canary.18
  - @ai-sdk/anthropic@2.0.0-canary.18
  - @ai-sdk/google@2.0.0-canary.19

## 3.0.0-canary.18

### Major Changes

- 516be5b: ### Move Image Model Settings into generate options

  Image Models no longer have settings. Instead, `maxImagesPerCall` can be passed directly to `generateImage()`. All other image settings can be passed to `providerOptions[provider]`.

  Before

  ```js
  await generateImage({
    model: luma.image('photon-flash-1', {
      maxImagesPerCall: 5,
      pollIntervalMillis: 500,
    }),
    prompt,
    n: 10,
  });
  ```

  After

  ```js
  await generateImage({
    model: luma.image('photon-flash-1'),
    prompt,
    n: 10,
    maxImagesPerCall: 5,
    providerOptions: {
      luma: { pollIntervalMillis: 5 },
    },
  });
  ```

  Pull Request: https://github.com/vercel/ai/pull/6180

### Patch Changes

- Updated dependencies [f07a6d4]
- Updated dependencies [ea7a7c9]
  - @ai-sdk/google@2.0.0-canary.18
  - @ai-sdk/provider-utils@3.0.0-canary.17
  - @ai-sdk/anthropic@2.0.0-canary.17

## 3.0.0-canary.17

### Patch Changes

- Updated dependencies [87b828f]
  - @ai-sdk/provider-utils@3.0.0-canary.16
  - @ai-sdk/anthropic@2.0.0-canary.16
  - @ai-sdk/google@2.0.0-canary.17

## 3.0.0-canary.16

### Patch Changes

- Updated dependencies [a571d6e]
- Updated dependencies [a8c8bd5]
- Updated dependencies [7979f7f]
- Updated dependencies [41fa418]
  - @ai-sdk/provider-utils@3.0.0-canary.15
  - @ai-sdk/provider@2.0.0-canary.14
  - @ai-sdk/anthropic@2.0.0-canary.15
  - @ai-sdk/google@2.0.0-canary.16

## 3.0.0-canary.15

### Patch Changes

- Updated dependencies [957b739]
- Updated dependencies [9bd5ab5]
  - @ai-sdk/provider-utils@3.0.0-canary.14
  - @ai-sdk/provider@2.0.0-canary.13
  - @ai-sdk/anthropic@2.0.0-canary.14
  - @ai-sdk/google@2.0.0-canary.15

## 3.0.0-canary.14

### Patch Changes

- 8e171f5: feat (provider/google-vertex): add imagen-3.0-generate-002
- d9209ca: fix (image-model): `specificationVersion: v1` -> `v2`
- Updated dependencies [f916255]
- Updated dependencies [7b3ae3f]
- Updated dependencies [0ff02bb]
  - @ai-sdk/google@2.0.0-canary.14
  - @ai-sdk/provider@2.0.0-canary.12
  - @ai-sdk/provider-utils@3.0.0-canary.13
  - @ai-sdk/anthropic@2.0.0-canary.13

## 3.0.0-canary.13

### Patch Changes

- 5c9eec4: chore(providers/anthropic): switch to providerOptions
- 7378473: chore(providers/google): switch to providerOptions
- Updated dependencies [5c9eec4]
- Updated dependencies [9bf7291]
- Updated dependencies [7378473]
- Updated dependencies [4617fab]
- Updated dependencies [e030615]
  - @ai-sdk/anthropic@2.0.0-canary.12
  - @ai-sdk/provider@2.0.0-canary.11
  - @ai-sdk/google@2.0.0-canary.13
  - @ai-sdk/provider-utils@3.0.0-canary.12

## 3.0.0-canary.12

### Patch Changes

- 66962ed: fix(packages): export node10 compatible types
- 9301f86: refactor (image-model): rename `ImageModelV1` to `ImageModelV2`
- Updated dependencies [888b750]
- Updated dependencies [66962ed]
- Updated dependencies [9301f86]
- Updated dependencies [a3f768e]
  - @ai-sdk/google@2.0.0-canary.12
  - @ai-sdk/provider-utils@3.0.0-canary.11
  - @ai-sdk/anthropic@2.0.0-canary.11
  - @ai-sdk/provider@2.0.0-canary.10

## 3.0.0-canary.11

### Patch Changes

- Updated dependencies [e86be6f]
  - @ai-sdk/provider@2.0.0-canary.9
  - @ai-sdk/anthropic@2.0.0-canary.10
  - @ai-sdk/google@2.0.0-canary.11
  - @ai-sdk/provider-utils@3.0.0-canary.10

## 3.0.0-canary.10

### Patch Changes

- cea5997: chore(providers/google-vertex): update embedding model to use providerOptions
- Updated dependencies [95857aa]
- Updated dependencies [3259565]
- Updated dependencies [fd98925]
- Updated dependencies [7ea4132]
  - @ai-sdk/provider@2.0.0-canary.8
  - @ai-sdk/google@2.0.0-canary.10
  - @ai-sdk/anthropic@2.0.0-canary.9
  - @ai-sdk/provider-utils@3.0.0-canary.9

## 3.0.0-canary.9

### Patch Changes

- Updated dependencies [5d142ab]
- Updated dependencies [b6b43c7]
- Updated dependencies [8aa9e20]
- Updated dependencies [3795467]
  - @ai-sdk/provider-utils@3.0.0-canary.8
  - @ai-sdk/provider@2.0.0-canary.7
  - @ai-sdk/anthropic@2.0.0-canary.8
  - @ai-sdk/google@2.0.0-canary.9

## 3.0.0-canary.8

### Patch Changes

- 26735b5: chore(embedding-model): add v2 interface
- 443d8ec: feat(embedding-model-v2): add response body field
- fd65bc6: chore(embedding-model-v2): rename rawResponse to response
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
  - @ai-sdk/google@2.0.0-canary.8
  - @ai-sdk/anthropic@2.0.0-canary.7
  - @ai-sdk/provider-utils@3.0.0-canary.7

## 3.0.0-canary.7

### Patch Changes

- Updated dependencies [411e483]
- Updated dependencies [79457bd]
- Updated dependencies [ad80501]
- Updated dependencies [1766ede]
- Updated dependencies [f10304b]
  - @ai-sdk/provider@2.0.0-canary.5
  - @ai-sdk/anthropic@2.0.0-canary.6
  - @ai-sdk/google@2.0.0-canary.7
  - @ai-sdk/provider-utils@3.0.0-canary.6

## 3.0.0-canary.6

### Patch Changes

- Updated dependencies [6f6bb89]
  - @ai-sdk/provider@2.0.0-canary.4
  - @ai-sdk/anthropic@2.0.0-canary.5
  - @ai-sdk/google@2.0.0-canary.6
  - @ai-sdk/provider-utils@3.0.0-canary.5

## 3.0.0-canary.5

### Patch Changes

- Updated dependencies [d1a1aa1]
  - @ai-sdk/provider@2.0.0-canary.3
  - @ai-sdk/anthropic@2.0.0-canary.4
  - @ai-sdk/google@2.0.0-canary.5
  - @ai-sdk/provider-utils@3.0.0-canary.4

## 3.0.0-canary.4

### Patch Changes

- Updated dependencies [a166433]
- Updated dependencies [abf9a79]
- Updated dependencies [9f95b35]
- Updated dependencies [0a87932]
- Updated dependencies [6dc848c]
- Updated dependencies [61ab528]
  - @ai-sdk/provider-utils@3.0.0-canary.3
  - @ai-sdk/provider@2.0.0-canary.2
  - @ai-sdk/anthropic@2.0.0-canary.3
  - @ai-sdk/google@2.0.0-canary.4

## 3.0.0-canary.3

### Patch Changes

- Updated dependencies [c57e248]
- Updated dependencies [33f4a6a]
  - @ai-sdk/provider@2.0.0-canary.1
  - @ai-sdk/anthropic@2.0.0-canary.2
  - @ai-sdk/google@2.0.0-canary.3
  - @ai-sdk/provider-utils@3.0.0-canary.2

## 3.0.0-canary.2

### Patch Changes

- Updated dependencies [5cf30ea]
  - @ai-sdk/google@2.0.0-canary.2

## 3.0.0-canary.1

### Patch Changes

- 779d916: feat: add provider option schemas for vertex imagegen and google genai
- Updated dependencies [060370c]
- Updated dependencies [0c0c0b3]
- Updated dependencies [779d916]
- Updated dependencies [63d791d]
  - @ai-sdk/provider-utils@3.0.0-canary.1
  - @ai-sdk/google@2.0.0-canary.1
  - @ai-sdk/anthropic@2.0.0-canary.1

## 3.0.0-canary.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- 91715e5: fix (provider/google-vertex): fix anthropic support for image urls in messages
- Updated dependencies [d5f588f]
- Updated dependencies [91715e5]
  - @ai-sdk/provider-utils@3.0.0-canary.0
  - @ai-sdk/anthropic@2.0.0-canary.0
  - @ai-sdk/google@2.0.0-canary.0
  - @ai-sdk/provider@2.0.0-canary.0

## 2.2.7

### Patch Changes

- Updated dependencies [28be004]
  - @ai-sdk/provider-utils@2.2.3
  - @ai-sdk/anthropic@1.2.4
  - @ai-sdk/google@1.2.5

## 2.2.6

### Patch Changes

- Updated dependencies [b01120e]
  - @ai-sdk/provider-utils@2.2.2
  - @ai-sdk/anthropic@1.2.3
  - @ai-sdk/google@1.2.4

## 2.2.5

### Patch Changes

- 9507f7e: fix (provider/google-vertex): pass through auth options for vertex provider

## 2.2.4

### Patch Changes

- Updated dependencies [aeaa92b]
  - @ai-sdk/anthropic@1.2.2

## 2.2.3

### Patch Changes

- Updated dependencies [871df87]
  - @ai-sdk/google@1.2.3

## 2.2.2

### Patch Changes

- Updated dependencies [f10f0fa]
  - @ai-sdk/provider-utils@2.2.1
  - @ai-sdk/anthropic@1.2.1
  - @ai-sdk/google@1.2.2

## 2.2.1

### Patch Changes

- Updated dependencies [994a13b]
  - @ai-sdk/google@1.2.1

## 2.2.0

### Minor Changes

- 5bc638d: AI SDK 4.2

### Patch Changes

- Updated dependencies [5bc638d]
  - @ai-sdk/anthropic@1.2.0
  - @ai-sdk/google@1.2.0
  - @ai-sdk/provider@1.1.0
  - @ai-sdk/provider-utils@2.2.0

## 2.1.31

### Patch Changes

- Updated dependencies [d0c4659]
  - @ai-sdk/provider-utils@2.1.15
  - @ai-sdk/google@1.1.27
  - @ai-sdk/anthropic@1.1.19

## 2.1.30

### Patch Changes

- Updated dependencies [0bd5bc6]
  - @ai-sdk/provider@1.0.12
  - @ai-sdk/google@1.1.26
  - @ai-sdk/anthropic@1.1.18
  - @ai-sdk/provider-utils@2.1.14

## 2.1.29

### Patch Changes

- Updated dependencies [2e1101a]
  - @ai-sdk/provider@1.0.11
  - @ai-sdk/anthropic@1.1.17
  - @ai-sdk/google@1.1.25
  - @ai-sdk/provider-utils@2.1.13

## 2.1.28

### Patch Changes

- Updated dependencies [5261762]
  - @ai-sdk/google@1.1.24

## 2.1.27

### Patch Changes

- Updated dependencies [413f5a7]
  - @ai-sdk/google@1.1.23

## 2.1.26

### Patch Changes

- Updated dependencies [62f46fd]
  - @ai-sdk/google@1.1.22

## 2.1.25

### Patch Changes

- Updated dependencies [1531959]
  - @ai-sdk/provider-utils@2.1.12
  - @ai-sdk/anthropic@1.1.16
  - @ai-sdk/google@1.1.21

## 2.1.24

### Patch Changes

- Updated dependencies [e1d3d42]
  - @ai-sdk/anthropic@1.1.15
  - @ai-sdk/provider@1.0.10
  - @ai-sdk/google@1.1.20
  - @ai-sdk/provider-utils@2.1.11

## 2.1.23

### Patch Changes

- Updated dependencies [2c27583]
- Updated dependencies [0e8b66c]
  - @ai-sdk/google@1.1.19
  - @ai-sdk/anthropic@1.1.14

## 2.1.22

### Patch Changes

- Updated dependencies [5c8f512]
  - @ai-sdk/google@1.1.18

## 2.1.21

### Patch Changes

- Updated dependencies [3004b14]
  - @ai-sdk/anthropic@1.1.13

## 2.1.20

### Patch Changes

- Updated dependencies [b3e5a15]
  - @ai-sdk/anthropic@1.1.12

## 2.1.19

### Patch Changes

- Updated dependencies [00276ae]
- Updated dependencies [a4f8714]
  - @ai-sdk/anthropic@1.1.11

## 2.1.18

### Patch Changes

- Updated dependencies [ddf9740]
  - @ai-sdk/anthropic@1.1.10
  - @ai-sdk/provider@1.0.9
  - @ai-sdk/google@1.1.17
  - @ai-sdk/provider-utils@2.1.10

## 2.1.17

### Patch Changes

- Updated dependencies [1b2e2a0]
  - @ai-sdk/google@1.1.16

## 2.1.16

### Patch Changes

- Updated dependencies [2761f06]
  - @ai-sdk/provider@1.0.8
  - @ai-sdk/anthropic@1.1.9
  - @ai-sdk/google@1.1.15
  - @ai-sdk/provider-utils@2.1.9

## 2.1.15

### Patch Changes

- Updated dependencies [08a3641]
  - @ai-sdk/google@1.1.14

## 2.1.14

### Patch Changes

- Updated dependencies [2e898b4]
  - @ai-sdk/provider-utils@2.1.8
  - @ai-sdk/anthropic@1.1.8
  - @ai-sdk/google@1.1.13

## 2.1.13

### Patch Changes

- Updated dependencies [3ff4ef8]
  - @ai-sdk/provider-utils@2.1.7
  - @ai-sdk/anthropic@1.1.7
  - @ai-sdk/google@1.1.12

## 2.1.12

### Patch Changes

- Updated dependencies [6eb7fc4]
  - @ai-sdk/google@1.1.11

## 2.1.11

### Patch Changes

- 4da908a: feat (provider/google-vertex): add new gemini models

## 2.1.10

### Patch Changes

- Updated dependencies [e5567f7]
  - @ai-sdk/google@1.1.10

## 2.1.9

### Patch Changes

- Updated dependencies [b2573de]
  - @ai-sdk/google@1.1.9

## 2.1.8

### Patch Changes

- d89c3b9: feat (provider): add image model support to provider specification
- Updated dependencies [d89c3b9]
  - @ai-sdk/provider@1.0.7
  - @ai-sdk/anthropic@1.1.6
  - @ai-sdk/google@1.1.8
  - @ai-sdk/provider-utils@2.1.6

## 2.1.7

### Patch Changes

- d399f25: feat (provider/google-vertex): support public file urls in messages
- Updated dependencies [d399f25]
  - @ai-sdk/google@1.1.7

## 2.1.6

### Patch Changes

- Updated dependencies [e012cd8]
  - @ai-sdk/google@1.1.6

## 2.1.5

### Patch Changes

- Updated dependencies [3a602ca]
  - @ai-sdk/provider-utils@2.1.5
  - @ai-sdk/anthropic@1.1.5
  - @ai-sdk/google@1.1.5

## 2.1.4

### Patch Changes

- Updated dependencies [066206e]
  - @ai-sdk/provider-utils@2.1.4
  - @ai-sdk/anthropic@1.1.4
  - @ai-sdk/google@1.1.4

## 2.1.3

### Patch Changes

- Updated dependencies [39e5c1f]
  - @ai-sdk/provider-utils@2.1.3
  - @ai-sdk/anthropic@1.1.3
  - @ai-sdk/google@1.1.3

## 2.1.2

### Patch Changes

- 3a58a2e: feat (ai/core): throw NoImageGeneratedError from generateImage when no predictions are returned.
- Updated dependencies [ed012d2]
- Updated dependencies [3a58a2e]
  - @ai-sdk/provider-utils@2.1.2
  - @ai-sdk/provider@1.0.6
  - @ai-sdk/anthropic@1.1.2
  - @ai-sdk/google@1.1.2

## 2.1.1

### Patch Changes

- b284e2c: feat (provider/google-vertex): support prompt caching for Anthropic Claude models
- Updated dependencies [e7a9ec9]
- Updated dependencies [858f934]
- Updated dependencies [b284e2c]
- Updated dependencies [0a699f1]
  - @ai-sdk/provider-utils@2.1.1
  - @ai-sdk/anthropic@1.1.1
  - @ai-sdk/provider@1.0.5
  - @ai-sdk/google@1.1.1

## 2.1.0

### Minor Changes

- 62ba5ad: release: AI SDK 4.1

### Patch Changes

- Updated dependencies [62ba5ad]
  - @ai-sdk/anthropic@1.1.0
  - @ai-sdk/google@1.1.0
  - @ai-sdk/provider-utils@2.1.0

## 2.0.19

### Patch Changes

- Updated dependencies [00114c5]
  - @ai-sdk/provider-utils@2.0.8
  - @ai-sdk/anthropic@1.0.9
  - @ai-sdk/google@1.0.17

## 2.0.18

### Patch Changes

- 218d001: feat (provider): Add maxImagesPerCall setting to all image providers.

## 2.0.17

### Patch Changes

- Updated dependencies [4eb9b41]
  - @ai-sdk/google@1.0.16

## 2.0.16

### Patch Changes

- Updated dependencies [7611964]
  - @ai-sdk/google@1.0.15

## 2.0.15

### Patch Changes

- Updated dependencies [90fb95a]
- Updated dependencies [e6dfef4]
- Updated dependencies [6636db6]
  - @ai-sdk/provider-utils@2.0.7
  - @ai-sdk/anthropic@1.0.8
  - @ai-sdk/google@1.0.14

## 2.0.14

### Patch Changes

- 19a2ce7: feat (ai/core): add aspectRatio and seed options to generateImage
- 6337688: feat: change image generation errors to warnings
- Updated dependencies [19a2ce7]
- Updated dependencies [19a2ce7]
- Updated dependencies [6337688]
  - @ai-sdk/provider@1.0.4
  - @ai-sdk/provider-utils@2.0.6
  - @ai-sdk/anthropic@1.0.7
  - @ai-sdk/google@1.0.13

## 2.0.13

### Patch Changes

- e6ed588: feat (provider/google-vertex): Allow arbitrary image model ids.
- 6612561: fix (provider/google-vertex): Use optional fetch in embed and streamline config.

## 2.0.12

### Patch Changes

- 5ed5e45: chore (config): Use ts-library.json tsconfig for no-UI libs.
- Updated dependencies [5ed5e45]
  - @ai-sdk/provider-utils@2.0.5
  - @ai-sdk/anthropic@1.0.6
  - @ai-sdk/provider@1.0.3
  - @ai-sdk/google@1.0.12

## 2.0.11

### Patch Changes

- 5feec50: feat (provider/google-vertex): Add imagen support.

## 2.0.10

### Patch Changes

- d32abbd: feat (provider/google-vertex): Add gemini 2 models.

## 2.0.9

### Patch Changes

- Updated dependencies [db31e74]
  - @ai-sdk/google@1.0.11

## 2.0.8

### Patch Changes

- e07439a: feat (provider/google): Include safety ratings response detail.
- 4017b0f: feat (provider/google-vertex): Enhance grounding metadata response detail.
- a9df182: feat (provider/google): Add support for search grounding.
- Updated dependencies [e07439a]
- Updated dependencies [4017b0f]
- Updated dependencies [a9df182]
  - @ai-sdk/google@1.0.10

## 2.0.7

### Patch Changes

- Updated dependencies [c0b1c7e]
  - @ai-sdk/google@1.0.9

## 2.0.6

### Patch Changes

- b7372dc: feat (provider/google): Include optional response grounding metadata.
- 8224964: feat (provider/google-vertex): Add support for baseURL in API calls.
- Updated dependencies [b7372dc]
  - @ai-sdk/google@1.0.8

## 2.0.5

### Patch Changes

- Updated dependencies [09a9cab]
  - @ai-sdk/provider@1.0.2
  - @ai-sdk/anthropic@1.0.5
  - @ai-sdk/google@1.0.7
  - @ai-sdk/provider-utils@2.0.4

## 2.0.4

### Patch Changes

- 3cfcd0a: fix (provider/google-vertex): Remove unsupported cache control setting from Vertex Anthropic.

## 2.0.3

### Patch Changes

- Updated dependencies [9e54403]
  - @ai-sdk/google@1.0.6

## 2.0.2

### Patch Changes

- 5b0366e: fix (provider/vertex): fix internal reference

## 2.0.1

### Patch Changes

- bcd892e: feat (provider/google-vertex): Add support for Anthropic models.
- Updated dependencies [bcd892e]
  - @ai-sdk/anthropic@1.0.4

## 2.0.0

### Major Changes

- 0984f0b: feat (provider/google-vertex): Rewrite for Edge runtime support.

### Patch Changes

- 0984f0b: chore (providers/google-vertex): Remove unref'd base default provider.
- Updated dependencies [0984f0b]
- Updated dependencies [0984f0b]
  - @ai-sdk/google@1.0.5
  - @ai-sdk/provider-utils@2.0.3

## 1.0.4

### Patch Changes

- 6373c60: fix (provider/google): send json schema into provider

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
- 8c5daa3: chore (provider/vertex): remove topK model setting

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

### Major Changes

- 8c5daa3: chore (provider/vertex): remove topK model setting

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

## 0.0.43

### Patch Changes

- 4360e2d: feat (provider/vertex): expose search grounding metadata
- e7823a3: feat (provider/vertex): add embedding support

## 0.0.42

### Patch Changes

- aa98cdb: chore: more flexible dependency versioning
- 1486128: feat: add supportsUrl to language model specification
- 1486128: feat (provider/google): support native file URLs without download
- 3b1b69a: feat: provider-defined tools
- Updated dependencies [aa98cdb]
- Updated dependencies [1486128]
- Updated dependencies [7b937c5]
- Updated dependencies [3b1b69a]
- Updated dependencies [811a317]
  - @ai-sdk/provider-utils@1.0.22
  - @ai-sdk/provider@0.0.26

## 0.0.41

### Patch Changes

- Updated dependencies [b9b0d7b]
  - @ai-sdk/provider@0.0.25
  - @ai-sdk/provider-utils@1.0.21

## 0.0.40

### Patch Changes

- 8efa1c5: chore (provider/vertex): update GoogleVertexModelId

## 0.0.39

### Patch Changes

- 465189a: feat (provider/vertex): add schema support
- 33ba542: feat (provider/vertex): support frequencyPenalty setting
- 20ffa73: feat (provider/vertex): tool choice support & object generation with tool mode

## 0.0.38

### Patch Changes

- d595d0d: feat (ai/core): file content parts
- Updated dependencies [d595d0d]
  - @ai-sdk/provider@0.0.24
  - @ai-sdk/provider-utils@1.0.20

## 0.0.37

### Patch Changes

- Updated dependencies [273f696]
  - @ai-sdk/provider-utils@1.0.19

## 0.0.36

### Patch Changes

- Updated dependencies [03313cd]
- Updated dependencies [3be7c1c]
  - @ai-sdk/provider-utils@1.0.18
  - @ai-sdk/provider@0.0.23

## 0.0.35

### Patch Changes

- 26515cb: feat (ai/provider): introduce ProviderV1 specification
- Updated dependencies [26515cb]
  - @ai-sdk/provider@0.0.22
  - @ai-sdk/provider-utils@1.0.17

## 0.0.34

### Patch Changes

- Updated dependencies [09f895f]
  - @ai-sdk/provider-utils@1.0.16

## 0.0.33

### Patch Changes

- Updated dependencies [d67fa9c]
  - @ai-sdk/provider-utils@1.0.15

## 0.0.32

### Patch Changes

- Updated dependencies [f2c025e]
  - @ai-sdk/provider@0.0.21
  - @ai-sdk/provider-utils@1.0.14

## 0.0.31

### Patch Changes

- 04af64f: fix (provider/google-vertex): fix broken tool calling

## 0.0.30

### Patch Changes

- Updated dependencies [6ac355e]
  - @ai-sdk/provider@0.0.20
  - @ai-sdk/provider-utils@1.0.13

## 0.0.29

### Patch Changes

- Updated dependencies [dd712ac]
  - @ai-sdk/provider-utils@1.0.12

## 0.0.28

### Patch Changes

- 89b18ca: fix (ai/provider): send finish reason 'unknown' by default
- Updated dependencies [dd4a0f5]
  - @ai-sdk/provider@0.0.19
  - @ai-sdk/provider-utils@1.0.11

## 0.0.27

### Patch Changes

- 48f618d: feat (provider/google): add search grounding support

## 0.0.26

### Patch Changes

- Updated dependencies [4bd27a9]
- Updated dependencies [845754b]
  - @ai-sdk/provider-utils@1.0.10
  - @ai-sdk/provider@0.0.18

## 0.0.25

### Patch Changes

- 1e94ed8: feat (provider/google-vertex): support json mode object generation

## 0.0.24

### Patch Changes

- 39b827a: feat (provider/google-vertex): support json mode object generation

## 0.0.23

### Patch Changes

- Updated dependencies [029af4c]
  - @ai-sdk/provider@0.0.17
  - @ai-sdk/provider-utils@1.0.9

## 0.0.22

### Patch Changes

- Updated dependencies [d58517b]
  - @ai-sdk/provider@0.0.16
  - @ai-sdk/provider-utils@1.0.8

## 0.0.21

### Patch Changes

- Updated dependencies [96aed25]
  - @ai-sdk/provider@0.0.15
  - @ai-sdk/provider-utils@1.0.7

## 0.0.20

### Patch Changes

- Updated dependencies [9614584]
- Updated dependencies [0762a22]
  - @ai-sdk/provider-utils@1.0.6

## 0.0.19

### Patch Changes

- a8d1c9e9: feat (ai/core): parallel image download
- Updated dependencies [a8d1c9e9]
  - @ai-sdk/provider-utils@1.0.5
  - @ai-sdk/provider@0.0.14

## 0.0.18

### Patch Changes

- Updated dependencies [4f88248f]
  - @ai-sdk/provider-utils@1.0.4

## 0.0.17

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

## 0.0.16

### Patch Changes

- 0eabc798: feat (provider/google-vertex): change vertexai library into peer dependency

## 0.0.15

### Patch Changes

- bb584330: feat (provider/google-vertex): use systemInstruction content parts

## 0.0.14

### Patch Changes

- Updated dependencies [b7290943]
  - @ai-sdk/provider@0.0.12
  - @ai-sdk/provider-utils@1.0.2

## 0.0.13

### Patch Changes

- Updated dependencies [d481729f]
  - @ai-sdk/provider-utils@1.0.1

## 0.0.12

### Patch Changes

- 5edc6110: feat (ai/core): add custom request header support
- Updated dependencies [5edc6110]
- Updated dependencies [5edc6110]
- Updated dependencies [5edc6110]
  - @ai-sdk/provider@0.0.11
  - @ai-sdk/provider-utils@1.0.0

## 0.0.11

### Patch Changes

- Updated dependencies [02f6a088]
  - @ai-sdk/provider-utils@0.0.16

## 0.0.10

### Patch Changes

- Updated dependencies [85712895]
- Updated dependencies [85712895]
  - @ai-sdk/provider-utils@0.0.15

## 0.0.9

### Patch Changes

- 4728c37f: feat (core): add text embedding model support to provider registry
- Updated dependencies [7910ae84]
  - @ai-sdk/provider-utils@0.0.14

## 0.0.8

### Patch Changes

- Updated dependencies [102ca22f]
  - @ai-sdk/provider@0.0.10
  - @ai-sdk/provider-utils@0.0.13

## 0.0.7

### Patch Changes

- 09295e2e: feat (@ai-sdk/google-vertex): automatically download image URLs
- Updated dependencies [09295e2e]
- Updated dependencies [09295e2e]
- Updated dependencies [043a5de2]
  - @ai-sdk/provider@0.0.9
  - @ai-sdk/provider-utils@0.0.12

## 0.0.6

### Patch Changes

- 3a7a4ab6: fix (provider/vertex): fix undefined parts handling

## 0.0.5

### Patch Changes

- 7cab5e9c: feat (provider/vertex): add safety setting option on models

## 0.0.4

### Patch Changes

- f727d197: fix (provider/vertex): correct assistant message conversion
- f727d197: feat (provider/vertex): add tool call support
- 94c60cd3: feat (provider/google): add googleAuthOptions provider configuration setting

## 0.0.3

### Patch Changes

- f39c0dd2: feat (provider): implement toolChoice support
- Updated dependencies [f39c0dd2]
  - @ai-sdk/provider@0.0.8
  - @ai-sdk/provider-utils@0.0.11

## 0.0.2

### Patch Changes

- 24683b72: fix (provider/google-vertex): zod is not a dependency
- Updated dependencies [8e780288]
  - @ai-sdk/provider@0.0.7
  - @ai-sdk/provider-utils@0.0.10

## 0.0.1

### Patch Changes

- 6a50ac4: feat (provider/google-vertex): add Google Vertex provider (text generation and streaming only)
- Updated dependencies [6a50ac4]
- Updated dependencies [6a50ac4]
  - @ai-sdk/provider@0.0.6
  - @ai-sdk/provider-utils@0.0.9
