# @ai-sdk/deepseek

## 2.0.4

### Patch Changes

- Updated dependencies [d937c8f]
  - @ai-sdk/provider@3.0.2
  - @ai-sdk/provider-utils@4.0.4

## 2.0.3

### Patch Changes

- Updated dependencies [0b429d4]
  - @ai-sdk/provider-utils@4.0.3

## 2.0.2

### Patch Changes

- 863d34f: fix: trigger release to update `@latest`
- Updated dependencies [863d34f]
  - @ai-sdk/provider@3.0.1
  - @ai-sdk/provider-utils@4.0.2

## 2.0.1

### Patch Changes

- Updated dependencies [29264a3]
  - @ai-sdk/provider-utils@4.0.1

## 2.0.0

### Major Changes

- dee8b05: ai SDK 6 beta

### Minor Changes

- 78928cb: release: start 5.1 beta

### Patch Changes

- 0c3b58b: fix(provider): add specificationVersion to ProviderV3
- 8d9e8ad: chore(provider): remove generics from EmbeddingModelV3

  Before

  ```ts
  model.textEmbeddingModel('my-model-id');
  ```

  After

  ```ts
  model.embeddingModel('my-model-id');
  ```

- 2625a04: feat(openai); update spec for mcp approval
- 95f65c2: chore: use import \* from zod/v4
- 4d04f43: feat(deepseek): rewrite DeepSeek provider
- ed329cb: feat: `Provider-V3`
- 3bd2689: feat: extended token usage
- 1cad0ab: feat: add provider version to user-agent header
- 8dac895: feat: `LanguageModelV3`
- 3da75f4: Added utility ensureJsonInstructionForProvider that auto-injects a JSON instruction when the provider is deepseek.chat
- 366f50b: chore(provider): add deprecated textEmbeddingModel and textEmbedding aliases
- 4616b86: chore: update zod peer depenedency version
- cbf52cd: feat: expose raw finish reason
- 1bd7d32: feat: tool-specific strict mode
- Updated dependencies
  - @ai-sdk/provider@3.0.0
  - @ai-sdk/provider-utils@4.0.0

## 2.0.0-beta.62

### Patch Changes

- Updated dependencies [475189e]
  - @ai-sdk/provider@3.0.0-beta.32
  - @ai-sdk/provider-utils@4.0.0-beta.59

## 2.0.0-beta.61

### Patch Changes

- 2625a04: feat(openai); update spec for mcp approval
- Updated dependencies [2625a04]
  - @ai-sdk/provider@3.0.0-beta.31
  - @ai-sdk/provider-utils@4.0.0-beta.58

## 2.0.0-beta.60

### Patch Changes

- cbf52cd: feat: expose raw finish reason
- Updated dependencies [cbf52cd]
  - @ai-sdk/provider@3.0.0-beta.30
  - @ai-sdk/provider-utils@4.0.0-beta.57

## 2.0.0-beta.59

### Patch Changes

- Updated dependencies [9549c9e]
  - @ai-sdk/provider@3.0.0-beta.29
  - @ai-sdk/provider-utils@4.0.0-beta.56

## 2.0.0-beta.58

### Patch Changes

- Updated dependencies [50b70d6]
  - @ai-sdk/provider-utils@4.0.0-beta.55

## 2.0.0-beta.57

### Patch Changes

- Updated dependencies [9061dc0]
  - @ai-sdk/provider-utils@4.0.0-beta.54
  - @ai-sdk/provider@3.0.0-beta.28

## 2.0.0-beta.56

### Patch Changes

- 366f50b: chore(provider): add deprecated textEmbeddingModel and textEmbedding aliases
- Updated dependencies [366f50b]
  - @ai-sdk/provider@3.0.0-beta.27
  - @ai-sdk/provider-utils@4.0.0-beta.53

## 2.0.0-beta.55

### Patch Changes

- Updated dependencies [763d04a]
  - @ai-sdk/provider-utils@4.0.0-beta.52

## 2.0.0-beta.54

### Patch Changes

- Updated dependencies [c1efac4]
  - @ai-sdk/provider-utils@4.0.0-beta.51

## 2.0.0-beta.53

### Patch Changes

- Updated dependencies [32223c8]
  - @ai-sdk/provider-utils@4.0.0-beta.50

## 2.0.0-beta.52

### Patch Changes

- Updated dependencies [83e5744]
  - @ai-sdk/provider-utils@4.0.0-beta.49

## 2.0.0-beta.51

### Patch Changes

- Updated dependencies [960ec8f]
  - @ai-sdk/provider-utils@4.0.0-beta.48

## 2.0.0-beta.50

### Patch Changes

