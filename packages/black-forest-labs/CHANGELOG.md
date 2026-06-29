# @ai-sdk/black-forest-labs

## 0.0.17

### Patch Changes

- Updated dependencies [b85c4fb]
  - @ai-sdk/provider-utils@3.0.28

## 0.0.16

### Patch Changes

- Updated dependencies [9169261]
  - @ai-sdk/provider-utils@3.0.27

## 0.0.15

### Patch Changes

- 9f67efe: fix: only send provider credentials to same-origin response-supplied URLs

  Several provider clients followed a URL taken from the provider's API response (a polling/status URL or a final media URL such as `polling_url`, `urls.get`, `result_url`, `result.sample`, or `video.uri`) and reused the authenticated headers — or appended `?key=<API_KEY>` — on that request. Because the host of the response-supplied URL was never validated, the long-lived API key was sent to whatever host the response named (a CDN in the benign case, or an attacker-chosen host if the provider response was tampered with), allowing credential exfiltration.

  A new `isSameOrigin` helper is added to `@ai-sdk/provider-utils`, and the affected fetches in `@ai-sdk/black-forest-labs`, `@ai-sdk/fireworks`, `@ai-sdk/replicate`, `@ai-sdk/gladia`, `@ai-sdk/fal`, and `@ai-sdk/google` now attach credentials only when the followed URL is same-origin with the provider's configured API origin. Requests to a foreign origin are made without the credential.

- Updated dependencies [9f67efe]
- Updated dependencies [eea9166]
  - @ai-sdk/provider-utils@3.0.26

## 0.0.14

### Patch Changes

- 783fa6c: chore: ensure consistent import handling and avoid import duplicates or cycles
- Updated dependencies [783fa6c]
  - @ai-sdk/provider-utils@3.0.25
  - @ai-sdk/provider@2.0.3

## 0.0.13

### Patch Changes

- 0a00b9b: trigger release for all packages after provenance setup
- Updated dependencies [0a00b9b]
  - @ai-sdk/provider@2.0.2
  - @ai-sdk/provider-utils@3.0.24

## 0.0.12

### Patch Changes

- 5543cd1: Add AI Gateway hint to provider READMEs

## 0.0.11

### Patch Changes

- Updated dependencies [a27a978]
  - @ai-sdk/provider-utils@3.0.23

## 0.0.10

### Patch Changes

- Updated dependencies [6a2f01b]
- Updated dependencies [17d64e3]
  - @ai-sdk/provider-utils@3.0.22

## 0.0.9

### Patch Changes

- Updated dependencies [20565b8]
  - @ai-sdk/provider-utils@3.0.21

## 0.0.8

### Patch Changes

- 526fe8d: fix: trigger new release for `@ai-v5` dist-tag
- Updated dependencies [526fe8d]
  - @ai-sdk/provider@2.0.1
  - @ai-sdk/provider-utils@3.0.20

## 0.0.7

### Patch Changes

- Updated dependencies [ef6d784]
  - @ai-sdk/provider-utils@3.0.19

## 0.0.6

### Patch Changes

- Updated dependencies [d1dbe5d]
  - @ai-sdk/provider-utils@3.0.18

## 0.0.5

### Patch Changes

- 473a3f5: feat(provider/black-forest-labs): Add new provider options

## 0.0.4

### Patch Changes

- 539e89d: fix (provider/black-forest-labs): allow null for cost and megapixel in provider response

## 0.0.3

### Patch Changes

- 7f40d34: feat (provider/black-forest-labs): include cost and megapixels in metadata

## 0.0.2

### Patch Changes

- bf71584: feat(provider/black-forest-labs): make polling timeout configurable

## 0.0.1

### Patch Changes

- 79fcc84: feat(black-forest-labs): initial version
