# @ai-sdk/xai

## 2.0.0-canary.17

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

- Updated dependencies [516be5b]
- Updated dependencies [ea7a7c9]
  - @ai-sdk/openai-compatible@1.0.0-canary.17
  - @ai-sdk/provider-utils@3.0.0-canary.17

## 2.0.0-canary.16

### Patch Changes

- Updated dependencies [87b828f]
  - @ai-sdk/provider-utils@3.0.0-canary.16
  - @ai-sdk/openai-compatible@1.0.0-canary.16

## 2.0.0-canary.15

### Patch Changes

- Updated dependencies [a571d6e]
- Updated dependencies [a8c8bd5]
- Updated dependencies [7979f7f]
- Updated dependencies [41fa418]
  - @ai-sdk/provider-utils@3.0.0-canary.15
  - @ai-sdk/provider@2.0.0-canary.14
  - @ai-sdk/openai-compatible@1.0.0-canary.15

## 2.0.0-canary.14

### Patch Changes

- Updated dependencies [957b739]
- Updated dependencies [9bd5ab5]
  - @ai-sdk/provider-utils@3.0.0-canary.14
  - @ai-sdk/provider@2.0.0-canary.13
  - @ai-sdk/openai-compatible@1.0.0-canary.14

## 2.0.0-canary.13

### Patch Changes

- Updated dependencies [7b3ae3f]
- Updated dependencies [d9209ca]
- Updated dependencies [0ff02bb]
  - @ai-sdk/provider@2.0.0-canary.12
  - @ai-sdk/openai-compatible@1.0.0-canary.13
  - @ai-sdk/provider-utils@3.0.0-canary.13

## 2.0.0-canary.12

### Patch Changes

- Updated dependencies [9bf7291]
- Updated dependencies [4617fab]
- Updated dependencies [e030615]
  - @ai-sdk/provider@2.0.0-canary.11
  - @ai-sdk/openai-compatible@1.0.0-canary.12
  - @ai-sdk/provider-utils@3.0.0-canary.12

## 2.0.0-canary.11

### Patch Changes

- 9301f86: refactor (image-model): rename `ImageModelV1` to `ImageModelV2`
- Updated dependencies [db72adc]
- Updated dependencies [42e32b0]
- Updated dependencies [66962ed]
- Updated dependencies [9301f86]
- Updated dependencies [a3f768e]
  - @ai-sdk/openai-compatible@1.0.0-canary.11
  - @ai-sdk/provider-utils@3.0.0-canary.11
  - @ai-sdk/provider@2.0.0-canary.10

## 2.0.0-canary.10

### Patch Changes

- cf8280e: fix(providers/xai): return actual usage when streaming instead of NaN
- Updated dependencies [cf8280e]
- Updated dependencies [e86be6f]
  - @ai-sdk/openai-compatible@1.0.0-canary.10
  - @ai-sdk/provider@2.0.0-canary.9
  - @ai-sdk/provider-utils@3.0.0-canary.10

## 2.0.0-canary.9

### Patch Changes

- Updated dependencies [95857aa]
- Updated dependencies [7ea4132]
  - @ai-sdk/provider@2.0.0-canary.8
  - @ai-sdk/openai-compatible@1.0.0-canary.9
  - @ai-sdk/provider-utils@3.0.0-canary.9

## 2.0.0-canary.8

### Patch Changes

- Updated dependencies [5d142ab]
- Updated dependencies [b6b43c7]
- Updated dependencies [b9a6121]
- Updated dependencies [8aa9e20]
- Updated dependencies [3795467]
  - @ai-sdk/provider-utils@3.0.0-canary.8
  - @ai-sdk/provider@2.0.0-canary.7
  - @ai-sdk/openai-compatible@1.0.0-canary.8

## 2.0.0-canary.7

### Patch Changes

