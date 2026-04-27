# @ai-sdk/black-forest-labs

## 2.0.0-beta.27

### Patch Changes

- Updated dependencies [2e98477]
  - @ai-sdk/provider-utils@5.0.0-beta.26

## 2.0.0-beta.26

### Patch Changes

- Updated dependencies [eea8d98]
  - @ai-sdk/provider-utils@5.0.0-beta.25

## 2.0.0-beta.25

### Patch Changes

- Updated dependencies [f807e45]
  - @ai-sdk/provider-utils@5.0.0-beta.24

## 2.0.0-beta.24

### Patch Changes

- Updated dependencies [350ea38]
  - @ai-sdk/provider-utils@5.0.0-beta.23

## 2.0.0-beta.23

### Patch Changes

- Updated dependencies [083947b]
  - @ai-sdk/provider-utils@5.0.0-beta.22

## 2.0.0-beta.22

### Patch Changes

- Updated dependencies [add1126]
  - @ai-sdk/provider-utils@5.0.0-beta.21

## 2.0.0-beta.21

### Patch Changes

- b3976a2: Add workflow serialization support to all provider models.

  **`@ai-sdk/provider-utils`:** New `serializeModel()` helper that extracts only serializable properties from a model instance, filtering out functions and objects containing functions. Third-party provider authors can use this to add workflow support to their own models.

  **All providers:** `headers` is now optional in provider config types. This is non-breaking — existing code that passes `headers` continues to work. Custom provider implementations that construct model configs manually can now omit `headers`, which is useful when models are deserialized from a workflow step boundary where auth is provided separately.

  All provider model classes now include `WORKFLOW_SERIALIZE` and `WORKFLOW_DESERIALIZE` static methods, enabling them to cross workflow step boundaries without serialization errors.

- Updated dependencies [b3976a2]
- Updated dependencies [ff5eba1]
  - @ai-sdk/provider-utils@5.0.0-beta.20
  - @ai-sdk/provider@4.0.0-beta.12

## 2.0.0-beta.20

### Major Changes

- ef992f8: Remove CommonJS exports from all packages. All packages are now ESM-only (`"type": "module"`). Consumers using `require()` must switch to ESM `import` syntax.

### Patch Changes

- Updated dependencies [ef992f8]
  - @ai-sdk/provider@4.0.0-beta.11
  - @ai-sdk/provider-utils@5.0.0-beta.19

## 2.0.0-beta.19

### Patch Changes

- Updated dependencies [90e2d8a]
  - @ai-sdk/provider-utils@5.0.0-beta.18

## 2.0.0-beta.18

### Patch Changes

- Updated dependencies [3ae1786]
  - @ai-sdk/provider-utils@5.0.0-beta.17

## 2.0.0-beta.17

### Patch Changes

- Updated dependencies [176466a]
  - @ai-sdk/provider@4.0.0-beta.10
  - @ai-sdk/provider-utils@5.0.0-beta.16

## 2.0.0-beta.16

### Patch Changes

- Updated dependencies [e311194]
  - @ai-sdk/provider@4.0.0-beta.9
  - @ai-sdk/provider-utils@5.0.0-beta.15

## 2.0.0-beta.15

### Patch Changes

- Updated dependencies [34bd95d]
- Updated dependencies [008271d]
  - @ai-sdk/provider@4.0.0-beta.8
  - @ai-sdk/provider-utils@5.0.0-beta.14

## 2.0.0-beta.14

### Patch Changes

- Updated dependencies [b0c2869]
- Updated dependencies [7e26e81]
  - @ai-sdk/provider-utils@5.0.0-beta.13

## 2.0.0-beta.13

### Patch Changes

- Updated dependencies [46d1149]
  - @ai-sdk/provider-utils@5.0.0-beta.12

## 2.0.0-beta.12

### Patch Changes

- Updated dependencies [6fd51c0]
  - @ai-sdk/provider-utils@5.0.0-beta.11
  - @ai-sdk/provider@4.0.0-beta.7

## 2.0.0-beta.11

### Patch Changes

- Updated dependencies [c29a26f]
  - @ai-sdk/provider-utils@5.0.0-beta.10
  - @ai-sdk/provider@4.0.0-beta.6

## 2.0.0-beta.10

### Patch Changes

- 38fc777: Add AI Gateway hint to provider READMEs

## 2.0.0-beta.9

### Patch Changes

- Updated dependencies [2e17091]
  - @ai-sdk/provider-utils@5.0.0-beta.9

## 2.0.0-beta.8

### Patch Changes

- Updated dependencies [986c6fd]
- Updated dependencies [493295c]
  - @ai-sdk/provider-utils@5.0.0-beta.8

## 2.0.0-beta.7

### Patch Changes

- Updated dependencies [1f509d4]
  - @ai-sdk/provider-utils@5.0.0-beta.7
  - @ai-sdk/provider@4.0.0-beta.5

## 2.0.0-beta.6

### Patch Changes

