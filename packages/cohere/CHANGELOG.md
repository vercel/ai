# @ai-sdk/cohere

## 3.0.4

### Patch Changes

- Updated dependencies [d937c8f]
  - @ai-sdk/provider@3.0.2
  - @ai-sdk/provider-utils@4.0.4

## 3.0.3

### Patch Changes

- Updated dependencies [0b429d4]
  - @ai-sdk/provider-utils@4.0.3

## 3.0.2

### Patch Changes

- 863d34f: fix: trigger release to update `@latest`
- Updated dependencies [863d34f]
  - @ai-sdk/provider@3.0.1
  - @ai-sdk/provider-utils@4.0.2

## 3.0.1

### Patch Changes

- Updated dependencies [29264a3]
  - @ai-sdk/provider-utils@4.0.1

## 3.0.0

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
- 9524761: feat: shorthand names for reranking models
- 544d4e8: chore(specification): rename v3 provider defined tool to provider tool
- 0c4822d: feat: `EmbeddingModelV3`
- e8109d3: feat: tool execution approval
- ed329cb: feat: `Provider-V3`
- 3bd2689: feat: extended token usage
- 1cad0ab: feat: add provider version to user-agent header
- 8dac895: feat: `LanguageModelV3`
- 457318b: chore(provider,ai): switch to SharedV3Warning and unified warnings
- 366f50b: chore(provider): add deprecated textEmbeddingModel and textEmbedding aliases
- 4616b86: chore: update zod peer depenedency version
- d1bdadb: Added reranking feature
- cbf52cd: feat: expose raw finish reason
- 10c1322: fix: moved dependency `@ai-sdk/test-server` to devDependencies
- Updated dependencies
  - @ai-sdk/provider@3.0.0
  - @ai-sdk/provider-utils@4.0.0

## 3.0.0-beta.60

### Patch Changes

- Updated dependencies [475189e]
  - @ai-sdk/provider@3.0.0-beta.32
  - @ai-sdk/provider-utils@4.0.0-beta.59

## 3.0.0-beta.59

### Patch Changes

- 2625a04: feat(openai); update spec for mcp approval
- Updated dependencies [2625a04]
  - @ai-sdk/provider@3.0.0-beta.31
  - @ai-sdk/provider-utils@4.0.0-beta.58

## 3.0.0-beta.58

### Patch Changes

- cbf52cd: feat: expose raw finish reason
- Updated dependencies [cbf52cd]
  - @ai-sdk/provider@3.0.0-beta.30
  - @ai-sdk/provider-utils@4.0.0-beta.57

## 3.0.0-beta.57

### Patch Changes

- Updated dependencies [9549c9e]
  - @ai-sdk/provider@3.0.0-beta.29
  - @ai-sdk/provider-utils@4.0.0-beta.56

## 3.0.0-beta.56

### Patch Changes

- Updated dependencies [50b70d6]
  - @ai-sdk/provider-utils@4.0.0-beta.55

## 3.0.0-beta.55

### Patch Changes

- Updated dependencies [9061dc0]
  - @ai-sdk/provider-utils@4.0.0-beta.54
  - @ai-sdk/provider@3.0.0-beta.28

## 3.0.0-beta.54

### Patch Changes

- 366f50b: chore(provider): add deprecated textEmbeddingModel and textEmbedding aliases
- Updated dependencies [366f50b]
  - @ai-sdk/provider@3.0.0-beta.27
  - @ai-sdk/provider-utils@4.0.0-beta.53

## 3.0.0-beta.53

### Patch Changes

- Updated dependencies [763d04a]
  - @ai-sdk/provider-utils@4.0.0-beta.52

## 3.0.0-beta.52

### Patch Changes

- Updated dependencies [c1efac4]
  - @ai-sdk/provider-utils@4.0.0-beta.51

## 3.0.0-beta.51

### Patch Changes

- Updated dependencies [32223c8]
  - @ai-sdk/provider-utils@4.0.0-beta.50

## 3.0.0-beta.50

### Patch Changes

- Updated dependencies [83e5744]
  - @ai-sdk/provider-utils@4.0.0-beta.49

## 3.0.0-beta.49

### Patch Changes

- Updated dependencies [960ec8f]
  - @ai-sdk/provider-utils@4.0.0-beta.48

## 3.0.0-beta.48

### Patch Changes

- Updated dependencies [e9e157f]
  - @ai-sdk/provider-utils@4.0.0-beta.47