- 41cab5c: fix(providers/xai): edit supported models for structured output
- fa49207: feat(providers/openai-compatible): convert to providerOptions
- d9b26f2: chore (providers/xai): update grok-3 model aliases
- Updated dependencies [fa49207]
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
  - @ai-sdk/openai-compatible@1.0.0-canary.7
  - @ai-sdk/provider@2.0.0-canary.6
  - @ai-sdk/provider-utils@3.0.0-canary.7

## 2.0.0-canary.6

### Patch Changes

- Updated dependencies [6db02c9]
- Updated dependencies [411e483]
- Updated dependencies [79457bd]
- Updated dependencies [ad80501]
- Updated dependencies [1766ede]
- Updated dependencies [f10304b]
  - @ai-sdk/openai-compatible@1.0.0-canary.6
  - @ai-sdk/provider@2.0.0-canary.5
  - @ai-sdk/provider-utils@3.0.0-canary.6

## 2.0.0-canary.5

### Patch Changes

- a7d3fbd: feat (providers/xai): add grok-3 models
- Updated dependencies [6f6bb89]
  - @ai-sdk/provider@2.0.0-canary.4
  - @ai-sdk/openai-compatible@1.0.0-canary.5
  - @ai-sdk/provider-utils@3.0.0-canary.5

## 2.0.0-canary.4

### Patch Changes

- Updated dependencies [d1a1aa1]
  - @ai-sdk/provider@2.0.0-canary.3
  - @ai-sdk/openai-compatible@1.0.0-canary.4
  - @ai-sdk/provider-utils@3.0.0-canary.4

## 2.0.0-canary.3

### Patch Changes

- Updated dependencies [a166433]
- Updated dependencies [abf9a79]
- Updated dependencies [9f95b35]
- Updated dependencies [0a87932]
- Updated dependencies [6dc848c]
  - @ai-sdk/provider-utils@3.0.0-canary.3
  - @ai-sdk/provider@2.0.0-canary.2
  - @ai-sdk/openai-compatible@1.0.0-canary.3

## 2.0.0-canary.2

### Patch Changes

- Updated dependencies [c57e248]
- Updated dependencies [33f4a6a]
  - @ai-sdk/provider@2.0.0-canary.1
  - @ai-sdk/openai-compatible@1.0.0-canary.2
  - @ai-sdk/provider-utils@3.0.0-canary.2

## 2.0.0-canary.1

### Patch Changes

- Updated dependencies [060370c]
- Updated dependencies [0c0c0b3]
- Updated dependencies [63d791d]
  - @ai-sdk/provider-utils@3.0.0-canary.1
  - @ai-sdk/openai-compatible@1.0.0-canary.1

## 2.0.0-canary.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- Updated dependencies [d5f588f]
  - @ai-sdk/provider-utils@3.0.0-canary.0
  - @ai-sdk/openai-compatible@1.0.0-canary.0
  - @ai-sdk/provider@2.0.0-canary.0

## 1.2.6

### Patch Changes

- Updated dependencies [d186cca]
  - @ai-sdk/openai-compatible@0.2.5

## 1.2.5

### Patch Changes

- Updated dependencies [28be004]
  - @ai-sdk/provider-utils@2.2.3
  - @ai-sdk/openai-compatible@0.2.4

## 1.2.4

### Patch Changes

- Updated dependencies [b01120e]
  - @ai-sdk/provider-utils@2.2.2
  - @ai-sdk/openai-compatible@0.2.3

## 1.2.3

### Patch Changes

- a6b55cc: feat (providers/openai-compatible): add openai-compatible image model and use as xai image model base
- Updated dependencies [a6b55cc]
  - @ai-sdk/openai-compatible@0.2.2

## 1.2.2

### Patch Changes

- Updated dependencies [f10f0fa]
  - @ai-sdk/provider-utils@2.2.1
  - @ai-sdk/openai-compatible@0.2.1

## 1.2.1

### Patch Changes

- 82b5620: fix (providers/xai): handle raw b64 image response data

## 1.2.0

### Minor Changes

- 5bc638d: AI SDK 4.2

### Patch Changes

- Updated dependencies [5bc638d]
  - @ai-sdk/openai-compatible@0.2.0
  - @ai-sdk/provider@1.1.0
  - @ai-sdk/provider-utils@2.2.0