- Updated dependencies [e9e157f]
  - @ai-sdk/provider-utils@4.0.0-beta.47

## 2.0.0-beta.49

### Patch Changes

- Updated dependencies [81e29ab]
  - @ai-sdk/provider-utils@4.0.0-beta.46

## 2.0.0-beta.48

### Patch Changes

- 3bd2689: feat: extended token usage
- Updated dependencies [3bd2689]
  - @ai-sdk/provider@3.0.0-beta.26
  - @ai-sdk/provider-utils@4.0.0-beta.45

## 2.0.0-beta.47

### Patch Changes

- Updated dependencies [53f3368]
  - @ai-sdk/provider@3.0.0-beta.25
  - @ai-sdk/provider-utils@4.0.0-beta.44

## 2.0.0-beta.46

### Patch Changes

- Updated dependencies [dce03c4]
  - @ai-sdk/provider-utils@4.0.0-beta.43
  - @ai-sdk/provider@3.0.0-beta.24

## 2.0.0-beta.45

### Patch Changes

- Updated dependencies [3ed5519]
  - @ai-sdk/provider-utils@4.0.0-beta.42

## 2.0.0-beta.44

### Patch Changes

- 1bd7d32: feat: tool-specific strict mode
- Updated dependencies [1bd7d32]
  - @ai-sdk/provider-utils@4.0.0-beta.41
  - @ai-sdk/provider@3.0.0-beta.23

## 2.0.0-beta.43

### Patch Changes

- 4d04f43: feat(deepseek): rewrite DeepSeek provider

## 2.0.0-beta.42

### Patch Changes

- Updated dependencies [544d4e8]
  - @ai-sdk/openai-compatible@2.0.0-beta.41
  - @ai-sdk/provider-utils@4.0.0-beta.40
  - @ai-sdk/provider@3.0.0-beta.22

## 2.0.0-beta.41

### Patch Changes

- Updated dependencies [954c356]
  - @ai-sdk/provider-utils@4.0.0-beta.39
  - @ai-sdk/provider@3.0.0-beta.21
  - @ai-sdk/openai-compatible@2.0.0-beta.40

## 2.0.0-beta.40

### Patch Changes

- Updated dependencies [03849b0]
  - @ai-sdk/provider-utils@4.0.0-beta.38
  - @ai-sdk/openai-compatible@2.0.0-beta.39

## 2.0.0-beta.39

### Patch Changes

- Updated dependencies [457318b]
  - @ai-sdk/openai-compatible@2.0.0-beta.38
  - @ai-sdk/provider@3.0.0-beta.20
  - @ai-sdk/provider-utils@4.0.0-beta.37

## 2.0.0-beta.38

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
  - @ai-sdk/openai-compatible@2.0.0-beta.37
  - @ai-sdk/provider@3.0.0-beta.19
  - @ai-sdk/provider-utils@4.0.0-beta.36

## 2.0.0-beta.37

### Patch Changes

- Updated dependencies [10d819b]
  - @ai-sdk/provider@3.0.0-beta.18
  - @ai-sdk/openai-compatible@2.0.0-beta.36
  - @ai-sdk/provider-utils@4.0.0-beta.35

## 2.0.0-beta.36

### Patch Changes

- Updated dependencies [db913bd]
  - @ai-sdk/provider@3.0.0-beta.17
  - @ai-sdk/openai-compatible@2.0.0-beta.35
  - @ai-sdk/provider-utils@4.0.0-beta.34

## 2.0.0-beta.35

### Patch Changes

- 3da75f4: Added utility ensureJsonInstructionForProvider that auto-injects a JSON instruction when the provider is deepseek.chat

## 2.0.0-beta.34

### Patch Changes

- Updated dependencies [b681d7d]
  - @ai-sdk/provider@3.0.0-beta.16
  - @ai-sdk/openai-compatible@2.0.0-beta.34
  - @ai-sdk/provider-utils@4.0.0-beta.33

## 2.0.0-beta.33

### Patch Changes

- Updated dependencies [32d8dbb]
  - @ai-sdk/provider-utils@4.0.0-beta.32
  - @ai-sdk/openai-compatible@2.0.0-beta.33

## 2.0.0-beta.32

### Patch Changes

- Updated dependencies [bb36798]
  - @ai-sdk/provider@3.0.0-beta.15
  - @ai-sdk/openai-compatible@2.0.0-beta.32
  - @ai-sdk/provider-utils@4.0.0-beta.31

## 2.0.0-beta.31

### Patch Changes

- Updated dependencies [4f16c37]
  - @ai-sdk/provider-utils@4.0.0-beta.30
  - @ai-sdk/openai-compatible@2.0.0-beta.31

