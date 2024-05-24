# @ai-sdk/openai

## 0.0.14

### Patch Changes

- Updated dependencies [6a50ac4]
- Updated dependencies [6a50ac4]
  - @ai-sdk/provider@0.0.6
  - @ai-sdk/provider-utils@0.0.9

## 0.0.13

### Patch Changes

- 4e3c922: fix (provider/openai): introduce compatibility mode in which "stream_options" are not sent

## 0.0.12

### Patch Changes

- 6f48839: feat (provider/openai): add gpt-4o to the list of supported models
- 1009594: feat (provider/openai): set stream_options/include_usage to true when streaming
- 0f6bc4e: feat (ai/core): add embed function
- Updated dependencies [0f6bc4e]
  - @ai-sdk/provider@0.0.5
  - @ai-sdk/provider-utils@0.0.8

## 0.0.11

### Patch Changes

- Updated dependencies [325ca55]
  - @ai-sdk/provider@0.0.4
  - @ai-sdk/provider-utils@0.0.7

## 0.0.10

### Patch Changes

- Updated dependencies [276f22b]
  - @ai-sdk/provider-utils@0.0.6

## 0.0.9

### Patch Changes

- Updated dependencies [41d5736]
  - @ai-sdk/provider@0.0.3
  - @ai-sdk/provider-utils@0.0.5

## 0.0.8

### Patch Changes

- Updated dependencies [56ef84a]
  - @ai-sdk/provider-utils@0.0.4

## 0.0.7

### Patch Changes

- 0833e19: Allow optional content to support Fireworks function calling.

## 0.0.6

### Patch Changes

- d6431ae: ai/core: add logprobs support (thanks @SamStenner for the contribution)
- 25f3350: ai/core: add support for getting raw response headers.
- Updated dependencies [d6431ae]
- Updated dependencies [25f3350]
  - @ai-sdk/provider@0.0.2
  - @ai-sdk/provider-utils@0.0.3

## 0.0.5

### Patch Changes

- eb150a6: ai/core: remove scaling of setting values (breaking change). If you were using the temperature, frequency penalty, or presence penalty settings, you need to update the providers and adjust the setting values.
- Updated dependencies [eb150a6]
  - @ai-sdk/provider-utils@0.0.2
  - @ai-sdk/provider@0.0.1

## 0.0.4

### Patch Changes

- c6fc35b: Add custom header and OpenAI project support.

## 0.0.3

### Patch Changes

- ab60b18: Simplified model construction by directly calling provider functions. Add create... functions to create provider instances.

## 0.0.2

### Patch Changes

- 2bff460: Fix build for release.

## 0.0.1

### Patch Changes

- 7b8791d: Support streams with 'chat.completion' objects.
- 7b8791d: Rename baseUrl to baseURL. Automatically remove trailing slashes.
- Updated dependencies [7b8791d]
  - @ai-sdk/provider-utils@0.0.1