## 1.1.18

### Patch Changes

- 6f0e741: feat (providers/xai): add xai image model support

## 1.1.17

### Patch Changes

- Updated dependencies [d0c4659]
  - @ai-sdk/provider-utils@2.1.15
  - @ai-sdk/openai-compatible@0.1.17

## 1.1.16

### Patch Changes

- Updated dependencies [0bd5bc6]
  - @ai-sdk/provider@1.0.12
  - @ai-sdk/openai-compatible@0.1.16
  - @ai-sdk/provider-utils@2.1.14

## 1.1.15

### Patch Changes

- Updated dependencies [2e1101a]
  - @ai-sdk/provider@1.0.11
  - @ai-sdk/openai-compatible@0.1.15
  - @ai-sdk/provider-utils@2.1.13

## 1.1.14

### Patch Changes

- Updated dependencies [1531959]
  - @ai-sdk/provider-utils@2.1.12
  - @ai-sdk/openai-compatible@0.1.14

## 1.1.13

### Patch Changes

- Updated dependencies [e1d3d42]
  - @ai-sdk/openai-compatible@0.1.13
  - @ai-sdk/provider@1.0.10
  - @ai-sdk/provider-utils@2.1.11

## 1.1.12

### Patch Changes

- Updated dependencies [ddf9740]
  - @ai-sdk/provider@1.0.9
  - @ai-sdk/openai-compatible@0.1.12
  - @ai-sdk/provider-utils@2.1.10

## 1.1.11

### Patch Changes

- Updated dependencies [2761f06]
  - @ai-sdk/provider@1.0.8
  - @ai-sdk/openai-compatible@0.1.11
  - @ai-sdk/provider-utils@2.1.9

## 1.1.10

### Patch Changes

- Updated dependencies [2e898b4]
  - @ai-sdk/provider-utils@2.1.8
  - @ai-sdk/openai-compatible@0.1.10

## 1.1.9

### Patch Changes

- Updated dependencies [3ff4ef8]
  - @ai-sdk/provider-utils@2.1.7
  - @ai-sdk/openai-compatible@0.1.9

## 1.1.8

### Patch Changes

- Updated dependencies [d89c3b9]
  - @ai-sdk/provider@1.0.7
  - @ai-sdk/openai-compatible@0.1.8
  - @ai-sdk/provider-utils@2.1.6

## 1.1.7

### Patch Changes

- Updated dependencies [f2c6c37]
  - @ai-sdk/openai-compatible@0.1.7

## 1.1.6

### Patch Changes

- Updated dependencies [3a602ca]
  - @ai-sdk/provider-utils@2.1.5
  - @ai-sdk/openai-compatible@0.1.6

## 1.1.5

### Patch Changes

- Updated dependencies [066206e]
  - @ai-sdk/provider-utils@2.1.4
  - @ai-sdk/openai-compatible@0.1.5

## 1.1.4

### Patch Changes

- Updated dependencies [39e5c1f]
  - @ai-sdk/provider-utils@2.1.3
  - @ai-sdk/openai-compatible@0.1.4

## 1.1.3

### Patch Changes

- Updated dependencies [361fd08]
  - @ai-sdk/openai-compatible@0.1.3

## 1.1.2

### Patch Changes

- Updated dependencies [ed012d2]
- Updated dependencies [3a58a2e]
  - @ai-sdk/openai-compatible@0.1.2
  - @ai-sdk/provider-utils@2.1.2
  - @ai-sdk/provider@1.0.6

## 1.1.1

### Patch Changes

- Updated dependencies [e7a9ec9]
- Updated dependencies [0a699f1]
  - @ai-sdk/provider-utils@2.1.1
  - @ai-sdk/openai-compatible@0.1.1
  - @ai-sdk/provider@1.0.5

## 1.1.0

### Minor Changes

- 62ba5ad: release: AI SDK 4.1

### Patch Changes