## 2.0.0-beta.30

### Patch Changes

- Updated dependencies [af3780b]
  - @ai-sdk/provider@3.0.0-beta.14
  - @ai-sdk/openai-compatible@2.0.0-beta.30
  - @ai-sdk/provider-utils@4.0.0-beta.29

## 2.0.0-beta.29

### Patch Changes

- Updated dependencies [016b111]
  - @ai-sdk/provider-utils@4.0.0-beta.28
  - @ai-sdk/openai-compatible@2.0.0-beta.29

## 2.0.0-beta.28

### Patch Changes

- Updated dependencies [37c58a0]
  - @ai-sdk/provider@3.0.0-beta.13
  - @ai-sdk/openai-compatible@2.0.0-beta.28
  - @ai-sdk/provider-utils@4.0.0-beta.27

## 2.0.0-beta.27

### Patch Changes

- Updated dependencies [d1bdadb]
  - @ai-sdk/provider@3.0.0-beta.12
  - @ai-sdk/openai-compatible@2.0.0-beta.27
  - @ai-sdk/provider-utils@4.0.0-beta.26

## 2.0.0-beta.26

### Patch Changes

- Updated dependencies [4c44a5b]
  - @ai-sdk/provider@3.0.0-beta.11
  - @ai-sdk/openai-compatible@2.0.0-beta.26
  - @ai-sdk/provider-utils@4.0.0-beta.25

## 2.0.0-beta.25

### Patch Changes

- 0c3b58b: fix(provider): add specificationVersion to ProviderV3
- Updated dependencies [0c3b58b]
  - @ai-sdk/openai-compatible@2.0.0-beta.25
  - @ai-sdk/provider@3.0.0-beta.10
  - @ai-sdk/provider-utils@4.0.0-beta.24

## 2.0.0-beta.24

### Patch Changes

- Updated dependencies [a755db5]
  - @ai-sdk/provider@3.0.0-beta.9
  - @ai-sdk/openai-compatible@2.0.0-beta.24
  - @ai-sdk/provider-utils@4.0.0-beta.23

## 2.0.0-beta.23

### Patch Changes

- Updated dependencies [58920e0]
  - @ai-sdk/provider-utils@4.0.0-beta.22
  - @ai-sdk/openai-compatible@2.0.0-beta.23

## 2.0.0-beta.22

### Patch Changes

- Updated dependencies [293a6b7]
  - @ai-sdk/provider-utils@4.0.0-beta.21
  - @ai-sdk/openai-compatible@2.0.0-beta.22

## 2.0.0-beta.21

### Patch Changes

- Updated dependencies [fca786b]
  - @ai-sdk/provider-utils@4.0.0-beta.20
  - @ai-sdk/openai-compatible@2.0.0-beta.21

## 2.0.0-beta.20

### Patch Changes

- Updated dependencies [3794514]
  - @ai-sdk/provider-utils@4.0.0-beta.19
  - @ai-sdk/provider@3.0.0-beta.8
  - @ai-sdk/openai-compatible@2.0.0-beta.20

## 2.0.0-beta.19

### Patch Changes

- Updated dependencies [81d4308]
  - @ai-sdk/provider@3.0.0-beta.7
  - @ai-sdk/openai-compatible@2.0.0-beta.19
  - @ai-sdk/provider-utils@4.0.0-beta.18

## 2.0.0-beta.18

### Patch Changes

- Updated dependencies [703459a]
  - @ai-sdk/provider-utils@4.0.0-beta.17
  - @ai-sdk/openai-compatible@2.0.0-beta.18

## 2.0.0-beta.17

### Patch Changes

- Updated dependencies [b689220]
  - @ai-sdk/openai-compatible@2.0.0-beta.17

## 2.0.0-beta.16

### Patch Changes

- Updated dependencies [6306603]
  - @ai-sdk/provider-utils@4.0.0-beta.16
  - @ai-sdk/openai-compatible@2.0.0-beta.16

## 2.0.0-beta.15

### Patch Changes

- Updated dependencies [f0b2157]
  - @ai-sdk/provider-utils@4.0.0-beta.15
  - @ai-sdk/openai-compatible@2.0.0-beta.15

## 2.0.0-beta.14

### Patch Changes

- Updated dependencies [3b1d015]
  - @ai-sdk/provider-utils@4.0.0-beta.14
  - @ai-sdk/openai-compatible@2.0.0-beta.14

## 2.0.0-beta.13

### Patch Changes

- Updated dependencies [d116b4b]
  - @ai-sdk/provider-utils@4.0.0-beta.13
  - @ai-sdk/openai-compatible@2.0.0-beta.13

## 2.0.0-beta.12