- Updated dependencies [3887c70]
  - @ai-sdk/provider-utils@5.0.0-beta.6
  - @ai-sdk/provider@4.0.0-beta.4

## 2.0.0-beta.5

### Patch Changes

- Updated dependencies [776b617]
  - @ai-sdk/provider-utils@5.0.0-beta.5
  - @ai-sdk/provider@4.0.0-beta.3

## 2.0.0-beta.4

### Patch Changes

- Updated dependencies [61753c3]
  - @ai-sdk/provider-utils@5.0.0-beta.4

## 2.0.0-beta.3

### Patch Changes

- Updated dependencies [f7d4f01]
  - @ai-sdk/provider-utils@5.0.0-beta.3
  - @ai-sdk/provider@4.0.0-beta.2

## 2.0.0-beta.2

### Patch Changes

- Updated dependencies [5c2a5a2]
  - @ai-sdk/provider@4.0.0-beta.1
  - @ai-sdk/provider-utils@5.0.0-beta.2

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

## 1.0.24

### Patch Changes

- Updated dependencies [ad4cfc2]
  - @ai-sdk/provider-utils@4.0.19

## 1.0.23

### Patch Changes

- Updated dependencies [824b295]
  - @ai-sdk/provider-utils@4.0.18

## 1.0.22

### Patch Changes

- Updated dependencies [08336f1]
  - @ai-sdk/provider-utils@4.0.17

## 1.0.21

### Patch Changes

- Updated dependencies [58bc42d]
  - @ai-sdk/provider-utils@4.0.16

## 1.0.20

### Patch Changes

- Updated dependencies [4024a3a]
  - @ai-sdk/provider-utils@4.0.15

## 1.0.19

### Patch Changes

- 99fbed8: feat: normalize provider specific model options type names and ensure they are exported

## 1.0.18

### Patch Changes

- Updated dependencies [7168375]
  - @ai-sdk/provider@3.0.8
  - @ai-sdk/provider-utils@4.0.14

## 1.0.17

### Patch Changes

- Updated dependencies [53f6731]
  - @ai-sdk/provider@3.0.7
  - @ai-sdk/provider-utils@4.0.13

## 1.0.16

### Patch Changes

- Updated dependencies [96936e5]
  - @ai-sdk/provider-utils@4.0.12

## 1.0.15

### Patch Changes

- Updated dependencies [2810850]
  - @ai-sdk/provider-utils@4.0.11
  - @ai-sdk/provider@3.0.6

## 1.0.14

### Patch Changes

- 1524271: chore: add skill information to README files

## 1.0.13

### Patch Changes

- 3988c08: docs: fix incorrect and outdated provider docs

## 1.0.12

### Patch Changes

- Updated dependencies [462ad00]
  - @ai-sdk/provider-utils@4.0.10

## 1.0.11

### Patch Changes

- 4de5a1d: chore: excluded tests from src folder in npm package
- Updated dependencies [4de5a1d]
  - @ai-sdk/provider@3.0.5
  - @ai-sdk/provider-utils@4.0.9

## 1.0.10

### Patch Changes

- 2b8369d: chore: add docs to package dist

## 1.0.9

### Patch Changes

- 8dc54db: chore: add src folders to package bundle

## 1.0.8

### Patch Changes

- Updated dependencies [5c090e7]
  - @ai-sdk/provider@3.0.4
  - @ai-sdk/provider-utils@4.0.8

## 1.0.7

### Patch Changes

- Updated dependencies [46f46e4]
  - @ai-sdk/provider-utils@4.0.7

## 1.0.6

### Patch Changes

- Updated dependencies [1b11dcb]
  - @ai-sdk/provider-utils@4.0.6
  - @ai-sdk/provider@3.0.3

## 1.0.5

### Patch Changes

- Updated dependencies [34d1c8a]
  - @ai-sdk/provider-utils@4.0.5

## 1.0.4

### Patch Changes

- Updated dependencies [d937c8f]
  - @ai-sdk/provider@3.0.2
  - @ai-sdk/provider-utils@4.0.4

## 1.0.3

### Patch Changes

- Updated dependencies [0b429d4]
  - @ai-sdk/provider-utils@4.0.3

## 1.0.2

### Patch Changes

- 863d34f: fix: trigger release to update `@latest`
- Updated dependencies [863d34f]
  - @ai-sdk/provider@3.0.1
  - @ai-sdk/provider-utils@4.0.2

## 1.0.1

### Patch Changes

- Updated dependencies [29264a3]
  - @ai-sdk/provider-utils@4.0.1

## 1.0.0

### Major Changes

- 8a9f0d4: feat(black-forest-labs): initial version

### Patch Changes

- 3922a5f: feat(provider/black-forest-labs): make polling timeout configurable
- 8d9e8ad: chore(provider): remove generics from EmbeddingModelV3

  Before

  ```ts
  model.textEmbeddingModel("my-model-id");
  ```

  After

  ```ts
  model.embeddingModel("my-model-id");
  ```

