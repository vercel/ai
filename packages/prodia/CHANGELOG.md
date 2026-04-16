# @ai-sdk/prodia

## 2.0.0-beta.25

### Patch Changes

- Updated dependencies [add1126]
  - @ai-sdk/provider-utils@5.0.0-beta.21

## 2.0.0-beta.24

### Patch Changes

- b3976a2: Add workflow serialization support to all provider models.

  **`@ai-sdk/provider-utils`:** New `serializeModel()` helper that extracts only serializable properties from a model instance, filtering out functions and objects containing functions. Third-party provider authors can use this to add workflow support to their own models.

  **All providers:** `headers` is now optional in provider config types. This is non-breaking — existing code that passes `headers` continues to work. Custom provider implementations that construct model configs manually can now omit `headers`, which is useful when models are deserialized from a workflow step boundary where auth is provided separately.

  All provider model classes now include `WORKFLOW_SERIALIZE` and `WORKFLOW_DESERIALIZE` static methods, enabling them to cross workflow step boundaries without serialization errors.

- Updated dependencies [b3976a2]
- Updated dependencies [ff5eba1]
  - @ai-sdk/provider-utils@5.0.0-beta.20
  - @ai-sdk/provider@4.0.0-beta.12

## 2.0.0-beta.23

### Major Changes

- ef992f8: Remove CommonJS exports from all packages. All packages are now ESM-only (`"type": "module"`). Consumers using `require()` must switch to ESM `import` syntax.

### Patch Changes

- Updated dependencies [ef992f8]
  - @ai-sdk/provider@4.0.0-beta.11
  - @ai-sdk/provider-utils@5.0.0-beta.19

## 2.0.0-beta.22

### Patch Changes

- Updated dependencies [90e2d8a]
  - @ai-sdk/provider-utils@5.0.0-beta.18

## 2.0.0-beta.21

### Patch Changes

- Updated dependencies [3ae1786]
  - @ai-sdk/provider-utils@5.0.0-beta.17

## 2.0.0-beta.20

### Patch Changes

- Updated dependencies [176466a]
  - @ai-sdk/provider@4.0.0-beta.10
  - @ai-sdk/provider-utils@5.0.0-beta.16

## 2.0.0-beta.19

### Patch Changes

- Updated dependencies [e311194]
  - @ai-sdk/provider@4.0.0-beta.9
  - @ai-sdk/provider-utils@5.0.0-beta.15

## 2.0.0-beta.18

### Patch Changes

- Updated dependencies [34bd95d]
- Updated dependencies [008271d]
  - @ai-sdk/provider@4.0.0-beta.8
  - @ai-sdk/provider-utils@5.0.0-beta.14

## 2.0.0-beta.17

### Patch Changes

- Updated dependencies [b0c2869]
- Updated dependencies [7e26e81]
  - @ai-sdk/provider-utils@5.0.0-beta.13

## 2.0.0-beta.16

### Patch Changes

- Updated dependencies [46d1149]
  - @ai-sdk/provider-utils@5.0.0-beta.12

## 2.0.0-beta.15

### Patch Changes

- Updated dependencies [6fd51c0]
  - @ai-sdk/provider-utils@5.0.0-beta.11
  - @ai-sdk/provider@4.0.0-beta.7

## 2.0.0-beta.14

### Patch Changes

- c29a26f: feat(provider): add support for provider references and uploading files as supported per provider
- Updated dependencies [c29a26f]
  - @ai-sdk/provider-utils@5.0.0-beta.10
  - @ai-sdk/provider@4.0.0-beta.6

## 2.0.0-beta.13

### Patch Changes

- 38fc777: Add AI Gateway hint to provider READMEs

## 2.0.0-beta.12

### Patch Changes

- Updated dependencies [2e17091]
  - @ai-sdk/provider-utils@5.0.0-beta.9

## 2.0.0-beta.11

### Patch Changes

- Updated dependencies [986c6fd]
- Updated dependencies [493295c]
  - @ai-sdk/provider-utils@5.0.0-beta.8

## 2.0.0-beta.10

### Patch Changes

- Updated dependencies [1f509d4]
  - @ai-sdk/provider-utils@5.0.0-beta.7
  - @ai-sdk/provider@4.0.0-beta.5

## 2.0.0-beta.9

### Patch Changes

- 5259a95: chore: add warning for providers that do not support new reasoning parameter

## 2.0.0-beta.8

### Patch Changes

- Updated dependencies [3887c70]
  - @ai-sdk/provider-utils@5.0.0-beta.6
  - @ai-sdk/provider@4.0.0-beta.4

## 2.0.0-beta.7

### Patch Changes

- Updated dependencies [776b617]
  - @ai-sdk/provider-utils@5.0.0-beta.5
  - @ai-sdk/provider@4.0.0-beta.3

## 2.0.0-beta.6

### Patch Changes

- Updated dependencies [61753c3]
  - @ai-sdk/provider-utils@5.0.0-beta.4

## 2.0.0-beta.5

### Patch Changes

- e2bdcd6: feat(provider/prodia): Add LanguageModel and VideoModel support to the Prodia provider.

  - **LanguageModel**: Supports Nano Banana (`inference.nano-banana.img2img.v2`) for img2img generation with text+image output via multipart form-data requests. Implements both `doGenerate` and `doStream`.
  - **VideoModel**: Supports Wan 2.2 Lightning for text-to-video (`inference.wan2-2.lightning.txt2vid.v0`) and image-to-video (`inference.wan2-2.lightning.img2vid.v0`) generation.
  - Extract shared multipart parsing and error handling infrastructure into `prodia-api.ts`.

## 2.0.0-beta.4

### Patch Changes

- Updated dependencies [f7d4f01]
  - @ai-sdk/provider-utils@5.0.0-beta.3
  - @ai-sdk/provider@4.0.0-beta.2

## 2.0.0-beta.3

### Patch Changes

- Updated dependencies [5c2a5a2]
  - @ai-sdk/provider@4.0.0-beta.1
  - @ai-sdk/provider-utils@5.0.0-beta.2

## 2.0.0-beta.2

### Patch Changes

- 77600ba: chore(provider/prodia): update provider to use v4 types

## 2.0.0-beta.1

### Patch Changes

- Updated dependencies [531251e]
  - @ai-sdk/provider-utils@5.0.0-beta.1

## 2.0.0-beta.0

### Major Changes

- 8359612: Start v7 pre-release

### Patch Changes

- Updated dependencies [8359612]
  - @ai-sdk/provider@4.0.0-beta.0
  - @ai-sdk/provider-utils@5.0.0-beta.0

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