### Patch Changes

- Updated dependencies [7e32fea]
  - @ai-sdk/provider-utils@4.0.0-beta.12
  - @ai-sdk/openai-compatible@2.0.0-beta.12

## 2.0.0-beta.11

### Patch Changes

- 95f65c2: chore: use import \* from zod/v4
- Updated dependencies
  - @ai-sdk/openai-compatible@2.0.0-beta.11
  - @ai-sdk/provider-utils@4.0.0-beta.11

## 2.0.0-beta.10

### Major Changes

- dee8b05: ai SDK 6 beta

### Patch Changes

- Updated dependencies [dee8b05]
  - @ai-sdk/openai-compatible@2.0.0-beta.10
  - @ai-sdk/provider@3.0.0-beta.6
  - @ai-sdk/provider-utils@4.0.0-beta.10

## 1.1.0-beta.9

### Patch Changes

- Updated dependencies [521c537]
  - @ai-sdk/provider-utils@3.1.0-beta.9
  - @ai-sdk/openai-compatible@1.1.0-beta.9

## 1.1.0-beta.8

### Patch Changes

- Updated dependencies [e06565c]
  - @ai-sdk/provider-utils@3.1.0-beta.8
  - @ai-sdk/openai-compatible@1.1.0-beta.8

## 1.1.0-beta.7

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.1.0-beta.5
  - @ai-sdk/openai-compatible@1.1.0-beta.7
  - @ai-sdk/provider-utils@3.1.0-beta.7

## 1.1.0-beta.6

### Patch Changes

- Updated dependencies
  - @ai-sdk/openai-compatible@1.1.0-beta.6
  - @ai-sdk/provider-utils@3.1.0-beta.6
  - @ai-sdk/provider@2.1.0-beta.4

## 1.1.0-beta.5

### Patch Changes

- 8dac895: feat: `LanguageModelV3`
- Updated dependencies
  - @ai-sdk/openai-compatible@1.1.0-beta.5
  - @ai-sdk/provider-utils@3.1.0-beta.5
  - @ai-sdk/provider@2.1.0-beta.3

## 1.1.0-beta.4

### Patch Changes

- 4616b86: chore: update zod peer depenedency version
- Updated dependencies [4616b86]
  - @ai-sdk/openai-compatible@1.1.0-beta.4
  - @ai-sdk/provider-utils@3.1.0-beta.4

## 1.1.0-beta.3

### Patch Changes

- ed329cb: feat: `Provider-V3`
- Updated dependencies
  - @ai-sdk/openai-compatible@1.1.0-beta.3
  - @ai-sdk/provider@2.1.0-beta.2
  - @ai-sdk/provider-utils@3.1.0-beta.3

## 1.1.0-beta.2

### Patch Changes

- 1cad0ab: feat: add provider version to user-agent header
- Updated dependencies [0c4822d]
  - @ai-sdk/openai-compatible@1.1.0-beta.2
  - @ai-sdk/provider@2.1.0-beta.1
  - @ai-sdk/provider-utils@3.1.0-beta.2

## 1.1.0-beta.1

### Patch Changes

- Updated dependencies [cbb1d35]
  - @ai-sdk/provider-utils@3.1.0-beta.1
  - @ai-sdk/openai-compatible@1.1.0-beta.1

## 1.1.0-beta.0

### Minor Changes

- 78928cb: release: start 5.1 beta

### Patch Changes

- Updated dependencies [78928cb]
  - @ai-sdk/openai-compatible@1.1.0-beta.0
  - @ai-sdk/provider@2.1.0-beta.0
  - @ai-sdk/provider-utils@3.1.0-beta.0

## 1.0.18

### Patch Changes

- Updated dependencies [28363da]
  - @ai-sdk/openai-compatible@1.0.18

## 1.0.17

### Patch Changes

- Updated dependencies [3aed04c]
  - @ai-sdk/openai-compatible@1.0.17

## 1.0.16

### Patch Changes

- Updated dependencies [0294b58]
  - @ai-sdk/provider-utils@3.0.9
  - @ai-sdk/openai-compatible@1.0.16

## 1.0.15

### Patch Changes

- Updated dependencies [99964ed]
  - @ai-sdk/provider-utils@3.0.8
  - @ai-sdk/openai-compatible@1.0.15

## 1.0.14

### Patch Changes

- Updated dependencies [818f021]
  - @ai-sdk/openai-compatible@1.0.14

## 1.0.13

### Patch Changes

- Updated dependencies [886e7cd]
  - @ai-sdk/provider-utils@3.0.7
  - @ai-sdk/openai-compatible@1.0.13

## 1.0.12

### Patch Changes