- Updated dependencies [62ba5ad]
  - @ai-sdk/openai-compatible@0.1.0
  - @ai-sdk/provider-utils@2.1.0

## 1.0.19

### Patch Changes

- Updated dependencies [00114c5]
  - @ai-sdk/provider-utils@2.0.8
  - @ai-sdk/openai-compatible@0.0.18

## 1.0.18

### Patch Changes

- Updated dependencies [ae57beb]
  - @ai-sdk/openai-compatible@0.0.17

## 1.0.17

### Patch Changes

- 7611964: feat (provider/xai): Support structured output for latest models.
- Updated dependencies [7611964]
  - @ai-sdk/openai-compatible@0.0.16

## 1.0.16

### Patch Changes

- Updated dependencies [90fb95a]
- Updated dependencies [e6dfef4]
- Updated dependencies [6636db6]
  - @ai-sdk/provider-utils@2.0.7
  - @ai-sdk/openai-compatible@0.0.15

## 1.0.15

### Patch Changes

- Updated dependencies [19a2ce7]
- Updated dependencies [19a2ce7]
- Updated dependencies [43b37f7]
- Updated dependencies [6337688]
  - @ai-sdk/provider@1.0.4
  - @ai-sdk/provider-utils@2.0.6
  - @ai-sdk/openai-compatible@0.0.14

## 1.0.14

### Patch Changes

- Updated dependencies [6564812]
  - @ai-sdk/openai-compatible@0.0.13

## 1.0.13

### Patch Changes

- Updated dependencies [70003b8]
  - @ai-sdk/openai-compatible@0.0.12

## 1.0.12

### Patch Changes

- 5ed5e45: chore (config): Use ts-library.json tsconfig for no-UI libs.
- Updated dependencies [5ed5e45]
- Updated dependencies [307c247]
  - @ai-sdk/openai-compatible@0.0.11
  - @ai-sdk/provider-utils@2.0.5
  - @ai-sdk/provider@1.0.3

## 1.0.11

### Patch Changes

- Updated dependencies [baae8f4]
  - @ai-sdk/openai-compatible@0.0.10

## 1.0.10

### Patch Changes

- Updated dependencies [9c7653b]
  - @ai-sdk/openai-compatible@0.0.9

## 1.0.9

### Patch Changes

- Updated dependencies [6faab13]
  - @ai-sdk/openai-compatible@0.0.8

## 1.0.8

### Patch Changes

- 50821de: feat (docs): Use new grok-2 model in xai example code.

## 1.0.7

### Patch Changes

- 4e9032c: feat (provider/xai): Add grok-2 models, use openai-compatible base impl.

## 1.0.6

### Patch Changes

- Updated dependencies [09a9cab]
  - @ai-sdk/provider@1.0.2
  - @ai-sdk/provider-utils@2.0.4

## 1.0.5

### Patch Changes

- Updated dependencies [0984f0b]
  - @ai-sdk/provider-utils@2.0.3

## 1.0.4

### Patch Changes

- b1f31da: chore (providers): Remove obsolete 'internal' from several packages.

## 1.0.3

### Patch Changes

- Updated dependencies [b446ae5]
  - @ai-sdk/provider@1.0.1
  - @ai-sdk/provider-utils@2.0.2

## 1.0.2

### Patch Changes

- Updated dependencies [c3ab5de]
  - @ai-sdk/provider-utils@2.0.1

## 1.0.1

### Patch Changes

- 870c09e: feat (provider/xai): add groq-vision-beta support

## 1.0.0

### Patch Changes

- 75d0065: feat (providers/xai): Initial xAI provider.
- Updated dependencies [b469a7e]
- Updated dependencies [dce4158]
- Updated dependencies [c0ddc24]
- Updated dependencies [b1da952]
- Updated dependencies [dce4158]
- Updated dependencies [8426f55]
- Updated dependencies [db46ce5]
  - @ai-sdk/provider-utils@2.0.0
  - @ai-sdk/provider@1.0.0

## 1.0.0-canary.1

### Patch Changes

- 75d0065: feat (providers/xai): Initial xAI provider.
