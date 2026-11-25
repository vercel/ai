# @ai-sdk/scaledown

## 3.0.3

### Patch Changes

- 4b02148: Derive decision and extraction model IDs from a shared catalog while keeping their model sets separate.
- Updated dependencies [1d2c2ff]
  - @ai-sdk/provider-utils@5.0.83

## 3.0.2

### Patch Changes

- d99098a: Centralize empty extraction value normalization in `experimental_extract`, preserving missing-value behavior while removing duplicated conversion from extraction providers.
- Updated dependencies [10ff0b1]
- Updated dependencies [e878ab3]
- Updated dependencies [d99098a]
  - @ai-sdk/provider@4.0.39
  - @ai-sdk/provider-utils@5.0.82

## 3.0.1

### Patch Changes

- Updated dependencies [6d50947]
  - @ai-sdk/provider-utils@5.0.81

## 3.0.0

### Major Changes

- c6db718: Add the ScaleDown provider with support for choice, boolean, and score questions through the Decisions API, and text and text-list extraction through the Extract API.