- Updated dependencies [1b5a3d3]
  - @ai-sdk/provider-utils@3.0.6
  - @ai-sdk/openai-compatible@1.0.12

## 1.0.11

### Patch Changes

- Updated dependencies [0857788]
  - @ai-sdk/provider-utils@3.0.5
  - @ai-sdk/openai-compatible@1.0.11

## 1.0.10

### Patch Changes

- Updated dependencies [7ca3aee]
  - @ai-sdk/openai-compatible@1.0.10

## 1.0.9

### Patch Changes

- Updated dependencies [68751f9]
  - @ai-sdk/provider-utils@3.0.4
  - @ai-sdk/openai-compatible@1.0.9

## 1.0.8

### Patch Changes

- Updated dependencies [515c891]
  - @ai-sdk/openai-compatible@1.0.8

## 1.0.7

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.3
  - @ai-sdk/openai-compatible@1.0.7

## 1.0.6

### Patch Changes

- Updated dependencies [38ac190]
  - @ai-sdk/provider-utils@3.0.2
  - @ai-sdk/openai-compatible@1.0.6

## 1.0.5

### Patch Changes

- Updated dependencies
  - @ai-sdk/openai-compatible@1.0.5

## 1.0.4

### Patch Changes

- Updated dependencies
  - @ai-sdk/openai-compatible@1.0.4

## 1.0.3

### Patch Changes

- Updated dependencies [a0934f8]
  - @ai-sdk/openai-compatible@1.0.3

## 1.0.2

### Patch Changes

- Updated dependencies
  - @ai-sdk/openai-compatible@1.0.2
  - @ai-sdk/provider-utils@3.0.1

## 1.0.1

### Patch Changes

- Updated dependencies [0e8ed8e]
  - @ai-sdk/openai-compatible@1.0.1

## 1.0.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- fa49207: feat(providers/openai-compatible): convert to providerOptions
- e2aceaf: feat: add raw chunk support
- d1a034f: feature: using Zod 4 for internal stuff
- 205077b: fix: improve Zod compatibility
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0
  - @ai-sdk/provider@2.0.0
  - @ai-sdk/openai-compatible@1.0.0

## 1.0.0-beta.13

### Patch Changes

- Updated dependencies [88a8ee5]
  - @ai-sdk/provider-utils@3.0.0-beta.10
  - @ai-sdk/openai-compatible@1.0.0-beta.13

## 1.0.0-beta.12

### Patch Changes

- Updated dependencies [27deb4d]
  - @ai-sdk/provider@2.0.0-beta.2
  - @ai-sdk/openai-compatible@1.0.0-beta.12
  - @ai-sdk/provider-utils@3.0.0-beta.9

## 1.0.0-beta.11

### Patch Changes

- Updated dependencies [dd5fd43]
  - @ai-sdk/provider-utils@3.0.0-beta.8
  - @ai-sdk/openai-compatible@1.0.0-beta.11

## 1.0.0-beta.10

### Patch Changes

- Updated dependencies [e7fcc86]
  - @ai-sdk/provider-utils@3.0.0-beta.7
  - @ai-sdk/openai-compatible@1.0.0-beta.10

## 1.0.0-beta.9

### Patch Changes

- Updated dependencies
  - @ai-sdk/openai-compatible@1.0.0-beta.9
  - @ai-sdk/provider-utils@3.0.0-beta.6

## 1.0.0-beta.8

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.5
  - @ai-sdk/openai-compatible@1.0.0-beta.8

## 1.0.0-beta.7

### Patch Changes

- 205077b: fix: improve Zod compatibility
- Updated dependencies [205077b]
  - @ai-sdk/openai-compatible@1.0.0-beta.7
  - @ai-sdk/provider-utils@3.0.0-beta.4

## 1.0.0-beta.6

### Patch Changes

- Updated dependencies [281bb1c]
  - @ai-sdk/openai-compatible@1.0.0-beta.6

## 1.0.0-beta.5

### Patch Changes

- Updated dependencies [05d2819]
  - @ai-sdk/provider-utils@3.0.0-beta.3
  - @ai-sdk/openai-compatible@1.0.0-beta.5

## 1.0.0-beta.4

### Patch Changes

- Updated dependencies [1b101e1]
  - @ai-sdk/openai-compatible@1.0.0-beta.4

## 1.0.0-beta.3

### Patch Changes

- Updated dependencies [7b069ed]
  - @ai-sdk/openai-compatible@1.0.0-beta.3

## 1.0.0-beta.2

### Patch Changes

- d1a034f: feature: using Zod 4 for internal stuff
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.2
  - @ai-sdk/openai-compatible@1.0.0-beta.2

