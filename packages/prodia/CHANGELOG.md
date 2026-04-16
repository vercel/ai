# @ai-sdk/prodia

## 1.0.27

### Patch Changes

- d42076d: Add AI Gateway hint to provider READMEs

## 1.0.26

### Patch Changes

- Updated dependencies [6247886]
  - @ai-sdk/provider-utils@4.0.23

## 1.0.25

### Patch Changes

- Updated dependencies [0469aed]
  - @ai-sdk/provider-utils@4.0.22

## 1.0.24

### Patch Changes

- 055cd68: fix: publish v6 to latest npm dist tag
- Updated dependencies [055cd68]
  - @ai-sdk/provider-utils@4.0.21

## 1.0.23

### Patch Changes

- 4a73226: feat(provider/prodia): Add LanguageModel and VideoModel support to the Prodia provider.

  - **LanguageModel**: Supports Nano Banana (`inference.nano-banana.img2img.v2`) for img2img generation with text+image output via multipart form-data requests. Implements both `doGenerate` and `doStream`.
  - **VideoModel**: Supports Wan 2.2 Lightning for text-to-video (`inference.wan2-2.lightning.txt2vid.v0`) and image-to-video (`inference.wan2-2.lightning.img2vid.v0`) generation.
  - Extract shared multipart parsing and error handling infrastructure into `prodia-api.ts`.

## 1.0.22

### Patch Changes

- Updated dependencies [64ac0fd]
  - @ai-sdk/provider-utils@4.0.20

## 1.0.21

### Patch Changes

- Updated dependencies [ad4cfc2]
  - @ai-sdk/provider-utils@4.0.19

## 1.0.20

### Patch Changes

- Updated dependencies [824b295]
  - @ai-sdk/provider-utils@4.0.18

## 1.0.19

### Patch Changes

- Updated dependencies [08336f1]
  - @ai-sdk/provider-utils@4.0.17

## 1.0.18

### Patch Changes

- Updated dependencies [58bc42d]
  - @ai-sdk/provider-utils@4.0.16

## 1.0.17

### Patch Changes

- 67b0c8e: feat(provider/prodia): add price param to API requests

## 1.0.16

### Patch Changes

- Updated dependencies [4024a3a]
  - @ai-sdk/provider-utils@4.0.15

## 1.0.15

### Patch Changes

- 99fbed8: feat: normalize provider specific model options type names and ensure they are exported

## 1.0.14

### Patch Changes

- Updated dependencies [7168375]
  - @ai-sdk/provider@3.0.8
  - @ai-sdk/provider-utils@4.0.14

## 1.0.13

### Patch Changes

- Updated dependencies [53f6731]
  - @ai-sdk/provider@3.0.7
  - @ai-sdk/provider-utils@4.0.13

## 1.0.12

### Patch Changes

- Updated dependencies [96936e5]
  - @ai-sdk/provider-utils@4.0.12

## 1.0.11

### Patch Changes

- Updated dependencies [2810850]
  - @ai-sdk/provider-utils@4.0.11
  - @ai-sdk/provider@3.0.6

## 1.0.10

### Patch Changes

- 1524271: chore: add skill information to README files

## 1.0.9

### Patch Changes

- 3988c08: docs: fix incorrect and outdated provider docs

## 1.0.8

### Patch Changes

- Updated dependencies [462ad00]
  - @ai-sdk/provider-utils@4.0.10

## 1.0.7

### Patch Changes

- 4de5a1d: chore: excluded tests from src folder in npm package
- Updated dependencies [4de5a1d]
  - @ai-sdk/provider@3.0.5
  - @ai-sdk/provider-utils@4.0.9

## 1.0.6

### Patch Changes

- 8dc54db: chore: add src folders to package bundle

## 1.0.5

### Patch Changes

- Updated dependencies [5c090e7]
  - @ai-sdk/provider@3.0.4
  - @ai-sdk/provider-utils@4.0.8

## 1.0.4

### Patch Changes

- Updated dependencies [46f46e4]
  - @ai-sdk/provider-utils@4.0.7

## 1.0.3

### Patch Changes

- Updated dependencies [1b11dcb]
  - @ai-sdk/provider-utils@4.0.6
  - @ai-sdk/provider@3.0.3

## 1.0.2

### Patch Changes

- Updated dependencies [34d1c8a]
  - @ai-sdk/provider-utils@4.0.5

## 1.0.1

### Patch Changes

- Updated dependencies [d937c8f]
  - @ai-sdk/provider@3.0.2
  - @ai-sdk/provider-utils@4.0.4

## 1.0.0

### Major Changes

- bb3d30e: feat(provider/prodia): Create Prodia provider package