## 3.0.0-beta.47

### Patch Changes

- Updated dependencies [81e29ab]
  - @ai-sdk/provider-utils@4.0.0-beta.46

## 3.0.0-beta.46

### Patch Changes

- 3bd2689: feat: extended token usage
- Updated dependencies [3bd2689]
  - @ai-sdk/provider@3.0.0-beta.26
  - @ai-sdk/provider-utils@4.0.0-beta.45

## 3.0.0-beta.45

### Patch Changes

- Updated dependencies [53f3368]
  - @ai-sdk/provider@3.0.0-beta.25
  - @ai-sdk/provider-utils@4.0.0-beta.44

## 3.0.0-beta.44

### Patch Changes

- Updated dependencies [dce03c4]
  - @ai-sdk/provider-utils@4.0.0-beta.43
  - @ai-sdk/provider@3.0.0-beta.24

## 3.0.0-beta.43

### Patch Changes

- Updated dependencies [3ed5519]
  - @ai-sdk/provider-utils@4.0.0-beta.42

## 3.0.0-beta.42

### Patch Changes

- Updated dependencies [1bd7d32]
  - @ai-sdk/provider-utils@4.0.0-beta.41
  - @ai-sdk/provider@3.0.0-beta.23

## 3.0.0-beta.41

### Patch Changes

- 544d4e8: chore(specification): rename v3 provider defined tool to provider tool
- Updated dependencies [544d4e8]
  - @ai-sdk/provider-utils@4.0.0-beta.40
  - @ai-sdk/provider@3.0.0-beta.22

## 3.0.0-beta.40

### Patch Changes

- Updated dependencies [954c356]
  - @ai-sdk/provider-utils@4.0.0-beta.39
  - @ai-sdk/provider@3.0.0-beta.21

## 3.0.0-beta.39

### Patch Changes

- Updated dependencies [03849b0]
  - @ai-sdk/provider-utils@4.0.0-beta.38

## 3.0.0-beta.38

### Patch Changes

- 457318b: chore(provider,ai): switch to SharedV3Warning and unified warnings
- Updated dependencies [457318b]
  - @ai-sdk/provider@3.0.0-beta.20
  - @ai-sdk/provider-utils@4.0.0-beta.37

## 3.0.0-beta.37

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
  - @ai-sdk/provider@3.0.0-beta.19
  - @ai-sdk/provider-utils@4.0.0-beta.36

## 3.0.0-beta.36

### Patch Changes

- Updated dependencies [10d819b]
  - @ai-sdk/provider@3.0.0-beta.18
  - @ai-sdk/provider-utils@4.0.0-beta.35

## 3.0.0-beta.35

### Patch Changes

- Updated dependencies [db913bd]
  - @ai-sdk/provider@3.0.0-beta.17
  - @ai-sdk/provider-utils@4.0.0-beta.34

## 3.0.0-beta.34

### Patch Changes

- Updated dependencies [b681d7d]
  - @ai-sdk/provider@3.0.0-beta.16
  - @ai-sdk/provider-utils@4.0.0-beta.33

## 3.0.0-beta.33

### Patch Changes

- Updated dependencies [32d8dbb]
  - @ai-sdk/provider-utils@4.0.0-beta.32

## 3.0.0-beta.32

### Patch Changes

- Updated dependencies [bb36798]
  - @ai-sdk/provider@3.0.0-beta.15
  - @ai-sdk/provider-utils@4.0.0-beta.31

## 3.0.0-beta.31

### Patch Changes

- Updated dependencies [4f16c37]
  - @ai-sdk/provider-utils@4.0.0-beta.30

## 3.0.0-beta.30

### Patch Changes

- Updated dependencies [af3780b]
  - @ai-sdk/provider@3.0.0-beta.14
  - @ai-sdk/provider-utils@4.0.0-beta.29

## 3.0.0-beta.29

### Patch Changes

- Updated dependencies [016b111]
  - @ai-sdk/provider-utils@4.0.0-beta.28

## 3.0.0-beta.28

### Patch Changes

- Updated dependencies [37c58a0]
  - @ai-sdk/provider@3.0.0-beta.13
  - @ai-sdk/provider-utils@4.0.0-beta.27

## 3.0.0-beta.27

### Patch Changes

- 9524761: feat: shorthand names for reranking models

## 3.0.0-beta.26

### Patch Changes