## 1.0.0-beta.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-beta.1
  - @ai-sdk/provider-utils@3.0.0-beta.1
  - @ai-sdk/openai-compatible@1.0.0-beta.1

## 1.0.0-alpha.15

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-alpha.15
  - @ai-sdk/provider-utils@3.0.0-alpha.15
  - @ai-sdk/openai-compatible@1.0.0-alpha.15

## 1.0.0-alpha.14

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-alpha.14
  - @ai-sdk/openai-compatible@1.0.0-alpha.14
  - @ai-sdk/provider-utils@3.0.0-alpha.14

## 1.0.0-alpha.13

### Patch Changes

- Updated dependencies [68ecf2f]
  - @ai-sdk/provider@2.0.0-alpha.13
  - @ai-sdk/openai-compatible@1.0.0-alpha.13
  - @ai-sdk/provider-utils@3.0.0-alpha.13

## 1.0.0-alpha.12

### Patch Changes

- e2aceaf: feat: add raw chunk support
- Updated dependencies [e2aceaf]
  - @ai-sdk/openai-compatible@1.0.0-alpha.12
  - @ai-sdk/provider@2.0.0-alpha.12
  - @ai-sdk/provider-utils@3.0.0-alpha.12

## 1.0.0-alpha.11

### Patch Changes

- Updated dependencies [c1e6647]
  - @ai-sdk/provider@2.0.0-alpha.11
  - @ai-sdk/openai-compatible@1.0.0-alpha.11
  - @ai-sdk/provider-utils@3.0.0-alpha.11

## 1.0.0-alpha.10

### Patch Changes

- Updated dependencies [c4df419]
  - @ai-sdk/provider@2.0.0-alpha.10
  - @ai-sdk/openai-compatible@1.0.0-alpha.10
  - @ai-sdk/provider-utils@3.0.0-alpha.10

## 1.0.0-alpha.9

### Patch Changes

- Updated dependencies [811dff3]
  - @ai-sdk/provider@2.0.0-alpha.9
  - @ai-sdk/openai-compatible@1.0.0-alpha.9
  - @ai-sdk/provider-utils@3.0.0-alpha.9

## 1.0.0-alpha.8

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-alpha.8
  - @ai-sdk/provider@2.0.0-alpha.8
  - @ai-sdk/openai-compatible@1.0.0-alpha.8

## 1.0.0-alpha.7

### Patch Changes

- Updated dependencies [5c56081]
  - @ai-sdk/provider@2.0.0-alpha.7
  - @ai-sdk/openai-compatible@1.0.0-alpha.7
  - @ai-sdk/provider-utils@3.0.0-alpha.7

## 1.0.0-alpha.6

### Patch Changes

- Updated dependencies [0d2c085]
  - @ai-sdk/provider@2.0.0-alpha.6
  - @ai-sdk/openai-compatible@1.0.0-alpha.6
  - @ai-sdk/provider-utils@3.0.0-alpha.6

## 1.0.0-alpha.4

### Patch Changes

- Updated dependencies [dc714f3]
  - @ai-sdk/provider@2.0.0-alpha.4
  - @ai-sdk/openai-compatible@1.0.0-alpha.4
  - @ai-sdk/provider-utils@3.0.0-alpha.4

## 1.0.0-alpha.3

### Patch Changes

- Updated dependencies [6b98118]
  - @ai-sdk/provider@2.0.0-alpha.3
  - @ai-sdk/openai-compatible@1.0.0-alpha.3
  - @ai-sdk/provider-utils@3.0.0-alpha.3

## 1.0.0-alpha.2

### Patch Changes

- Updated dependencies [26535e0]
  - @ai-sdk/provider@2.0.0-alpha.2
  - @ai-sdk/openai-compatible@1.0.0-alpha.2
  - @ai-sdk/provider-utils@3.0.0-alpha.2

## 1.0.0-alpha.1

### Patch Changes

- Updated dependencies [3f2f00c]
  - @ai-sdk/provider@2.0.0-alpha.1
  - @ai-sdk/openai-compatible@1.0.0-alpha.1
  - @ai-sdk/provider-utils@3.0.0-alpha.1

## 1.0.0-canary.19

### Patch Changes

- Updated dependencies [faf8446]
  - @ai-sdk/provider-utils@3.0.0-canary.19
  - @ai-sdk/openai-compatible@1.0.0-canary.19

## 1.0.0-canary.18

### Patch Changes

- Updated dependencies [40acf9b]
  - @ai-sdk/provider-utils@3.0.0-canary.18
  - @ai-sdk/openai-compatible@1.0.0-canary.18

## 1.0.0-canary.17

### Patch Changes

