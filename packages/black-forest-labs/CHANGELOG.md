# @ai-sdk/black-forest-labs

## 1.0.0-beta.8

### Patch Changes

- 457318b: chore(provider,ai): switch to SharedV3Warning and unified warnings
- Updated dependencies [457318b]
  - @ai-sdk/provider@3.0.0-beta.20
  - @ai-sdk/provider-utils@4.0.0-beta.37

## 1.0.0-beta.7

### Patch Changes

- 8d9e8ad: chore(provider): remove generics from EmbeddingModelV3

  Before

  ```ts
  model.textEmbeddingModel('my-model-id');
  ```

  After

  ```ts
  model.embeddingModel('my-model-id');
  ```

- Updated dependencies [8d9e8ad]
  - @ai-sdk/provider@3.0.0-beta.19
  - @ai-sdk/provider-utils@4.0.0-beta.36

## 1.0.0-beta.6

### Patch Changes

- Updated dependencies [10d819b]
  - @ai-sdk/provider@3.0.0-beta.18
  - @ai-sdk/provider-utils@4.0.0-beta.35

## 1.0.0-beta.5

### Patch Changes

- b8e77ef: feat(provider/black-forest-labs): Add new provider options

## 1.0.0-beta.4

### Patch Changes

- 666bd16: fix (provider/black-forest-labs): allow null for cost and megapixel in provider response

## 1.0.0-beta.3

### Patch Changes

- cd3b71c: feat (provider/black-forest-labs): include cost and megapixels in metadata

## 1.0.0-beta.2

### Patch Changes

- Updated dependencies [db913bd]
  - @ai-sdk/provider@3.0.0-beta.17
  - @ai-sdk/provider-utils@4.0.0-beta.34

## 1.0.0-beta.1

### Patch Changes

- 3922a5f: feat(provider/black-forest-labs): make polling timeout configurable

## 1.0.0-beta.0

### Major Changes

- 8a9f0d4: feat(black-forest-labs): initial version