- d1bdadb: Added reranking feature
- Updated dependencies [d1bdadb]
  - @ai-sdk/provider@3.0.0-beta.12
  - @ai-sdk/provider-utils@4.0.0-beta.26

## 3.0.0-beta.25

### Patch Changes

- Updated dependencies [4c44a5b]
  - @ai-sdk/provider@3.0.0-beta.11
  - @ai-sdk/provider-utils@4.0.0-beta.25

## 3.0.0-beta.24

### Patch Changes

- 0c3b58b: fix(provider): add specificationVersion to ProviderV3
- Updated dependencies [0c3b58b]
  - @ai-sdk/provider@3.0.0-beta.10
  - @ai-sdk/provider-utils@4.0.0-beta.24

## 3.0.0-beta.23

### Patch Changes

- Updated dependencies [a755db5]
  - @ai-sdk/provider@3.0.0-beta.9
  - @ai-sdk/provider-utils@4.0.0-beta.23

## 3.0.0-beta.22

### Patch Changes

- Updated dependencies [58920e0]
  - @ai-sdk/provider-utils@4.0.0-beta.22

## 3.0.0-beta.21

### Patch Changes

- Updated dependencies [293a6b7]
  - @ai-sdk/provider-utils@4.0.0-beta.21

## 3.0.0-beta.20

### Patch Changes

- Updated dependencies [fca786b]
  - @ai-sdk/provider-utils@4.0.0-beta.20

## 3.0.0-beta.19

### Patch Changes

- Updated dependencies [3794514]
  - @ai-sdk/provider-utils@4.0.0-beta.19
  - @ai-sdk/provider@3.0.0-beta.8

## 3.0.0-beta.18

### Patch Changes

- Updated dependencies [81d4308]
  - @ai-sdk/provider@3.0.0-beta.7
  - @ai-sdk/provider-utils@4.0.0-beta.18

## 3.0.0-beta.17

### Patch Changes

- Updated dependencies [703459a]
  - @ai-sdk/provider-utils@4.0.0-beta.17

## 3.0.0-beta.16

### Patch Changes

- Updated dependencies [6306603]
  - @ai-sdk/provider-utils@4.0.0-beta.16

## 3.0.0-beta.15

### Patch Changes

- Updated dependencies [f0b2157]
  - @ai-sdk/provider-utils@4.0.0-beta.15

## 3.0.0-beta.14

### Patch Changes

- Updated dependencies [3b1d015]
  - @ai-sdk/provider-utils@4.0.0-beta.14

## 3.0.0-beta.13

### Patch Changes

- Updated dependencies [d116b4b]
  - @ai-sdk/provider-utils@4.0.0-beta.13

## 3.0.0-beta.12

### Patch Changes

- Updated dependencies [7e32fea]
  - @ai-sdk/provider-utils@4.0.0-beta.12

## 3.0.0-beta.11

### Patch Changes

- 95f65c2: chore: use import \* from zod/v4
- Updated dependencies
  - @ai-sdk/provider-utils@4.0.0-beta.11

## 3.0.0-beta.10

### Major Changes

- dee8b05: ai SDK 6 beta

### Patch Changes

- Updated dependencies [dee8b05]
  - @ai-sdk/provider@3.0.0-beta.6
  - @ai-sdk/provider-utils@4.0.0-beta.10

## 2.1.0-beta.9

### Patch Changes

- Updated dependencies [521c537]
  - @ai-sdk/provider-utils@3.1.0-beta.9

## 2.1.0-beta.8

### Patch Changes

- Updated dependencies [e06565c]
  - @ai-sdk/provider-utils@3.1.0-beta.8

## 2.1.0-beta.7

### Patch Changes

- e8109d3: feat: tool execution approval
- Updated dependencies
  - @ai-sdk/provider@2.1.0-beta.5
  - @ai-sdk/provider-utils@3.1.0-beta.7

## 2.1.0-beta.6

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.1.0-beta.6
  - @ai-sdk/provider@2.1.0-beta.4

## 2.1.0-beta.5

### Patch Changes

- 8dac895: feat: `LanguageModelV3`
- 10c1322: fix: moved dependency `@ai-sdk/test-server` to devDependencies
- Updated dependencies [8dac895]
  - @ai-sdk/provider-utils@3.1.0-beta.5
  - @ai-sdk/provider@2.1.0-beta.3

## 2.1.0-beta.4

### Patch Changes

- 4616b86: chore: update zod peer depenedency version
- Updated dependencies [4616b86]
  - @ai-sdk/provider-utils@3.1.0-beta.4