- Updated dependencies
  - @ai-sdk/openai-compatible@1.0.0-canary.17
  - @ai-sdk/provider-utils@3.0.0-canary.17

## 1.0.0-canary.16

### Patch Changes

- Updated dependencies [87b828f]
  - @ai-sdk/provider-utils@3.0.0-canary.16
  - @ai-sdk/openai-compatible@1.0.0-canary.16

## 1.0.0-canary.15

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.15
  - @ai-sdk/provider@2.0.0-canary.14
  - @ai-sdk/openai-compatible@1.0.0-canary.15

## 1.0.0-canary.14

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.14
  - @ai-sdk/provider@2.0.0-canary.13
  - @ai-sdk/openai-compatible@1.0.0-canary.14

## 1.0.0-canary.13

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.12
  - @ai-sdk/openai-compatible@1.0.0-canary.13
  - @ai-sdk/provider-utils@3.0.0-canary.13

## 1.0.0-canary.12

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.11
  - @ai-sdk/openai-compatible@1.0.0-canary.12
  - @ai-sdk/provider-utils@3.0.0-canary.12

## 1.0.0-canary.11

### Patch Changes

- Updated dependencies
  - @ai-sdk/openai-compatible@1.0.0-canary.11
  - @ai-sdk/provider-utils@3.0.0-canary.11
  - @ai-sdk/provider@2.0.0-canary.10

## 1.0.0-canary.10

### Patch Changes

- Updated dependencies
  - @ai-sdk/openai-compatible@1.0.0-canary.10
  - @ai-sdk/provider@2.0.0-canary.9
  - @ai-sdk/provider-utils@3.0.0-canary.10

## 1.0.0-canary.9

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.8
  - @ai-sdk/openai-compatible@1.0.0-canary.9
  - @ai-sdk/provider-utils@3.0.0-canary.9

## 1.0.0-canary.8

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.8
  - @ai-sdk/provider@2.0.0-canary.7
  - @ai-sdk/openai-compatible@1.0.0-canary.8

## 1.0.0-canary.7

### Patch Changes

- fa49207: feat(providers/openai-compatible): convert to providerOptions
- Updated dependencies
  - @ai-sdk/openai-compatible@1.0.0-canary.7
  - @ai-sdk/provider@2.0.0-canary.6
  - @ai-sdk/provider-utils@3.0.0-canary.7

## 1.0.0-canary.6

### Patch Changes

- Updated dependencies
  - @ai-sdk/openai-compatible@1.0.0-canary.6
  - @ai-sdk/provider@2.0.0-canary.5
  - @ai-sdk/provider-utils@3.0.0-canary.6

## 1.0.0-canary.5

### Patch Changes

- Updated dependencies [6f6bb89]
  - @ai-sdk/provider@2.0.0-canary.4
  - @ai-sdk/openai-compatible@1.0.0-canary.5
  - @ai-sdk/provider-utils@3.0.0-canary.5

## 1.0.0-canary.4

### Patch Changes

- Updated dependencies [d1a1aa1]
  - @ai-sdk/provider@2.0.0-canary.3
  - @ai-sdk/openai-compatible@1.0.0-canary.4
  - @ai-sdk/provider-utils@3.0.0-canary.4

## 1.0.0-canary.3

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.3
  - @ai-sdk/provider@2.0.0-canary.2
  - @ai-sdk/openai-compatible@1.0.0-canary.3

## 1.0.0-canary.2

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.1
  - @ai-sdk/openai-compatible@1.0.0-canary.2
  - @ai-sdk/provider-utils@3.0.0-canary.2

## 1.0.0-canary.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.1
  - @ai-sdk/openai-compatible@1.0.0-canary.1

## 1.0.0-canary.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- Updated dependencies [d5f588f]
  - @ai-sdk/provider-utils@3.0.0-canary.0
  - @ai-sdk/openai-compatible@1.0.0-canary.0
  - @ai-sdk/provider@2.0.0-canary.0

## 0.2.5

### Patch Changes

- Updated dependencies [d186cca]
  - @ai-sdk/openai-compatible@0.2.5

## 0.2.4

### Patch Changes

- Updated dependencies [28be004]
  - @ai-sdk/provider-utils@2.2.3
  - @ai-sdk/openai-compatible@0.2.4

## 0.2.3

### Patch Changes

- Updated dependencies [b01120e]
  - @ai-sdk/provider-utils@2.2.2
  - @ai-sdk/openai-compatible@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies [a6b55cc]
  - @ai-sdk/openai-compatible@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [f10f0fa]
  - @ai-sdk/provider-utils@2.2.1
  - @ai-sdk/openai-compatible@0.2.1

## 0.2.0

### Minor Changes

