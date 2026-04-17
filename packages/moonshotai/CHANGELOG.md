# @ai-sdk/moonshotai

## 3.0.0-beta.29

### Patch Changes

- Updated dependencies [f807e45]
  - @ai-sdk/provider-utils@5.0.0-beta.24
  - @ai-sdk/openai-compatible@3.0.0-beta.29

## 3.0.0-beta.28

### Patch Changes

- Updated dependencies [350ea38]
  - @ai-sdk/provider-utils@5.0.0-beta.23
  - @ai-sdk/openai-compatible@3.0.0-beta.28

## 3.0.0-beta.27

### Patch Changes

- Updated dependencies [083947b]
  - @ai-sdk/provider-utils@5.0.0-beta.22
  - @ai-sdk/openai-compatible@3.0.0-beta.27

## 3.0.0-beta.26

### Patch Changes

- Updated dependencies [add1126]
  - @ai-sdk/provider-utils@5.0.0-beta.21
  - @ai-sdk/openai-compatible@3.0.0-beta.26

## 3.0.0-beta.25

### Patch Changes

- b3976a2: Add workflow serialization support to all provider models.

  **`@ai-sdk/provider-utils`:** New `serializeModel()` helper that extracts only serializable properties from a model instance, filtering out functions and objects containing functions. Third-party provider authors can use this to add workflow support to their own models.

  **All providers:** `headers` is now optional in provider config types. This is non-breaking — existing code that passes `headers` continues to work. Custom provider implementations that construct model configs manually can now omit `headers`, which is useful when models are deserialized from a workflow step boundary where auth is provided separately.

  All provider model classes now include `WORKFLOW_SERIALIZE` and `WORKFLOW_DESERIALIZE` static methods, enabling them to cross workflow step boundaries without serialization errors.

- Updated dependencies [b3976a2]
- Updated dependencies [ff5eba1]
  - @ai-sdk/provider-utils@5.0.0-beta.20
  - @ai-sdk/openai-compatible@3.0.0-beta.25
  - @ai-sdk/provider@4.0.0-beta.12

## 3.0.0-beta.24

### Major Changes

- ef992f8: Remove CommonJS exports from all packages. All packages are now ESM-only (`"type": "module"`). Consumers using `require()` must switch to ESM `import` syntax.

### Patch Changes

- Updated dependencies [ef992f8]
  - @ai-sdk/openai-compatible@3.0.0-beta.24
  - @ai-sdk/provider@4.0.0-beta.11
  - @ai-sdk/provider-utils@5.0.0-beta.19

## 3.0.0-beta.23

### Patch Changes

- 90e2d8a: chore: fix unused vars not being flagged by our lint tooling
- Updated dependencies [90e2d8a]
  - @ai-sdk/openai-compatible@3.0.0-beta.23
  - @ai-sdk/provider-utils@5.0.0-beta.18

## 3.0.0-beta.22

### Patch Changes

- Updated dependencies [3ae1786]
  - @ai-sdk/provider-utils@5.0.0-beta.17
  - @ai-sdk/openai-compatible@3.0.0-beta.22

## 3.0.0-beta.21

### Patch Changes

- Updated dependencies [176466a]
  - @ai-sdk/provider@4.0.0-beta.10
  - @ai-sdk/openai-compatible@3.0.0-beta.21
  - @ai-sdk/provider-utils@5.0.0-beta.16

## 3.0.0-beta.20

### Patch Changes

- Updated dependencies [e311194]
  - @ai-sdk/provider@4.0.0-beta.9
  - @ai-sdk/openai-compatible@3.0.0-beta.20
  - @ai-sdk/provider-utils@5.0.0-beta.15

## 3.0.0-beta.19

### Patch Changes

- Updated dependencies [34bd95d]
- Updated dependencies [008271d]
  - @ai-sdk/provider@4.0.0-beta.8
  - @ai-sdk/openai-compatible@3.0.0-beta.19
  - @ai-sdk/provider-utils@5.0.0-beta.14

## 3.0.0-beta.18

### Patch Changes

- Updated dependencies [b0c2869]
- Updated dependencies [7e26e81]
  - @ai-sdk/provider-utils@5.0.0-beta.13
  - @ai-sdk/openai-compatible@3.0.0-beta.18

## 3.0.0-beta.17

### Patch Changes

- Updated dependencies [816ff67]
  - @ai-sdk/openai-compatible@3.0.0-beta.17

## 3.0.0-beta.16

### Patch Changes

- Updated dependencies [46d1149]
  - @ai-sdk/provider-utils@5.0.0-beta.12
  - @ai-sdk/openai-compatible@3.0.0-beta.16

## 3.0.0-beta.15

### Patch Changes

- Updated dependencies [6fd51c0]
  - @ai-sdk/provider-utils@5.0.0-beta.11
  - @ai-sdk/provider@4.0.0-beta.7
  - @ai-sdk/openai-compatible@3.0.0-beta.15

## 3.0.0-beta.14

### Patch Changes

- Updated dependencies [c29a26f]
  - @ai-sdk/openai-compatible@3.0.0-beta.14
  - @ai-sdk/provider-utils@5.0.0-beta.10
  - @ai-sdk/provider@4.0.0-beta.6

## 3.0.0-beta.13

### Patch Changes

- 38fc777: Add AI Gateway hint to provider READMEs
- Updated dependencies [38fc777]
  - @ai-sdk/openai-compatible@3.0.0-beta.13