## 2.1.0-beta.3

### Patch Changes

- ed329cb: feat: `Provider-V3`
- Updated dependencies
  - @ai-sdk/provider@2.1.0-beta.2
  - @ai-sdk/provider-utils@3.1.0-beta.3

## 2.1.0-beta.2

### Patch Changes

- 0c4822d: feat: `EmbeddingModelV3`
- 1cad0ab: feat: add provider version to user-agent header
- Updated dependencies [0c4822d]
  - @ai-sdk/provider@2.1.0-beta.1
  - @ai-sdk/provider-utils@3.1.0-beta.2

## 2.1.0-beta.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/test-server@1.0.0-beta.0
  - @ai-sdk/provider-utils@3.1.0-beta.1

## 2.1.0-beta.0

### Minor Changes

- 78928cb: release: start 5.1 beta

### Patch Changes

- Updated dependencies [78928cb]
  - @ai-sdk/provider@2.1.0-beta.0
  - @ai-sdk/provider-utils@3.1.0-beta.0

## 2.0.10

### Patch Changes

- Updated dependencies [0294b58]
  - @ai-sdk/provider-utils@3.0.9

## 2.0.9

### Patch Changes

- 0816d3a: feat(provider/cohere): reasoning model support

  Reasoning is now supported for all Cohere models that support it (`command-a-reasoning-08-2025` as of today). See https://docs.cohere.com/docs/reasoning

## 2.0.8

### Patch Changes

- Updated dependencies [99964ed]
  - @ai-sdk/provider-utils@3.0.8

## 2.0.7

### Patch Changes

- Updated dependencies [886e7cd]
  - @ai-sdk/provider-utils@3.0.7

## 2.0.6

### Patch Changes

- Updated dependencies [1b5a3d3]
  - @ai-sdk/provider-utils@3.0.6

## 2.0.5

### Patch Changes

- Updated dependencies [0857788]
  - @ai-sdk/provider-utils@3.0.5

## 2.0.4

### Patch Changes

- Updated dependencies [68751f9]
  - @ai-sdk/provider-utils@3.0.4

## 2.0.3

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.3

## 2.0.2

### Patch Changes

- Updated dependencies [38ac190]
  - @ai-sdk/provider-utils@3.0.2

## 2.0.1

### Patch Changes

- Updated dependencies [90d212f]
  - @ai-sdk/provider-utils@3.0.1

## 2.0.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- ef4f44e: fix (provider/cohere): tool calling
- e2aceaf: feat: add raw chunk support
- 26735b5: chore(embedding-model): add v2 interface
- 443d8ec: feat(embedding-model-v2): add response body field
- d1a034f: feature: using Zod 4 for internal stuff
- fd65bc6: chore(embedding-model-v2): rename rawResponse to response
- 205077b: fix: improve Zod compatibility
- 4fd442b: feat(cohere): add citations support for text documents
- 6f231db: fix(providers): always use optional instead of mix of nullish for providerOptions
- 77e5975: chore(providers/cohere): convert to providerOptions
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0
  - @ai-sdk/provider@2.0.0

## 2.0.0-beta.10

### Patch Changes

- Updated dependencies [88a8ee5]
  - @ai-sdk/provider-utils@3.0.0-beta.10

## 2.0.0-beta.9

### Patch Changes

- Updated dependencies [27deb4d]
  - @ai-sdk/provider@2.0.0-beta.2
  - @ai-sdk/provider-utils@3.0.0-beta.9

## 2.0.0-beta.8

### Patch Changes

- Updated dependencies [dd5fd43]
  - @ai-sdk/provider-utils@3.0.0-beta.8

## 2.0.0-beta.7

### Patch Changes

- Updated dependencies [e7fcc86]
  - @ai-sdk/provider-utils@3.0.0-beta.7

## 2.0.0-beta.6

### Patch Changes

- Updated dependencies [ac34802]
  - @ai-sdk/provider-utils@3.0.0-beta.6

## 2.0.0-beta.5

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.5

## 2.0.0-beta.4

### Patch Changes

- 205077b: fix: improve Zod compatibility
- Updated dependencies [205077b]
  - @ai-sdk/provider-utils@3.0.0-beta.4

## 2.0.0-beta.3

### Patch Changes

- Updated dependencies [05d2819]
  - @ai-sdk/provider-utils@3.0.0-beta.3

## 2.0.0-beta.2

