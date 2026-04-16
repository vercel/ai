# @ai-sdk/prodia

## 0.0.6

### Patch Changes

- Updated dependencies [a27a978]
  - @ai-sdk/provider-utils@3.0.23

## 0.0.5

### Patch Changes

- a644ffd: feat(provider/prodia): Add LanguageModel support to the Prodia provider.

  - **LanguageModel**: Supports Nano Banana (`inference.nano-banana.img2img.v2`) for img2img generation with text+image output via multipart form-data requests. Implements both `doGenerate` and `doStream`.
  - Extract shared multipart parsing and error handling infrastructure into `prodia-api.ts`.

## 0.0.4

### Patch Changes

- Updated dependencies [6a2f01b]
- Updated dependencies [17d64e3]
  - @ai-sdk/provider-utils@3.0.22

## 0.0.3

### Patch Changes

- 9284818: feat(provider/prodia): add price param to API requests

## 0.0.2

### Patch Changes

- Updated dependencies [20565b8]
  - @ai-sdk/provider-utils@3.0.21

## 0.0.1

### Patch Changes

- 4eb8296: ai@v5 compatible release