## 3.0.0-beta.12

### Patch Changes

- Updated dependencies [2e17091]
  - @ai-sdk/provider-utils@5.0.0-beta.9
  - @ai-sdk/openai-compatible@3.0.0-beta.12

## 3.0.0-beta.11

### Patch Changes

- Updated dependencies [986c6fd]
- Updated dependencies [493295c]
  - @ai-sdk/provider-utils@5.0.0-beta.8
  - @ai-sdk/openai-compatible@3.0.0-beta.11

## 3.0.0-beta.10

### Patch Changes

- Updated dependencies [1f509d4]
  - @ai-sdk/provider-utils@5.0.0-beta.7
  - @ai-sdk/provider@4.0.0-beta.5
  - @ai-sdk/openai-compatible@3.0.0-beta.10

## 3.0.0-beta.9

### Patch Changes

- Updated dependencies [74d520f]
  - @ai-sdk/openai-compatible@3.0.0-beta.9

## 3.0.0-beta.8

### Patch Changes

- Updated dependencies [3887c70]
  - @ai-sdk/provider-utils@5.0.0-beta.6
  - @ai-sdk/provider@4.0.0-beta.4
  - @ai-sdk/openai-compatible@3.0.0-beta.8

## 3.0.0-beta.7

### Patch Changes

- Updated dependencies [776b617]
  - @ai-sdk/provider-utils@5.0.0-beta.5
  - @ai-sdk/provider@4.0.0-beta.3
  - @ai-sdk/openai-compatible@3.0.0-beta.7

## 3.0.0-beta.6

### Patch Changes

- Updated dependencies [61753c3]
  - @ai-sdk/provider-utils@5.0.0-beta.4
  - @ai-sdk/openai-compatible@3.0.0-beta.6

## 3.0.0-beta.5

### Patch Changes

- Updated dependencies [f7d4f01]
  - @ai-sdk/provider-utils@5.0.0-beta.3
  - @ai-sdk/provider@4.0.0-beta.2
  - @ai-sdk/openai-compatible@3.0.0-beta.5

## 3.0.0-beta.4

### Patch Changes

- Updated dependencies [5c2a5a2]
  - @ai-sdk/provider@4.0.0-beta.1
  - @ai-sdk/openai-compatible@3.0.0-beta.4
  - @ai-sdk/provider-utils@5.0.0-beta.2

## 3.0.0-beta.3

### Patch Changes

- 8f3e1da: chore(openai-compat): update v3 specs to v4
- Updated dependencies [8f3e1da]
  - @ai-sdk/openai-compatible@3.0.0-beta.3

## 3.0.0-beta.2

### Patch Changes

- Updated dependencies [45b3d76]
- Updated dependencies [f7295cb]
  - @ai-sdk/openai-compatible@3.0.0-beta.2

## 3.0.0-beta.1

### Patch Changes

- Updated dependencies [531251e]
  - @ai-sdk/provider-utils@5.0.0-beta.1
  - @ai-sdk/openai-compatible@3.0.0-beta.1

## 3.0.0-beta.0

### Major Changes

- 8359612: Start v7 pre-release

### Patch Changes

- Updated dependencies [8359612]
  - @ai-sdk/openai-compatible@3.0.0-beta.0
  - @ai-sdk/provider@4.0.0-beta.0
  - @ai-sdk/provider-utils@5.0.0-beta.0

## 2.0.10

### Patch Changes

- Updated dependencies [ad4cfc2]
  - @ai-sdk/provider-utils@4.0.19
  - @ai-sdk/openai-compatible@2.0.35

## 2.0.9

### Patch Changes

- Updated dependencies [824b295]
  - @ai-sdk/provider-utils@4.0.18
  - @ai-sdk/openai-compatible@2.0.34

## 2.0.8

### Patch Changes

- Updated dependencies [89caf28]
  - @ai-sdk/openai-compatible@2.0.33

## 2.0.7

### Patch Changes

- Updated dependencies [08336f1]
  - @ai-sdk/provider-utils@4.0.17
  - @ai-sdk/openai-compatible@2.0.32

## 2.0.6

### Patch Changes

- Updated dependencies [58bc42d]
  - @ai-sdk/provider-utils@4.0.16
  - @ai-sdk/openai-compatible@2.0.31

## 2.0.5

### Patch Changes

- Updated dependencies [4024a3a]
  - @ai-sdk/provider-utils@4.0.15
  - @ai-sdk/openai-compatible@2.0.30

## 2.0.4

### Patch Changes

- 99fbed8: feat: normalize provider specific model options type names and ensure they are exported
- Updated dependencies [99fbed8]
  - @ai-sdk/openai-compatible@2.0.29

## 2.0.3

### Patch Changes

- d999bdf: fix (provider/moonshotai): include usage when streaming

## 2.0.2

### Patch Changes

- Updated dependencies [7168375]
  - @ai-sdk/provider@3.0.8
  - @ai-sdk/openai-compatible@2.0.28
  - @ai-sdk/provider-utils@4.0.14

## 2.0.1

### Patch Changes

- Updated dependencies [9e490ad]
  - @ai-sdk/openai-compatible@2.0.27

## 2.0.0

### Major Changes

- a57c1df: feat(provider): add Moonshot AI provider

## 1.0.0

### Major Changes

- 36268ff: feat(provider): add Moonshot AI provider