### Patch Changes

- d1a034f: feature: using Zod 4 for internal stuff
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.2

## 2.0.0-beta.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-beta.1
  - @ai-sdk/provider-utils@3.0.0-beta.1

## 2.0.0-alpha.15

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-alpha.15
  - @ai-sdk/provider-utils@3.0.0-alpha.15

## 2.0.0-alpha.14

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-alpha.14
  - @ai-sdk/provider-utils@3.0.0-alpha.14

## 2.0.0-alpha.13

### Patch Changes

- Updated dependencies [68ecf2f]
  - @ai-sdk/provider@2.0.0-alpha.13
  - @ai-sdk/provider-utils@3.0.0-alpha.13

## 2.0.0-alpha.12

### Patch Changes

- e2aceaf: feat: add raw chunk support
- 4fd442b: feat(cohere): add citations support for text documents
- Updated dependencies [e2aceaf]
  - @ai-sdk/provider@2.0.0-alpha.12
  - @ai-sdk/provider-utils@3.0.0-alpha.12

## 2.0.0-alpha.11

### Patch Changes

- Updated dependencies [c1e6647]
  - @ai-sdk/provider@2.0.0-alpha.11
  - @ai-sdk/provider-utils@3.0.0-alpha.11

## 2.0.0-alpha.10

### Patch Changes

- Updated dependencies [c4df419]
  - @ai-sdk/provider@2.0.0-alpha.10
  - @ai-sdk/provider-utils@3.0.0-alpha.10

## 2.0.0-alpha.9

### Patch Changes

- Updated dependencies [811dff3]
  - @ai-sdk/provider@2.0.0-alpha.9
  - @ai-sdk/provider-utils@3.0.0-alpha.9

## 2.0.0-alpha.8

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-alpha.8
  - @ai-sdk/provider@2.0.0-alpha.8

## 2.0.0-alpha.7

### Patch Changes

- Updated dependencies [5c56081]
  - @ai-sdk/provider@2.0.0-alpha.7
  - @ai-sdk/provider-utils@3.0.0-alpha.7

## 2.0.0-alpha.6

### Patch Changes

- Updated dependencies [0d2c085]
  - @ai-sdk/provider@2.0.0-alpha.6
  - @ai-sdk/provider-utils@3.0.0-alpha.6

## 2.0.0-alpha.4

### Patch Changes

- Updated dependencies [dc714f3]
  - @ai-sdk/provider@2.0.0-alpha.4
  - @ai-sdk/provider-utils@3.0.0-alpha.4

## 2.0.0-alpha.3

### Patch Changes

- Updated dependencies [6b98118]
  - @ai-sdk/provider@2.0.0-alpha.3
  - @ai-sdk/provider-utils@3.0.0-alpha.3

## 2.0.0-alpha.2

### Patch Changes

- Updated dependencies [26535e0]
  - @ai-sdk/provider@2.0.0-alpha.2
  - @ai-sdk/provider-utils@3.0.0-alpha.2

## 2.0.0-alpha.1

### Patch Changes

- Updated dependencies [3f2f00c]
  - @ai-sdk/provider@2.0.0-alpha.1
  - @ai-sdk/provider-utils@3.0.0-alpha.1

## 2.0.0-canary.20

### Patch Changes

- Updated dependencies [faf8446]
  - @ai-sdk/provider-utils@3.0.0-canary.19

## 2.0.0-canary.19

### Patch Changes

- Updated dependencies [40acf9b]
  - @ai-sdk/provider-utils@3.0.0-canary.18

## 2.0.0-canary.18

### Patch Changes

- Updated dependencies [ea7a7c9]
  - @ai-sdk/provider-utils@3.0.0-canary.17

## 2.0.0-canary.17

### Patch Changes

- Updated dependencies [87b828f]
  - @ai-sdk/provider-utils@3.0.0-canary.16

## 2.0.0-canary.16

### Patch Changes

- 6f231db: fix(providers): always use optional instead of mix of nullish for providerOptions
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.15
  - @ai-sdk/provider@2.0.0-canary.14

## 2.0.0-canary.15

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.14
  - @ai-sdk/provider@2.0.0-canary.13

## 2.0.0-canary.14

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.12
  - @ai-sdk/provider-utils@3.0.0-canary.13

## 2.0.0-canary.13

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.11
  - @ai-sdk/provider-utils@3.0.0-canary.12

## 2.0.0-canary.12

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.11
  - @ai-sdk/provider@2.0.0-canary.10