- cd3b71c: feat (provider/black-forest-labs): include cost and megapixels in metadata
- 457318b: chore(provider,ai): switch to SharedV3Warning and unified warnings
- 9061dc0: feat: image editing
- 366f50b: chore(provider): add deprecated textEmbeddingModel and textEmbedding aliases
- b8e77ef: feat(provider/black-forest-labs): Add new provider options
- 666bd16: fix (provider/black-forest-labs): allow null for cost and megapixel in provider response
- Updated dependencies
  - @ai-sdk/provider@3.0.0
  - @ai-sdk/provider-utils@4.0.0

## 1.0.0-beta.30

### Patch Changes

- Updated dependencies [475189e]
  - @ai-sdk/provider@3.0.0-beta.32
  - @ai-sdk/provider-utils@4.0.0-beta.59

## 1.0.0-beta.29

### Patch Changes

- Updated dependencies [2625a04]
  - @ai-sdk/provider@3.0.0-beta.31
  - @ai-sdk/provider-utils@4.0.0-beta.58

## 1.0.0-beta.28

### Patch Changes

- Updated dependencies [cbf52cd]
  - @ai-sdk/provider@3.0.0-beta.30
  - @ai-sdk/provider-utils@4.0.0-beta.57

## 1.0.0-beta.27

### Patch Changes

- Updated dependencies [9549c9e]
  - @ai-sdk/provider@3.0.0-beta.29
  - @ai-sdk/provider-utils@4.0.0-beta.56

## 1.0.0-beta.26

### Patch Changes

- Updated dependencies [50b70d6]
  - @ai-sdk/provider-utils@4.0.0-beta.55

## 1.0.0-beta.25

### Patch Changes

- 9061dc0: feat: image editing
- Updated dependencies [9061dc0]
  - @ai-sdk/provider-utils@4.0.0-beta.54
  - @ai-sdk/provider@3.0.0-beta.28

## 1.0.0-beta.24

### Patch Changes

- 366f50b: chore(provider): add deprecated textEmbeddingModel and textEmbedding aliases
- Updated dependencies [366f50b]
  - @ai-sdk/provider@3.0.0-beta.27
  - @ai-sdk/provider-utils@4.0.0-beta.53

## 1.0.0-beta.23

### Patch Changes

- Updated dependencies [763d04a]
  - @ai-sdk/provider-utils@4.0.0-beta.52

## 1.0.0-beta.22

### Patch Changes

- Updated dependencies [c1efac4]
  - @ai-sdk/provider-utils@4.0.0-beta.51

## 1.0.0-beta.21

### Patch Changes

- Updated dependencies [32223c8]
  - @ai-sdk/provider-utils@4.0.0-beta.50

## 1.0.0-beta.20

### Patch Changes

- Updated dependencies [83e5744]
  - @ai-sdk/provider-utils@4.0.0-beta.49

## 1.0.0-beta.19

### Patch Changes

- Updated dependencies [960ec8f]
  - @ai-sdk/provider-utils@4.0.0-beta.48

## 1.0.0-beta.18

### Patch Changes

- Updated dependencies [e9e157f]
  - @ai-sdk/provider-utils@4.0.0-beta.47

## 1.0.0-beta.17

### Patch Changes

- Updated dependencies [81e29ab]
  - @ai-sdk/provider-utils@4.0.0-beta.46

## 1.0.0-beta.16

### Patch Changes

- Updated dependencies [3bd2689]
  - @ai-sdk/provider@3.0.0-beta.26
  - @ai-sdk/provider-utils@4.0.0-beta.45

## 1.0.0-beta.15

### Patch Changes

- Updated dependencies [53f3368]
  - @ai-sdk/provider@3.0.0-beta.25
  - @ai-sdk/provider-utils@4.0.0-beta.44

## 1.0.0-beta.14

### Patch Changes

- Updated dependencies [dce03c4]
  - @ai-sdk/provider-utils@4.0.0-beta.43
  - @ai-sdk/provider@3.0.0-beta.24

## 1.0.0-beta.13

### Patch Changes

- Updated dependencies [3ed5519]
  - @ai-sdk/provider-utils@4.0.0-beta.42

## 1.0.0-beta.12

### Patch Changes

- Updated dependencies [1bd7d32]
  - @ai-sdk/provider-utils@4.0.0-beta.41
  - @ai-sdk/provider@3.0.0-beta.23

## 1.0.0-beta.11

### Patch Changes

- Updated dependencies [544d4e8]
  - @ai-sdk/provider-utils@4.0.0-beta.40
  - @ai-sdk/provider@3.0.0-beta.22

## 1.0.0-beta.10

### Patch Changes

- Updated dependencies [954c356]
  - @ai-sdk/provider-utils@4.0.0-beta.39
  - @ai-sdk/provider@3.0.0-beta.21

## 1.0.0-beta.9

### Patch Changes

- Updated dependencies [03849b0]
  - @ai-sdk/provider-utils@4.0.0-beta.38

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
  model.textEmbeddingModel("my-model-id");
  ```

  After

  ```ts
  model.embeddingModel("my-model-id");
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
