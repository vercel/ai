# @ai-sdk/heygen

## 3.0.21

### Patch Changes

- Updated dependencies [88b9575]
  - @ai-sdk/provider-utils@5.0.78

## 3.0.20

### Patch Changes

- Updated dependencies [9f37b45]
  - @ai-sdk/provider-utils@5.0.77

## 3.0.19

### Patch Changes

- Updated dependencies [6400cf8]
- Updated dependencies [f608c05]
- Updated dependencies [cab9c1f]
- Updated dependencies [c70adf6]
  - @ai-sdk/provider-utils@5.0.76
  - @ai-sdk/provider@4.0.37

## 3.0.18

### Patch Changes

- b667053: Refactor HeyGen model ID logic into a model catalog that declares capabilities and provider options, and generate provider capability documentation from it. Request behavior is unchanged.

## 3.0.17

### Patch Changes

- Updated dependencies [36802d4]
- Updated dependencies [e0143b0]
- Updated dependencies [934100c]
- Updated dependencies [892af4d]
- Updated dependencies [89aff56]
- Updated dependencies [41465fd]
- Updated dependencies [9754014]
- Updated dependencies [4bb73b0]
- Updated dependencies [2e44144]
  - @ai-sdk/provider@4.0.36
  - @ai-sdk/provider-utils@5.0.75

## 3.0.16

### Patch Changes

- Updated dependencies [fa15312]
  - @ai-sdk/provider-utils@5.0.74

## 3.0.15

### Patch Changes

- Updated dependencies [51ca5b7]
- Updated dependencies [dc6f1c3]
- Updated dependencies [4ae6986]
  - @ai-sdk/provider-utils@5.0.73

## 3.0.14

### Patch Changes

- 7716e18: Support promises and synchronous or asynchronous callbacks in provider API key and token settings. Resolve credentials per authenticated request while preserving existing authentication behavior and synchronous credential serialization.

  The experimental OpenAI Live `getServerWebSocketConfig()` method can now resolve asynchronously. Await its result before using the connection settings.

- 6f41ccc: Remove the fixed duration maximum and forward positive whole-second durations to HeyGen without clamping, allowing the API to enforce its current duration limits. Add the documented ultraquality enhancement option. Document the shared 15-second reference-video input budget and correct the documented prompt-enhancement default to quality.
- Updated dependencies [7716e18]
- Updated dependencies [5c247e9]
- Updated dependencies [dcd2f8d]
  - @ai-sdk/provider-utils@5.0.72
  - @ai-sdk/provider@4.0.35

## 3.0.13

### Patch Changes

- Updated dependencies [61a315e]
  - @ai-sdk/provider-utils@5.0.71

## 3.0.12

### Patch Changes

- Updated dependencies [57086ff]
- Updated dependencies [95348b3]
  - @ai-sdk/provider-utils@5.0.70

## 3.0.11

### Patch Changes

- Updated dependencies [e64ed82]
  - @ai-sdk/provider-utils@5.0.69

## 3.0.10

### Patch Changes

- e729d58: chore(docs): update `README.md` for consistent format and to avoid duplication
- Updated dependencies [5475347]
- Updated dependencies [e729d58]
  - @ai-sdk/provider@4.0.34
  - @ai-sdk/provider-utils@5.0.68

## 3.0.9

### Patch Changes

- Updated dependencies [8202f5b]
- Updated dependencies [85d84a1]
  - @ai-sdk/provider-utils@5.0.67
  - @ai-sdk/provider@4.0.33

## 3.0.8

### Patch Changes

- Updated dependencies [10026d1]
  - @ai-sdk/provider@4.0.32
  - @ai-sdk/provider-utils@5.0.66

## 3.0.7

### Patch Changes

- 1e46227: Defer construction of provider validation schemas until first use to reduce package import time.
- Updated dependencies [b089ce8]
- Updated dependencies [39a776b]
  - @ai-sdk/provider-utils@5.0.65

## 3.0.6

### Patch Changes

- Updated dependencies [0c2a9de]
- Updated dependencies [200c47f]
  - @ai-sdk/provider@4.0.31
  - @ai-sdk/provider-utils@5.0.64

## 3.0.5

### Patch Changes

- Updated dependencies [60cc252]
  - @ai-sdk/provider@4.0.30
  - @ai-sdk/provider-utils@5.0.63

## 3.0.4

### Patch Changes

- Updated dependencies [0957554]
  - @ai-sdk/provider@4.0.29
  - @ai-sdk/provider-utils@5.0.62

## 3.0.3

### Patch Changes

- Updated dependencies [130e871]
  - @ai-sdk/provider@4.0.28
  - @ai-sdk/provider-utils@5.0.61

## 3.0.2

### Patch Changes

- Updated dependencies [2e89fa4]
  - @ai-sdk/provider-utils@5.0.60

## 3.0.1

### Patch Changes

- Updated dependencies [9667bf2]
- Updated dependencies [e57803c]
- Updated dependencies [81663cc]
  - @ai-sdk/provider-utils@5.0.59
  - @ai-sdk/provider@4.0.27

## 3.0.0

### Major Changes

- 6bacd30: Add the HeyGen provider with text-to-video, image-to-video, and reference-to-video generation using `heygen-video-1`, asynchronous operation support, and workflow serialization.