## 2.0.0-canary.11

### Patch Changes

- Updated dependencies [e86be6f]
  - @ai-sdk/provider@2.0.0-canary.9
  - @ai-sdk/provider-utils@3.0.0-canary.10

## 2.0.0-canary.10

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.8
  - @ai-sdk/provider-utils@3.0.0-canary.9

## 2.0.0-canary.9

### Patch Changes

- ef4f44e: fix (provider/cohere): tool calling

## 2.0.0-canary.8

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.8
  - @ai-sdk/provider@2.0.0-canary.7

## 2.0.0-canary.7

### Patch Changes

- 26735b5: chore(embedding-model): add v2 interface
- 443d8ec: feat(embedding-model-v2): add response body field
- fd65bc6: chore(embedding-model-v2): rename rawResponse to response
- 77e5975: chore(providers/cohere): convert to providerOptions
- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.6
  - @ai-sdk/provider-utils@3.0.0-canary.7

## 2.0.0-canary.6

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.5
  - @ai-sdk/provider-utils@3.0.0-canary.6

## 2.0.0-canary.5

### Patch Changes

- Updated dependencies [6f6bb89]
  - @ai-sdk/provider@2.0.0-canary.4
  - @ai-sdk/provider-utils@3.0.0-canary.5

## 2.0.0-canary.4

### Patch Changes

- Updated dependencies [d1a1aa1]
  - @ai-sdk/provider@2.0.0-canary.3
  - @ai-sdk/provider-utils@3.0.0-canary.4

## 2.0.0-canary.3

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.3
  - @ai-sdk/provider@2.0.0-canary.2

## 2.0.0-canary.2

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.1
  - @ai-sdk/provider-utils@3.0.0-canary.2

## 2.0.0-canary.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.1

## 2.0.0-canary.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- Updated dependencies [d5f588f]
  - @ai-sdk/provider-utils@3.0.0-canary.0
  - @ai-sdk/provider@2.0.0-canary.0

## 1.2.4

### Patch Changes

- Updated dependencies [28be004]
  - @ai-sdk/provider-utils@2.2.3

## 1.2.3

### Patch Changes

- Updated dependencies [b01120e]
  - @ai-sdk/provider-utils@2.2.2

## 1.2.2

### Patch Changes

- Updated dependencies [f10f0fa]
  - @ai-sdk/provider-utils@2.2.1

## 1.2.1

### Patch Changes

- 724c0a1: chore (provider/cohere): update model versions
- f1c34e0: feat (provider/cohere): support tool calls finish reason
- 724c0a1: feat (provider/cohere): support all tool choice options
- 724c0a1: feat (provider/cohere): support object generation (json mode)
- 724c0a1: feat (provider/cohere): support object generation (tool mode)

## 1.2.0

### Minor Changes

- 5bc638d: AI SDK 4.2

### Patch Changes

- Updated dependencies [5bc638d]
  - @ai-sdk/provider@1.1.0
  - @ai-sdk/provider-utils@2.2.0

## 1.1.18

### Patch Changes

- Updated dependencies [d0c4659]
  - @ai-sdk/provider-utils@2.1.15

## 1.1.17

### Patch Changes

- Updated dependencies [0bd5bc6]
  - @ai-sdk/provider@1.0.12
  - @ai-sdk/provider-utils@2.1.14

## 1.1.16

### Patch Changes

- 4473677: feat (providers/cohere): add command-a model id to chat settings

## 1.1.15

### Patch Changes

- Updated dependencies [2e1101a]
  - @ai-sdk/provider@1.0.11
  - @ai-sdk/provider-utils@2.1.13

## 1.1.14

### Patch Changes

- Updated dependencies [1531959]
  - @ai-sdk/provider-utils@2.1.12

## 1.1.13

### Patch Changes

- e1d3d42: feat (ai): expose raw response body in generateText and generateObject
- Updated dependencies [e1d3d42]
  - @ai-sdk/provider@1.0.10
  - @ai-sdk/provider-utils@2.1.11

## 1.1.12

### Patch Changes

- Updated dependencies [ddf9740]
  - @ai-sdk/provider@1.0.9
  - @ai-sdk/provider-utils@2.1.10

## 1.1.11

### Patch Changes

- Updated dependencies [2761f06]
  - @ai-sdk/provider@1.0.8
  - @ai-sdk/provider-utils@2.1.9

## 1.1.10

