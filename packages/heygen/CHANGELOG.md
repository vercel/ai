# @ai-sdk/heygen

## 2.0.8

### Patch Changes

- 8fec9bc: Remove the fixed duration maximum and forward positive whole-second durations to HeyGen without clamping, allowing the API to enforce its current duration limits. Add the documented ultraquality enhancement option. Document the shared 15-second reference-video input budget and correct the documented prompt-enhancement default to quality.

## 2.0.7

### Patch Changes

- Updated dependencies [28252da]
  - @ai-sdk/provider-utils@4.0.63

## 2.0.6

### Patch Changes

- bc3f532: Defer validation schema construction until first use to reduce provider import time.
- Updated dependencies [1183cc4]
- Updated dependencies [d726591]
  - @ai-sdk/provider-utils@4.0.62

## 2.0.5

### Patch Changes

- Updated dependencies [5aa3086]
  - @ai-sdk/provider-utils@4.0.61

## 2.0.4

### Patch Changes

- Updated dependencies [739e9f6]
  - @ai-sdk/provider@3.0.19
  - @ai-sdk/provider-utils@4.0.60

## 2.0.3

### Patch Changes

- Updated dependencies [d5e7d82]
  - @ai-sdk/provider-utils@4.0.59

## 2.0.2

### Patch Changes

- Updated dependencies [604b4d3]
  - @ai-sdk/provider-utils@4.0.58

## 2.0.1

### Patch Changes

- 8eb55d7: Add the HeyGen video generation provider for AI SDK 6, including text, image, and reference inputs, polling, and provider-reported video metadata.