- 5bc638d: AI SDK 4.2

### Patch Changes

- Updated dependencies [5bc638d]
  - @ai-sdk/openai-compatible@0.2.0
  - @ai-sdk/provider@1.1.0
  - @ai-sdk/provider-utils@2.2.0

## 0.1.17

### Patch Changes

- Updated dependencies [d0c4659]
  - @ai-sdk/provider-utils@2.1.15
  - @ai-sdk/openai-compatible@0.1.17

## 0.1.16

### Patch Changes

- Updated dependencies [0bd5bc6]
  - @ai-sdk/provider@1.0.12
  - @ai-sdk/openai-compatible@0.1.16
  - @ai-sdk/provider-utils@2.1.14

## 0.1.15

### Patch Changes

- Updated dependencies [2e1101a]
  - @ai-sdk/provider@1.0.11
  - @ai-sdk/openai-compatible@0.1.15
  - @ai-sdk/provider-utils@2.1.13

## 0.1.14

### Patch Changes

- Updated dependencies [1531959]
  - @ai-sdk/provider-utils@2.1.12
  - @ai-sdk/openai-compatible@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies [e1d3d42]
  - @ai-sdk/openai-compatible@0.1.13
  - @ai-sdk/provider@1.0.10
  - @ai-sdk/provider-utils@2.1.11

## 0.1.12

### Patch Changes

- Updated dependencies [ddf9740]
  - @ai-sdk/provider@1.0.9
  - @ai-sdk/openai-compatible@0.1.12
  - @ai-sdk/provider-utils@2.1.10

## 0.1.11

### Patch Changes

- Updated dependencies [2761f06]
  - @ai-sdk/provider@1.0.8
  - @ai-sdk/openai-compatible@0.1.11
  - @ai-sdk/provider-utils@2.1.9

## 0.1.10

### Patch Changes

- Updated dependencies [2e898b4]
  - @ai-sdk/provider-utils@2.1.8
  - @ai-sdk/openai-compatible@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies [3ff4ef8]
  - @ai-sdk/provider-utils@2.1.7
  - @ai-sdk/openai-compatible@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies [d89c3b9]
  - @ai-sdk/provider@1.0.7
  - @ai-sdk/openai-compatible@0.1.8
  - @ai-sdk/provider-utils@2.1.6

## 0.1.7

### Patch Changes

- Updated dependencies [f2c6c37]
  - @ai-sdk/openai-compatible@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [3a602ca]
  - @ai-sdk/provider-utils@2.1.5
  - @ai-sdk/openai-compatible@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [066206e]
  - @ai-sdk/provider-utils@2.1.4
  - @ai-sdk/openai-compatible@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [39e5c1f]
  - @ai-sdk/provider-utils@2.1.3
  - @ai-sdk/openai-compatible@0.1.4

## 0.1.3

### Patch Changes

- 361fd08: chore: update a few add'l processor references to extractor
- Updated dependencies [361fd08]
  - @ai-sdk/openai-compatible@0.1.3

## 0.1.2

### Patch Changes

- ed012d2: feat (provider/deepseek): extract cache usage as provide metadata
- Updated dependencies
  - @ai-sdk/openai-compatible@0.1.2
  - @ai-sdk/provider-utils@2.1.2
  - @ai-sdk/provider@1.0.6

## 0.1.1

### Patch Changes

- 0a699f1: feat: add reasoning token support
- Updated dependencies
  - @ai-sdk/provider-utils@2.1.1
  - @ai-sdk/openai-compatible@0.1.1
  - @ai-sdk/provider@1.0.5

## 0.1.0

### Minor Changes

- 62ba5ad: release: AI SDK 4.1

### Patch Changes

- Updated dependencies [62ba5ad]
  - @ai-sdk/openai-compatible@0.1.0
  - @ai-sdk/provider-utils@2.1.0

## 0.0.6

### Patch Changes

- Updated dependencies [00114c5]
  - @ai-sdk/provider-utils@2.0.8
  - @ai-sdk/openai-compatible@0.0.18

## 0.0.5

### Patch Changes

- Updated dependencies [ae57beb]
  - @ai-sdk/openai-compatible@0.0.17

## 0.0.4

### Patch Changes

- Updated dependencies [7611964]
  - @ai-sdk/openai-compatible@0.0.16

## 0.0.3

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@2.0.7
  - @ai-sdk/openai-compatible@0.0.15

## 0.0.2

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@1.0.4
  - @ai-sdk/provider-utils@2.0.6
  - @ai-sdk/openai-compatible@0.0.14

## 0.0.1

### Patch Changes

- 7a40f5b: feat (provider/deepseek): Add DeepSeek provider.