### Patch Changes

- Updated dependencies [2e898b4]
  - @ai-sdk/provider-utils@2.1.8

## 1.1.9

### Patch Changes

- Updated dependencies [3ff4ef8]
  - @ai-sdk/provider-utils@2.1.7

## 1.1.8

### Patch Changes

- 0c324f7: fix (provider/cohere): deal gracefully with tools with no parameters

## 1.1.7

### Patch Changes

- 4d5e0a9: fix (provider/cohere): omit tool plan content from normal response text

## 1.1.6

### Patch Changes

- Updated dependencies [d89c3b9]
  - @ai-sdk/provider@1.0.7
  - @ai-sdk/provider-utils@2.1.6

## 1.1.5

### Patch Changes

- Updated dependencies [3a602ca]
  - @ai-sdk/provider-utils@2.1.5

## 1.1.4

### Patch Changes

- Updated dependencies [066206e]
  - @ai-sdk/provider-utils@2.1.4

## 1.1.3

### Patch Changes

- Updated dependencies [39e5c1f]
  - @ai-sdk/provider-utils@2.1.3

## 1.1.2

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@2.1.2
  - @ai-sdk/provider@1.0.6

## 1.1.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@2.1.1
  - @ai-sdk/provider@1.0.5

## 1.1.0

### Minor Changes

- 62ba5ad: release: AI SDK 4.1

### Patch Changes

- Updated dependencies [62ba5ad]
  - @ai-sdk/provider-utils@2.1.0

## 1.0.9

### Patch Changes

- Updated dependencies [00114c5]
  - @ai-sdk/provider-utils@2.0.8

## 1.0.8

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@2.0.7

## 1.0.7

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@1.0.4
  - @ai-sdk/provider-utils@2.0.6

## 1.0.6

### Patch Changes

- 5ed5e45: chore (config): Use ts-library.json tsconfig for no-UI libs.
- Updated dependencies [5ed5e45]
  - @ai-sdk/provider-utils@2.0.5
  - @ai-sdk/provider@1.0.3

## 1.0.5

### Patch Changes

- Updated dependencies [09a9cab]
  - @ai-sdk/provider@1.0.2
  - @ai-sdk/provider-utils@2.0.4

## 1.0.4

### Patch Changes

- Updated dependencies [0984f0b]
  - @ai-sdk/provider-utils@2.0.3

## 1.0.3

### Patch Changes

- Updated dependencies [b446ae5]
  - @ai-sdk/provider@1.0.1
  - @ai-sdk/provider-utils@2.0.2

## 1.0.2

### Patch Changes

- b748dfb: feat (providers): update model lists

## 1.0.1

### Patch Changes

- Updated dependencies [c3ab5de]
  - @ai-sdk/provider-utils@2.0.1

## 1.0.0

### Major Changes

- 66060f7: chore (release): bump major version to 4.0

### Patch Changes

- 3fc69d6: feat (provider/cohere): Pass along tool-plan response content.
- Updated dependencies
  - @ai-sdk/provider-utils@2.0.0
  - @ai-sdk/provider@1.0.0

## 1.0.0-canary.4

### Patch Changes

- 3fc69d6: feat (provider/cohere): Pass along tool-plan response content.

## 1.0.0-canary.3

### Patch Changes

- Updated dependencies [8426f55]
  - @ai-sdk/provider-utils@2.0.0-canary.3

## 1.0.0-canary.2

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@2.0.0-canary.2

## 1.0.0-canary.1

### Patch Changes

- Updated dependencies [b1da952]
  - @ai-sdk/provider-utils@2.0.0-canary.1

## 1.0.0-canary.0

### Major Changes

- 66060f7: chore (release): bump major version to 4.0

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@2.0.0-canary.0
  - @ai-sdk/provider@1.0.0-canary.0

## 0.0.28

### Patch Changes

- a7cbdf6: feat (provider/cohere): Use Cohere v2 API

## 0.0.27

### Patch Changes

- 3b1b69a: feat: provider-defined tools
- Updated dependencies
  - @ai-sdk/provider-utils@1.0.22
  - @ai-sdk/provider@0.0.26

## 0.0.26

### Patch Changes

- b9b0d7b: feat (ai): access raw request body
- Updated dependencies [b9b0d7b]
  - @ai-sdk/provider@0.0.25
  - @ai-sdk/provider-utils@1.0.21

## 0.0.25

### Patch Changes

- Updated dependencies [d595d0d]
  - @ai-sdk/provider@0.0.24
  - @ai-sdk/provider-utils@1.0.20

## 0.0.24

### Patch Changes

- Updated dependencies [273f696]
  - @ai-sdk/provider-utils@1.0.19

## 0.0.23

### Patch Changes

- 03313cd: feat (ai): expose response id, response model, response timestamp in telemetry and api
- Updated dependencies
  - @ai-sdk/provider-utils@1.0.18
  - @ai-sdk/provider@0.0.23

## 0.0.22

### Patch Changes

- cb2f0fa: feat (provider/cohere): add embedding support

## 0.0.21

### Patch Changes

- 26515cb: feat (ai/provider): introduce ProviderV1 specification
- Updated dependencies [26515cb]
  - @ai-sdk/provider@0.0.22
  - @ai-sdk/provider-utils@1.0.17

## 0.0.20

### Patch Changes

- Updated dependencies [09f895f]
  - @ai-sdk/provider-utils@1.0.16

## 0.0.19

### Patch Changes

- Updated dependencies [d67fa9c]
  - @ai-sdk/provider-utils@1.0.15

## 0.0.18

### Patch Changes

- 93b7b7c: feat (provider/cohere): support tool calls
- Updated dependencies [f2c025e]
  - @ai-sdk/provider@0.0.21
  - @ai-sdk/provider-utils@1.0.14

## 0.0.17

### Patch Changes

- Updated dependencies [6ac355e]
  - @ai-sdk/provider@0.0.20
  - @ai-sdk/provider-utils@1.0.13

## 0.0.16

### Patch Changes

- dd712ac: fix: use FetchFunction type to prevent self-reference
- Updated dependencies [dd712ac]
  - @ai-sdk/provider-utils@1.0.12

## 0.0.15

### Patch Changes

- 89b18ca: fix (ai/provider): send finish reason 'unknown' by default
- Updated dependencies [dd4a0f5]
  - @ai-sdk/provider@0.0.19
  - @ai-sdk/provider-utils@1.0.11

## 0.0.14

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@1.0.10
  - @ai-sdk/provider@0.0.18

## 0.0.13

### Patch Changes

- Updated dependencies [029af4c]
  - @ai-sdk/provider@0.0.17
  - @ai-sdk/provider-utils@1.0.9

## 0.0.12

### Patch Changes

- 6a5e2eb: fix (provider/cohere): send last message with request instead of first

## 0.0.11

### Patch Changes

- Updated dependencies [d58517b]
  - @ai-sdk/provider@0.0.16
  - @ai-sdk/provider-utils@1.0.8

## 0.0.10

### Patch Changes

- Updated dependencies [96aed25]
  - @ai-sdk/provider@0.0.15
  - @ai-sdk/provider-utils@1.0.7

## 0.0.9

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@1.0.6

## 0.0.8

### Patch Changes

- Updated dependencies [a8d1c9e9]
  - @ai-sdk/provider-utils@1.0.5
  - @ai-sdk/provider@0.0.14

## 0.0.7

### Patch Changes

- Updated dependencies [4f88248f]
  - @ai-sdk/provider-utils@1.0.4

## 0.0.6

### Patch Changes

- 2b9da0f0: feat (core): support stopSequences setting.
- a5b58845: feat (core): support topK setting
- 4aa8deb3: feat (provider): support responseFormat setting in provider api
- 13b27ec6: chore (ai/core): remove grammar mode
- Updated dependencies
  - @ai-sdk/provider@0.0.13
  - @ai-sdk/provider-utils@1.0.3

## 0.0.5

### Patch Changes

- Updated dependencies [b7290943]
  - @ai-sdk/provider@0.0.12
  - @ai-sdk/provider-utils@1.0.2

## 0.0.4

### Patch Changes

- Updated dependencies [d481729f]
  - @ai-sdk/provider-utils@1.0.1

## 0.0.3

### Patch Changes

- 5edc6110: feat (ai/core): add custom request header support
- Updated dependencies
  - @ai-sdk/provider@0.0.11
  - @ai-sdk/provider-utils@1.0.0

## 0.0.2

### Patch Changes

- Updated dependencies [02f6a088]
  - @ai-sdk/provider-utils@0.0.16

## 0.0.1

### Patch Changes

- 85712895: feat (@ai-sdk/cohere): add Cohere provider for text generation and streaming
- Updated dependencies
  - @ai-sdk/provider-utils@0.0.15
