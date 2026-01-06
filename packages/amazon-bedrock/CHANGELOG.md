# @ai-sdk/amazon-bedrock

## 4.0.9

### Patch Changes

- Updated dependencies [d937c8f]
  - @ai-sdk/provider@3.0.2
  - @ai-sdk/anthropic@3.0.7
  - @ai-sdk/provider-utils@4.0.4

## 4.0.8

### Patch Changes

- Updated dependencies [2231e84]
  - @ai-sdk/anthropic@3.0.6

## 4.0.7

### Patch Changes

- Updated dependencies [0b429d4]
  - @ai-sdk/provider-utils@4.0.3
  - @ai-sdk/anthropic@3.0.5

## 4.0.6

### Patch Changes

- Updated dependencies [bf39dac]
  - @ai-sdk/anthropic@3.0.4

## 4.0.5

### Patch Changes

- Updated dependencies [77b760d]
  - @ai-sdk/anthropic@3.0.3

## 4.0.4

### Patch Changes

- 863d34f: fix: trigger release to update `@latest`
- Updated dependencies [863d34f]
  - @ai-sdk/anthropic@3.0.2
  - @ai-sdk/provider@3.0.1
  - @ai-sdk/provider-utils@4.0.2

## 4.0.3

### Patch Changes

- afe9730: Fix bedrock ConverseStream using /delta/stop_sequence

## 4.0.2

### Patch Changes

- Updated dependencies [29264a3]
  - @ai-sdk/provider-utils@4.0.1
  - @ai-sdk/anthropic@3.0.1

## 4.0.1

### Patch Changes

- 9260982: handle `stop_sequence: null`

## 4.0.0

### Major Changes

- dee8b05: ai SDK 6 beta

### Minor Changes

- 78928cb: release: start 5.1 beta

### Patch Changes

- 0c3b58b: fix(provider): add specificationVersion to ProviderV3
- ef9d7d6: fix(bedrock): send {} as tool input when streaming tool calls without arguments
- 9ab6ebe: feat(provider/amazon-bedrock): expose stop_sequence in provider metadata

  The Bedrock provider now exposes the specific stop sequence that triggered generation to halt via `providerMetadata.bedrock.stopSequence`. This is implemented by:

  - Requesting `/stop_sequence` via `additionalModelResponseFieldPaths` in the API call
  - Parsing the value from `additionalModelResponseFields.stop_sequence` in both generate and stream responses
  - Exposing it as `stopSequence` in the provider metadata (returns `null` when no stop sequence was matched)

- 0adc679: feat(provider): shared spec v3
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
- cc24427: Fix reasoning with Bedrock when additionalModelRequestFields is used
- 95f65c2: chore: use import \* from zod/v4
- 58920e0: refactor: consolidate header normalization across packages, remove duplicates, preserve custom headers
- 2a2e17d: fix (provider/amazon-bedrock): deal gracefully with empty tool descriptions
- 9524761: feat: shorthand names for reranking models
- 544d4e8: chore(specification): rename v3 provider defined tool to provider tool
- 0c4822d: feat: `EmbeddingModelV3`
- 33343c3: fix(amazon-bedrock): clamp temperature to valid 0-1 range with warnings
- 11eefa4: Support user provided filenames in amazon-bedrock-provider
- e8109d3: feat: tool execution approval
- ed329cb: feat: `Provider-V3`
- 3bd2689: feat: extended token usage
- d1bdadb: Added support for reranking models
- 1cad0ab: feat: add provider version to user-agent header
- d711ff8: chore: add model ID for Haiku 4.5
- 8dac895: feat: `LanguageModelV3`
- 457318b: chore(provider,ai): switch to SharedV3Warning and unified warnings
- 9061dc0: feat: image editing
- 366f50b: chore(provider): add deprecated textEmbeddingModel and textEmbedding aliases
- c5e2a7c: Support citations in amazon-bedrock-provider
- 4616b86: chore: update zod peer depenedency version
- d4b2964: fix(provider/amazon-bedrock): normalise headers and body if input is of instance Request
- 88b2c7e: feat(provider/amazon-bedrock,provider/google-vertex-anthropic): add support for tool calling with structured output

  Added support for combining tool calling with structured outputs in both Amazon Bedrock and Google Vertex Anthropic providers. This allows developers to use tools (like weather lookups, web search, etc.) alongside structured JSON output schemas, enabling multi-step agentic workflows with structured final outputs.

  **Amazon Bedrock Changes:**

  - Removed incorrect warning that prevented using tools with JSON response format
  - Updated tool choice to use `{ type: 'required' }` instead of specific tool selection when using structured outputs
  - Added `isJsonResponseFromTool` parameter to finish reason mapping
  - JSON tool responses are correctly converted to text content and finish reason is mapped from `tool_use` to `stop`
  - Added comprehensive test coverage for combining tools with structured outputs
  - Added example files demonstrating the feature

  **Google Vertex Anthropic Changes:**

  - Inherits support from underlying Anthropic provider implementation
  - Added test coverage to verify the feature works correctly
  - Added example files demonstrating the feature

  This brings Anthropic provider's structured output capabilities to the Amazon Bedrock and Google Vertex Anthropic providers.

- 3aeb791: Add Claude Sonnet 4.5 (claude-sonnet-4-5-20250929-v1:0) model support
- 522f6b8: feat: `ImageModelV3`
- 0a6fd91: fix(amazon-bedrock): move anthropic_beta to request body
- 3794514: feat: flexible tool output content support
- cbf52cd: feat: expose raw finish reason
- f65d7df: feat(provider/bedrock): Support Nova 2 extended reasoning `maxReasoningEffort` field
- 10c1322: fix: moved dependency `@ai-sdk/test-server` to devDependencies
- 9ab6ebe: Add stop sequence support for amazon bedrock provider
- 1bd7d32: feat: tool-specific strict mode
- Updated dependencies
  - @ai-sdk/anthropic@3.0.0
  - @ai-sdk/provider@3.0.0
  - @ai-sdk/provider-utils@4.0.0

## 4.0.0-beta.109

### Patch Changes

- Updated dependencies [2049c5b]
  - @ai-sdk/anthropic@3.0.0-beta.98

## 4.0.0-beta.108

### Patch Changes

- Updated dependencies [475189e]
  - @ai-sdk/provider@3.0.0-beta.32
  - @ai-sdk/anthropic@3.0.0-beta.97
  - @ai-sdk/provider-utils@4.0.0-beta.59

## 4.0.0-beta.107

### Patch Changes

- 2625a04: feat(openai); update spec for mcp approval
- Updated dependencies [2625a04]
  - @ai-sdk/anthropic@3.0.0-beta.96
  - @ai-sdk/provider@3.0.0-beta.31
  - @ai-sdk/provider-utils@4.0.0-beta.58

## 4.0.0-beta.106

### Patch Changes

- cbf52cd: feat: expose raw finish reason
- Updated dependencies [cbf52cd]
  - @ai-sdk/anthropic@3.0.0-beta.95
  - @ai-sdk/provider@3.0.0-beta.30
  - @ai-sdk/provider-utils@4.0.0-beta.57

## 4.0.0-beta.105

### Patch Changes

- Updated dependencies [9549c9e]
  - @ai-sdk/provider@3.0.0-beta.29
  - @ai-sdk/anthropic@3.0.0-beta.94
  - @ai-sdk/provider-utils@4.0.0-beta.56

## 4.0.0-beta.104

### Patch Changes

- Updated dependencies [50b70d6]
  - @ai-sdk/provider-utils@4.0.0-beta.55
  - @ai-sdk/anthropic@3.0.0-beta.93

## 4.0.0-beta.103

### Patch Changes

- 9061dc0: feat: image editing
- Updated dependencies [9061dc0]
  - @ai-sdk/provider-utils@4.0.0-beta.54
  - @ai-sdk/provider@3.0.0-beta.28
  - @ai-sdk/anthropic@3.0.0-beta.92

## 4.0.0-beta.102

### Patch Changes

- 9ab6ebe: feat(provider/amazon-bedrock): expose stop_sequence in provider metadata

  The Bedrock provider now exposes the specific stop sequence that triggered generation to halt via `providerMetadata.bedrock.stopSequence`. This is implemented by:

  - Requesting `/stop_sequence` via `additionalModelResponseFieldPaths` in the API call
  - Parsing the value from `additionalModelResponseFields.stop_sequence` in both generate and stream responses
  - Exposing it as `stopSequence` in the provider metadata (returns `null` when no stop sequence was matched)

- 9ab6ebe: Add stop sequence support for amazon bedrock provider

## 4.0.0-beta.101

### Patch Changes

- Updated dependencies [d129d89]
  - @ai-sdk/anthropic@3.0.0-beta.91

## 4.0.0-beta.100

### Patch Changes

- 366f50b: chore(provider): add deprecated textEmbeddingModel and textEmbedding aliases
- Updated dependencies [366f50b]
  - @ai-sdk/anthropic@3.0.0-beta.90
  - @ai-sdk/provider@3.0.0-beta.27
  - @ai-sdk/provider-utils@4.0.0-beta.53

## 4.0.0-beta.99

### Patch Changes

- Updated dependencies [763d04a]
  - @ai-sdk/provider-utils@4.0.0-beta.52
  - @ai-sdk/anthropic@3.0.0-beta.89

## 4.0.0-beta.98

### Patch Changes

- Updated dependencies [87db851]
  - @ai-sdk/anthropic@3.0.0-beta.88

## 4.0.0-beta.97

### Patch Changes

- Updated dependencies [c1efac4]
  - @ai-sdk/provider-utils@4.0.0-beta.51
  - @ai-sdk/anthropic@3.0.0-beta.87

## 4.0.0-beta.96

### Patch Changes

- Updated dependencies [32223c8]
  - @ai-sdk/provider-utils@4.0.0-beta.50
  - @ai-sdk/anthropic@3.0.0-beta.86

## 4.0.0-beta.95

### Patch Changes

- Updated dependencies [83e5744]
  - @ai-sdk/provider-utils@4.0.0-beta.49
  - @ai-sdk/anthropic@3.0.0-beta.85

## 4.0.0-beta.94

### Patch Changes

- Updated dependencies [960ec8f]
  - @ai-sdk/provider-utils@4.0.0-beta.48
  - @ai-sdk/anthropic@3.0.0-beta.84

## 4.0.0-beta.93

### Patch Changes

- Updated dependencies [6c38080]
  - @ai-sdk/anthropic@3.0.0-beta.83

## 4.0.0-beta.92

### Patch Changes

- Updated dependencies [e9e157f]
  - @ai-sdk/provider-utils@4.0.0-beta.47
  - @ai-sdk/anthropic@3.0.0-beta.82

## 4.0.0-beta.91

### Patch Changes

- Updated dependencies [81e29ab]
  - @ai-sdk/provider-utils@4.0.0-beta.46
  - @ai-sdk/anthropic@3.0.0-beta.81

## 4.0.0-beta.90

### Patch Changes

- Updated dependencies [05d5b9a]
  - @ai-sdk/anthropic@3.0.0-beta.80

## 4.0.0-beta.89

### Patch Changes

- 3bd2689: feat: extended token usage
- Updated dependencies [3bd2689]
  - @ai-sdk/anthropic@3.0.0-beta.79
  - @ai-sdk/provider@3.0.0-beta.26
  - @ai-sdk/provider-utils@4.0.0-beta.45

## 4.0.0-beta.88

### Patch Changes

- Updated dependencies [9e1e758]
  - @ai-sdk/anthropic@3.0.0-beta.78

## 4.0.0-beta.87

### Patch Changes

- Updated dependencies [b2dbfbf]
  - @ai-sdk/anthropic@3.0.0-beta.77

## 4.0.0-beta.86

### Patch Changes

- Updated dependencies [53f3368]
  - @ai-sdk/provider@3.0.0-beta.25
  - @ai-sdk/anthropic@3.0.0-beta.76
  - @ai-sdk/provider-utils@4.0.0-beta.44

## 4.0.0-beta.85

### Patch Changes

- Updated dependencies [0ae783e]
  - @ai-sdk/anthropic@3.0.0-beta.75

## 4.0.0-beta.84

### Patch Changes

- Updated dependencies [dce03c4]
  - @ai-sdk/provider-utils@4.0.0-beta.43
  - @ai-sdk/anthropic@3.0.0-beta.74
  - @ai-sdk/provider@3.0.0-beta.24

## 4.0.0-beta.83

### Patch Changes

- Updated dependencies [3ed5519]
  - @ai-sdk/provider-utils@4.0.0-beta.42
  - @ai-sdk/anthropic@3.0.0-beta.73

## 4.0.0-beta.82

### Patch Changes

- ef9d7d6: fix(bedrock): send {} as tool input when streaming tool calls without arguments

## 4.0.0-beta.81

### Patch Changes

- Updated dependencies [a5f77a6]
  - @ai-sdk/anthropic@3.0.0-beta.72

## 4.0.0-beta.80

### Patch Changes

- f65d7df: feat(provider/bedrock): Support Nova 2 extended reasoning `maxReasoningEffort` field

## 4.0.0-beta.79

### Patch Changes

- 1bd7d32: feat: tool-specific strict mode
- Updated dependencies [1bd7d32]
  - @ai-sdk/provider-utils@4.0.0-beta.41
  - @ai-sdk/anthropic@3.0.0-beta.71
  - @ai-sdk/provider@3.0.0-beta.23

## 4.0.0-beta.78

### Patch Changes

- Updated dependencies [f13958c]
  - @ai-sdk/anthropic@3.0.0-beta.70

## 4.0.0-beta.77

### Patch Changes

- Updated dependencies [589a4ee]
  - @ai-sdk/anthropic@3.0.0-beta.69

## 4.0.0-beta.76

### Patch Changes

- Updated dependencies [9e35785]
  - @ai-sdk/anthropic@3.0.0-beta.68

## 4.0.0-beta.75

### Patch Changes

- Updated dependencies [eb56fc6]
  - @ai-sdk/anthropic@3.0.0-beta.67

## 4.0.0-beta.74

### Patch Changes

- 544d4e8: chore(specification): rename v3 provider defined tool to provider tool
- Updated dependencies [544d4e8]
  - @ai-sdk/provider-utils@4.0.0-beta.40
  - @ai-sdk/anthropic@3.0.0-beta.66
  - @ai-sdk/provider@3.0.0-beta.22

## 4.0.0-beta.73

### Patch Changes

- Updated dependencies [954c356]
  - @ai-sdk/provider-utils@4.0.0-beta.39
  - @ai-sdk/anthropic@3.0.0-beta.65
  - @ai-sdk/provider@3.0.0-beta.21

## 4.0.0-beta.72

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@4.0.0-beta.38
  - @ai-sdk/anthropic@3.0.0-beta.64

## 4.0.0-beta.71

### Patch Changes

- 457318b: chore(provider,ai): switch to SharedV3Warning and unified warnings
- Updated dependencies [457318b]
  - @ai-sdk/anthropic@3.0.0-beta.63
  - @ai-sdk/provider@3.0.0-beta.20
  - @ai-sdk/provider-utils@4.0.0-beta.37

## 4.0.0-beta.70

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
  - @ai-sdk/anthropic@3.0.0-beta.62
  - @ai-sdk/provider@3.0.0-beta.19
  - @ai-sdk/provider-utils@4.0.0-beta.36

## 4.0.0-beta.69

### Patch Changes

- Updated dependencies [10d819b]
  - @ai-sdk/provider@3.0.0-beta.18
  - @ai-sdk/anthropic@3.0.0-beta.61
  - @ai-sdk/provider-utils@4.0.0-beta.35

## 4.0.0-beta.68

### Patch Changes

- Updated dependencies [6fc35cb]
  - @ai-sdk/anthropic@3.0.0-beta.60

## 4.0.0-beta.67

### Patch Changes

- Updated dependencies [2109385]
  - @ai-sdk/anthropic@3.0.0-beta.59

## 4.0.0-beta.66

### Patch Changes

- Updated dependencies [83aaad8]
  - @ai-sdk/anthropic@3.0.0-beta.58

## 4.0.0-beta.65

### Patch Changes

- Updated dependencies [b8ea36e]
  - @ai-sdk/anthropic@3.0.0-beta.57

## 4.0.0-beta.64

### Patch Changes

- Updated dependencies [983e394]
  - @ai-sdk/anthropic@3.0.0-beta.56

## 4.0.0-beta.63

### Patch Changes

- Updated dependencies [db913bd]
  - @ai-sdk/provider@3.0.0-beta.17
  - @ai-sdk/anthropic@3.0.0-beta.55
  - @ai-sdk/provider-utils@4.0.0-beta.34

## 4.0.0-beta.62

### Patch Changes

- 88b2c7e: feat(provider/amazon-bedrock,provider/google-vertex-anthropic): add support for tool calling with structured output

  Added support for combining tool calling with structured outputs in both Amazon Bedrock and Google Vertex Anthropic providers. This allows developers to use tools (like weather lookups, web search, etc.) alongside structured JSON output schemas, enabling multi-step agentic workflows with structured final outputs.

  **Amazon Bedrock Changes:**

  - Removed incorrect warning that prevented using tools with JSON response format
  - Updated tool choice to use `{ type: 'required' }` instead of specific tool selection when using structured outputs
  - Added `isJsonResponseFromTool` parameter to finish reason mapping
  - JSON tool responses are correctly converted to text content and finish reason is mapped from `tool_use` to `stop`
  - Added comprehensive test coverage for combining tools with structured outputs
  - Added example files demonstrating the feature

  **Google Vertex Anthropic Changes:**

  - Inherits support from underlying Anthropic provider implementation
  - Added test coverage to verify the feature works correctly
  - Added example files demonstrating the feature

  This brings Anthropic provider's structured output capabilities to the Amazon Bedrock and Google Vertex Anthropic providers.

## 4.0.0-beta.61

### Patch Changes

- 0a6fd91: fix(amazon-bedrock): move anthropic_beta to request body

## 4.0.0-beta.60

### Patch Changes

- 33343c3: fix(amazon-bedrock): clamp temperature to valid 0-1 range with warnings
- Updated dependencies [1d15673]
  - @ai-sdk/anthropic@3.0.0-beta.54

## 4.0.0-beta.59

### Patch Changes

- 2a2e17d: fix (provider/amazon-bedrock): deal gracefully with empty tool descriptions

## 4.0.0-beta.58

### Patch Changes

- Updated dependencies [b681d7d]
  - @ai-sdk/provider@3.0.0-beta.16
  - @ai-sdk/anthropic@3.0.0-beta.53
  - @ai-sdk/provider-utils@4.0.0-beta.33

## 4.0.0-beta.57

### Patch Changes

- Updated dependencies [32d8dbb]
  - @ai-sdk/provider-utils@4.0.0-beta.32
  - @ai-sdk/anthropic@3.0.0-beta.52

## 4.0.0-beta.56

### Patch Changes

- Updated dependencies [1742445]
  - @ai-sdk/anthropic@3.0.0-beta.51

## 4.0.0-beta.55

### Patch Changes

- Updated dependencies [bb36798]
  - @ai-sdk/provider@3.0.0-beta.15
  - @ai-sdk/anthropic@3.0.0-beta.50
  - @ai-sdk/provider-utils@4.0.0-beta.31

## 4.0.0-beta.54

### Patch Changes

- Updated dependencies [4f16c37]
  - @ai-sdk/provider-utils@4.0.0-beta.30
  - @ai-sdk/anthropic@3.0.0-beta.49

## 4.0.0-beta.53

### Patch Changes

- Updated dependencies [af3780b]
  - @ai-sdk/provider@3.0.0-beta.14
  - @ai-sdk/anthropic@3.0.0-beta.48
  - @ai-sdk/provider-utils@4.0.0-beta.29

## 4.0.0-beta.52

### Patch Changes

- Updated dependencies [016b111]
  - @ai-sdk/provider-utils@4.0.0-beta.28
  - @ai-sdk/anthropic@3.0.0-beta.47

## 4.0.0-beta.51

### Patch Changes

- Updated dependencies [37c58a0]
  - @ai-sdk/provider@3.0.0-beta.13
  - @ai-sdk/anthropic@3.0.0-beta.46
  - @ai-sdk/provider-utils@4.0.0-beta.27

## 4.0.0-beta.50

### Patch Changes

- Updated dependencies [f4e4a95]
  - @ai-sdk/anthropic@3.0.0-beta.45

## 4.0.0-beta.49

### Patch Changes

- Updated dependencies [cf4e2a9]
  - @ai-sdk/anthropic@3.0.0-beta.44

## 4.0.0-beta.48

### Patch Changes

- 9524761: feat: shorthand names for reranking models

## 4.0.0-beta.47

### Patch Changes

- d1bdadb: Added support for reranking models
- Updated dependencies [d1bdadb]
  - @ai-sdk/provider@3.0.0-beta.12
  - @ai-sdk/anthropic@3.0.0-beta.43
  - @ai-sdk/provider-utils@4.0.0-beta.26

## 4.0.0-beta.46

### Patch Changes

- Updated dependencies [4c44a5b]
  - @ai-sdk/provider@3.0.0-beta.11
  - @ai-sdk/anthropic@3.0.0-beta.42
  - @ai-sdk/provider-utils@4.0.0-beta.25

## 4.0.0-beta.45

### Patch Changes

- 0c3b58b: fix(provider): add specificationVersion to ProviderV3
- Updated dependencies [0c3b58b]
  - @ai-sdk/anthropic@3.0.0-beta.41
  - @ai-sdk/provider@3.0.0-beta.10
  - @ai-sdk/provider-utils@4.0.0-beta.24

## 4.0.0-beta.44

### Patch Changes

- Updated dependencies [a755db5]
  - @ai-sdk/provider@3.0.0-beta.9
  - @ai-sdk/anthropic@3.0.0-beta.40
  - @ai-sdk/provider-utils@4.0.0-beta.23

## 4.0.0-beta.43

### Patch Changes

- 58920e0: refactor: consolidate header normalization across packages, remove duplicates, preserve custom headers
- Updated dependencies [58920e0]
  - @ai-sdk/provider-utils@4.0.0-beta.22
  - @ai-sdk/anthropic@3.0.0-beta.39

## 4.0.0-beta.42

### Patch Changes

- Updated dependencies [293a6b7]
  - @ai-sdk/provider-utils@4.0.0-beta.21
  - @ai-sdk/anthropic@3.0.0-beta.38

## 4.0.0-beta.41

### Patch Changes

- Updated dependencies [7c4328e]
  - @ai-sdk/anthropic@3.0.0-beta.37

## 4.0.0-beta.40

### Patch Changes

- Updated dependencies [21f378c]
  - @ai-sdk/anthropic@3.0.0-beta.36

## 4.0.0-beta.39

### Patch Changes

- Updated dependencies [80894b3]
  - @ai-sdk/anthropic@3.0.0-beta.35

## 4.0.0-beta.38

### Patch Changes

- Updated dependencies [fca786b]
  - @ai-sdk/provider-utils@4.0.0-beta.20
  - @ai-sdk/anthropic@3.0.0-beta.34

## 4.0.0-beta.37

### Patch Changes

- Updated dependencies [0e38a79]
  - @ai-sdk/anthropic@3.0.0-beta.33

## 4.0.0-beta.36

### Patch Changes

- Updated dependencies [f4db7b5]
  - @ai-sdk/anthropic@3.0.0-beta.32

## 4.0.0-beta.35

### Patch Changes

- Updated dependencies [ca07285]
  - @ai-sdk/anthropic@3.0.0-beta.31

## 4.0.0-beta.34

### Patch Changes

- Updated dependencies [9354297]
  - @ai-sdk/anthropic@3.0.0-beta.30

## 4.0.0-beta.33

### Patch Changes

- 3794514: feat: flexible tool output content support
- Updated dependencies [3794514]
  - @ai-sdk/provider-utils@4.0.0-beta.19
  - @ai-sdk/anthropic@3.0.0-beta.29
  - @ai-sdk/provider@3.0.0-beta.8

## 4.0.0-beta.32

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@3.0.0-beta.28
  - @ai-sdk/provider@3.0.0-beta.7
  - @ai-sdk/provider-utils@4.0.0-beta.18

## 4.0.0-beta.31

### Patch Changes

- Updated dependencies [4c5a6be]
  - @ai-sdk/anthropic@3.0.0-beta.27

## 4.0.0-beta.30

### Patch Changes

- d711ff8: chore: add model ID for Haiku 4.5
- Updated dependencies [f33a018]
  - @ai-sdk/anthropic@3.0.0-beta.26

## 4.0.0-beta.29

### Patch Changes

- Updated dependencies [703459a]
  - @ai-sdk/provider-utils@4.0.0-beta.17
  - @ai-sdk/anthropic@3.0.0-beta.25

## 4.0.0-beta.28

### Patch Changes

- Updated dependencies [d08308b]
  - @ai-sdk/anthropic@3.0.0-beta.24

## 4.0.0-beta.27

### Patch Changes

- Updated dependencies [6f845b4]
  - @ai-sdk/anthropic@3.0.0-beta.23

## 4.0.0-beta.26

### Patch Changes

- cc24427: Fix reasoning with Bedrock when additionalModelRequestFields is used

## 4.0.0-beta.25

### Patch Changes

- Updated dependencies [ed537e1]
  - @ai-sdk/anthropic@3.0.0-beta.22

## 4.0.0-beta.24

### Patch Changes

- Updated dependencies [6306603]
  - @ai-sdk/provider-utils@4.0.0-beta.16
  - @ai-sdk/anthropic@3.0.0-beta.21

## 4.0.0-beta.23

### Patch Changes

- Updated dependencies [f0b2157]
  - @ai-sdk/provider-utils@4.0.0-beta.15
  - @ai-sdk/anthropic@3.0.0-beta.20

## 4.0.0-beta.22

### Patch Changes

- Updated dependencies [3b1d015]
  - @ai-sdk/provider-utils@4.0.0-beta.14
  - @ai-sdk/anthropic@3.0.0-beta.19

## 4.0.0-beta.21

### Patch Changes

- Updated dependencies [d116b4b]
  - @ai-sdk/provider-utils@4.0.0-beta.13
  - @ai-sdk/anthropic@3.0.0-beta.18

## 4.0.0-beta.20

### Patch Changes

- Updated dependencies [7e32fea]
  - @ai-sdk/provider-utils@4.0.0-beta.12
  - @ai-sdk/anthropic@3.0.0-beta.17

## 4.0.0-beta.19

### Patch Changes

- Updated dependencies [9cff587]
  - @ai-sdk/anthropic@3.0.0-beta.16

## 4.0.0-beta.18

### Patch Changes

- 95f65c2: chore: use import \* from zod/v4
- Updated dependencies
  - @ai-sdk/provider-utils@4.0.0-beta.11
  - @ai-sdk/anthropic@3.0.0-beta.15

## 4.0.0-beta.17

### Major Changes

- dee8b05: ai SDK 6 beta

### Patch Changes

- Updated dependencies [dee8b05]
  - @ai-sdk/anthropic@3.0.0-beta.14
  - @ai-sdk/provider@3.0.0-beta.6
  - @ai-sdk/provider-utils@4.0.0-beta.10

## 3.1.0-beta.16

### Patch Changes

- Updated dependencies [521c537]
  - @ai-sdk/provider-utils@3.1.0-beta.9
  - @ai-sdk/anthropic@2.1.0-beta.13

## 3.1.0-beta.15

### Patch Changes

- Updated dependencies [e06565c]
  - @ai-sdk/provider-utils@3.1.0-beta.8
  - @ai-sdk/anthropic@2.1.0-beta.12

## 3.1.0-beta.14

### Patch Changes

- 11eefa4: Support user provided filenames in amazon-bedrock-provider

## 3.1.0-beta.13

### Patch Changes

- e8109d3: feat: tool execution approval
- Updated dependencies
  - @ai-sdk/provider@2.1.0-beta.5
  - @ai-sdk/provider-utils@3.1.0-beta.7
  - @ai-sdk/anthropic@2.1.0-beta.11

## 3.1.0-beta.12

### Patch Changes

- Updated dependencies [dedf206]
  - @ai-sdk/anthropic@2.1.0-beta.10

## 3.1.0-beta.11

### Patch Changes

- 0adc679: feat(provider): shared spec v3
- Updated dependencies
  - @ai-sdk/provider-utils@3.1.0-beta.6
  - @ai-sdk/anthropic@2.1.0-beta.9
  - @ai-sdk/provider@2.1.0-beta.4

## 3.1.0-beta.10

### Patch Changes

- c5e2a7c: Support citations in amazon-bedrock-provider
- 3aeb791: Add Claude Sonnet 4.5 (claude-sonnet-4-5-20250929-v1:0) model support

## 3.1.0-beta.9

### Patch Changes

- d4b2964: fix(provider/amazon-bedrock): normalise headers and body if input is of instance Request

## 3.1.0-beta.8

### Patch Changes

- Updated dependencies [a5a8db4]
  - @ai-sdk/anthropic@2.1.0-beta.8

## 3.1.0-beta.7

### Patch Changes

- Updated dependencies [e1e2821]
  - @ai-sdk/anthropic@2.1.0-beta.7

## 3.1.0-beta.6

### Patch Changes

- 8dac895: feat: `LanguageModelV3`
- 10c1322: fix: moved dependency `@ai-sdk/test-server` to devDependencies
- Updated dependencies
  - @ai-sdk/provider-utils@3.1.0-beta.5
  - @ai-sdk/anthropic@2.1.0-beta.6
  - @ai-sdk/provider@2.1.0-beta.3

## 3.1.0-beta.5

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@2.1.0-beta.5

## 3.1.0-beta.4

### Patch Changes

- 4616b86: chore: update zod peer depenedency version
- Updated dependencies [4616b86]
  - @ai-sdk/provider-utils@3.1.0-beta.4
  - @ai-sdk/anthropic@2.1.0-beta.4

## 3.1.0-beta.3

### Patch Changes

- ed329cb: feat: `Provider-V3`
- 522f6b8: feat: `ImageModelV3`
- Updated dependencies
  - @ai-sdk/anthropic@2.1.0-beta.3
  - @ai-sdk/provider@2.1.0-beta.2
  - @ai-sdk/provider-utils@3.1.0-beta.3

## 3.1.0-beta.2

### Patch Changes

- 0c4822d: feat: `EmbeddingModelV3`
- 1cad0ab: feat: add provider version to user-agent header
- Updated dependencies
  - @ai-sdk/provider@2.1.0-beta.1
  - @ai-sdk/anthropic@2.1.0-beta.2
  - @ai-sdk/provider-utils@3.1.0-beta.2

## 3.1.0-beta.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/test-server@1.0.0-beta.0
  - @ai-sdk/provider-utils@3.1.0-beta.1
  - @ai-sdk/anthropic@2.1.0-beta.1

## 3.1.0-beta.0

### Minor Changes

- 78928cb: release: start 5.1 beta

### Patch Changes

- Updated dependencies [78928cb]
  - @ai-sdk/anthropic@2.1.0-beta.0
  - @ai-sdk/provider@2.1.0-beta.0
  - @ai-sdk/provider-utils@3.1.0-beta.0

## 3.0.22

### Patch Changes

- 32f3cef: feat: adding user-agent to all packages that use global fetch directly

## 3.0.21

### Patch Changes

- Updated dependencies [da92132]
  - @ai-sdk/anthropic@2.0.17

## 3.0.20

### Patch Changes

- Updated dependencies [0294b58]
  - @ai-sdk/provider-utils@3.0.9
  - @ai-sdk/anthropic@2.0.16

## 3.0.19

### Patch Changes

- Updated dependencies [c8aab0a]
  - @ai-sdk/anthropic@2.0.15

## 3.0.18

### Patch Changes

- Updated dependencies [2338c79]
  - @ai-sdk/anthropic@2.0.14

## 3.0.17

### Patch Changes

- Updated dependencies [cd458a8]
  - @ai-sdk/anthropic@2.0.13

## 3.0.16

### Patch Changes

- Updated dependencies [99964ed]
  - @ai-sdk/provider-utils@3.0.8
  - @ai-sdk/anthropic@2.0.12

## 3.0.15

### Patch Changes

- Updated dependencies [c7fee29]
  - @ai-sdk/anthropic@2.0.11

## 3.0.14

### Patch Changes

- Updated dependencies [c152ef7]
  - @ai-sdk/anthropic@2.0.10

## 3.0.13

### Patch Changes

- Updated dependencies [cdc6b7a]
  - @ai-sdk/anthropic@2.0.9

## 3.0.12

### Patch Changes

- Updated dependencies [886e7cd]
  - @ai-sdk/provider-utils@3.0.7
  - @ai-sdk/anthropic@2.0.8

## 3.0.11

### Patch Changes

- Updated dependencies [1b5a3d3]
  - @ai-sdk/provider-utils@3.0.6
  - @ai-sdk/anthropic@2.0.7

## 3.0.10

### Patch Changes

- Updated dependencies [0857788]
  - @ai-sdk/provider-utils@3.0.5
  - @ai-sdk/anthropic@2.0.6

## 3.0.9

### Patch Changes

- Updated dependencies [68751f9]
  - @ai-sdk/provider-utils@3.0.4
  - @ai-sdk/anthropic@2.0.5

## 3.0.8

### Patch Changes

- Updated dependencies [ae859ce]
  - @ai-sdk/anthropic@2.0.4

## 3.0.7

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.3
  - @ai-sdk/anthropic@2.0.3

## 3.0.6

### Patch Changes

- Updated dependencies [38ac190]
  - @ai-sdk/provider-utils@3.0.2
  - @ai-sdk/anthropic@2.0.2

## 3.0.5

### Patch Changes

- c2871e6: fix(provider/amazon-bedrock): resolve opus 4.1 reasoning mode validation error

## 3.0.4

### Patch Changes

- 9aa06a7: filter out blank text blocks

## 3.0.3

### Patch Changes

- c44166d: Add support for Amazon Nova Models, cross region inference profiles and OpenAI gpt-oss in `@ai-sdk/amazon-bedrock` provider
- fbc9f06: feat(amazon-bedrock): add topK support

## 3.0.2

### Patch Changes

- 109fb4d: Add support for Anthropic Claude Opus 4.1 model (anthropic.claude-opus-4-1-20250805-v1:0)

## 3.0.1

### Patch Changes

- Updated dependencies [90d212f]
  - @ai-sdk/provider-utils@3.0.1
  - @ai-sdk/anthropic@2.0.1

## 3.0.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- 97ea26f: chore(providers/bedrock): convert to providerOptions
- 97ea26f: chore(providers/bedrock): use camelCase for providerOptions
- 314edb2: Add API key authentication support for Amazon Bedrock with Bearer token and automatic SigV4 fallback
- fa49207: feat(providers/openai-compatible): convert to providerOptions
- e2aceaf: feat: add raw chunk support
- eb173f1: chore (providers): remove model shorthand deprecation warnings
- a89add7: fix(amazon-bedrock): add structured output support for claude models
- 26735b5: chore(embedding-model): add v2 interface
- a8c8bd5: feat(embed-many): respect supportsParallelCalls & concurrency
- 0893170: fix(amazon-bedrock): handle empty activeTools with tool conversation history
- d9209ca: fix (image-model): `specificationVersion: v1` -> `v2`
- 9301f86: refactor (image-model): rename `ImageModelV1` to `ImageModelV2`
- a10bf62: Fixes "Extra inputs are not permitted" error when using reasoning with Bedrock
- 92c0b4b: chore(providers/bedrock): update embedding model to use providerOptions
- 3593385: fix(bedrock): resolve mime-types of document and images
- d1a034f: feature: using Zod 4 for internal stuff
- c87b7e4: feat (provider/amazon-bedrock): add Claude 4 model ids (claude-sonnet-4-20250514-v1:0, claude-opus-4-20250514-v1:0)
- d546725: fix(provider/amazon-bedrock): use consistent document names for prompt cache effectiveness
- b652872: fix(provider/bedrock): include toolConfig when conversation contains tool content
- 205077b: fix: improve Zod compatibility
- f418dd7: Added anthropic provider defined tool support to amazon bedrock
- 6f231db: fix(providers): always use optional instead of mix of nullish for providerOptions
- 89eaf5e: Add style parameter support for Amazon Bedrock Nova Canvas image generation
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0
  - @ai-sdk/provider@2.0.0
  - @ai-sdk/anthropic@2.0.0

## 3.0.0-beta.15

### Patch Changes

- Updated dependencies [88a8ee5]
  - @ai-sdk/provider-utils@3.0.0-beta.10
  - @ai-sdk/anthropic@2.0.0-beta.13

## 3.0.0-beta.14

### Patch Changes

- f418dd7: Added anthropic provider defined tool support to amazon bedrock
- Updated dependencies
  - @ai-sdk/anthropic@2.0.0-beta.12
  - @ai-sdk/provider@2.0.0-beta.2
  - @ai-sdk/provider-utils@3.0.0-beta.9

## 3.0.0-beta.13

### Patch Changes

- eb173f1: chore (providers): remove model shorthand deprecation warnings
- Updated dependencies [dd5fd43]
  - @ai-sdk/provider-utils@3.0.0-beta.8

## 3.0.0-beta.12

### Patch Changes

- 0893170: fix(amazon-bedrock): handle empty activeTools with tool conversation history
- Updated dependencies [e7fcc86]
  - @ai-sdk/provider-utils@3.0.0-beta.7

## 3.0.0-beta.11

### Patch Changes

- a89add7: fix(amazon-bedrock): add structured output support for claude models

## 3.0.0-beta.10

### Patch Changes

- b652872: fix(provider/bedrock): include toolConfig when conversation contains tool content
- Updated dependencies [ac34802]
  - @ai-sdk/provider-utils@3.0.0-beta.6

## 3.0.0-beta.9

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.5

## 3.0.0-beta.8

### Patch Changes

- 205077b: fix: improve Zod compatibility
- Updated dependencies [205077b]
  - @ai-sdk/provider-utils@3.0.0-beta.4

## 3.0.0-beta.7

### Patch Changes

- 314edb2: Add API key authentication support for Amazon Bedrock with Bearer token and automatic SigV4 fallback

## 3.0.0-beta.6

### Patch Changes

- Updated dependencies [05d2819]
  - @ai-sdk/provider-utils@3.0.0-beta.3

## 3.0.0-beta.5

### Patch Changes

- 89eaf5e: Add style parameter support for Amazon Bedrock Nova Canvas image generation

## 3.0.0-beta.4

### Patch Changes

- a10bf62: Fixes "Extra inputs are not permitted" error when using reasoning with Bedrock

## 3.0.0-beta.3

### Patch Changes

- 3593385: fix(bedrock): resolve mime-types of document and images

## 3.0.0-beta.2

### Patch Changes

- d1a034f: feature: using Zod 4 for internal stuff
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.2

## 3.0.0-beta.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-beta.1
  - @ai-sdk/provider-utils@3.0.0-beta.1

## 3.0.0-alpha.15

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-alpha.15
  - @ai-sdk/provider-utils@3.0.0-alpha.15

## 3.0.0-alpha.14

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-alpha.14
  - @ai-sdk/provider-utils@3.0.0-alpha.14

## 3.0.0-alpha.13

### Patch Changes

- Updated dependencies [68ecf2f]
  - @ai-sdk/provider@2.0.0-alpha.13
  - @ai-sdk/provider-utils@3.0.0-alpha.13

## 3.0.0-alpha.12

### Patch Changes

- e2aceaf: feat: add raw chunk support
- Updated dependencies [e2aceaf]
  - @ai-sdk/provider@2.0.0-alpha.12
  - @ai-sdk/provider-utils@3.0.0-alpha.12

## 3.0.0-alpha.11

### Patch Changes

- d546725: fix(provider/amazon-bedrock): use consistent document names for prompt cache effectiveness
- Updated dependencies [c1e6647]
  - @ai-sdk/provider@2.0.0-alpha.11
  - @ai-sdk/provider-utils@3.0.0-alpha.11

## 3.0.0-alpha.10

### Patch Changes

- Updated dependencies [c4df419]
  - @ai-sdk/provider@2.0.0-alpha.10
  - @ai-sdk/provider-utils@3.0.0-alpha.10

## 3.0.0-alpha.9

### Patch Changes

- c87b7e4: feat (provider/amazon-bedrock): add Claude 4 model ids (claude-sonnet-4-20250514-v1:0, claude-opus-4-20250514-v1:0)
- Updated dependencies [811dff3]
  - @ai-sdk/provider@2.0.0-alpha.9
  - @ai-sdk/provider-utils@3.0.0-alpha.9

## 3.0.0-alpha.8

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-alpha.8
  - @ai-sdk/provider@2.0.0-alpha.8

## 3.0.0-alpha.7

### Patch Changes

- Updated dependencies [5c56081]
  - @ai-sdk/provider@2.0.0-alpha.7
  - @ai-sdk/provider-utils@3.0.0-alpha.7

## 3.0.0-alpha.6

### Patch Changes

- Updated dependencies [0d2c085]
  - @ai-sdk/provider@2.0.0-alpha.6
  - @ai-sdk/provider-utils@3.0.0-alpha.6

## 3.0.0-alpha.4

### Patch Changes

- Updated dependencies [dc714f3]
  - @ai-sdk/provider@2.0.0-alpha.4
  - @ai-sdk/provider-utils@3.0.0-alpha.4

## 3.0.0-alpha.3

### Patch Changes

- Updated dependencies [6b98118]
  - @ai-sdk/provider@2.0.0-alpha.3
  - @ai-sdk/provider-utils@3.0.0-alpha.3

## 3.0.0-alpha.2

### Patch Changes

- Updated dependencies [26535e0]
  - @ai-sdk/provider@2.0.0-alpha.2
  - @ai-sdk/provider-utils@3.0.0-alpha.2

## 3.0.0-alpha.1

### Patch Changes

- Updated dependencies [3f2f00c]
  - @ai-sdk/provider@2.0.0-alpha.1
  - @ai-sdk/provider-utils@3.0.0-alpha.1

## 3.0.0-canary.19

### Patch Changes

- Updated dependencies [faf8446]
  - @ai-sdk/provider-utils@3.0.0-canary.19

## 3.0.0-canary.18

### Patch Changes

- Updated dependencies [40acf9b]
  - @ai-sdk/provider-utils@3.0.0-canary.18

## 3.0.0-canary.17

### Patch Changes

- Updated dependencies [ea7a7c9]
  - @ai-sdk/provider-utils@3.0.0-canary.17

## 3.0.0-canary.16

### Patch Changes

- Updated dependencies [87b828f]
  - @ai-sdk/provider-utils@3.0.0-canary.16

## 3.0.0-canary.15

### Patch Changes

- a8c8bd5: feat(embed-many): respect supportsParallelCalls & concurrency
- 6f231db: fix(providers): always use optional instead of mix of nullish for providerOptions
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.15
  - @ai-sdk/provider@2.0.0-canary.14

## 3.0.0-canary.14

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.14
  - @ai-sdk/provider@2.0.0-canary.13

## 3.0.0-canary.13

### Patch Changes

- d9209ca: fix (image-model): `specificationVersion: v1` -> `v2`
- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.12
  - @ai-sdk/provider-utils@3.0.0-canary.13

## 3.0.0-canary.12

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.11
  - @ai-sdk/provider-utils@3.0.0-canary.12

## 3.0.0-canary.11

### Patch Changes

- 9301f86: refactor (image-model): rename `ImageModelV1` to `ImageModelV2`
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.11
  - @ai-sdk/provider@2.0.0-canary.10

## 3.0.0-canary.10

### Patch Changes

- Updated dependencies [e86be6f]
  - @ai-sdk/provider@2.0.0-canary.9
  - @ai-sdk/provider-utils@3.0.0-canary.10

## 3.0.0-canary.9

### Patch Changes

- 92c0b4b: chore(providers/bedrock): update embedding model to use providerOptions
- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.8
  - @ai-sdk/provider-utils@3.0.0-canary.9

## 3.0.0-canary.8

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.8
  - @ai-sdk/provider@2.0.0-canary.7

## 3.0.0-canary.7

### Patch Changes

- fa49207: feat(providers/openai-compatible): convert to providerOptions
- 26735b5: chore(embedding-model): add v2 interface
- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.6
  - @ai-sdk/provider-utils@3.0.0-canary.7

## 3.0.0-canary.6

### Patch Changes

- 97ea26f: chore(providers/bedrock): convert to providerOptions
- 97ea26f: chore(providers/bedrock): use camelCase for providerOptions
- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.5
  - @ai-sdk/provider-utils@3.0.0-canary.6

## 3.0.0-canary.5

### Patch Changes

- Updated dependencies [6f6bb89]
  - @ai-sdk/provider@2.0.0-canary.4
  - @ai-sdk/provider-utils@3.0.0-canary.5

## 3.0.0-canary.4

### Patch Changes

- Updated dependencies [d1a1aa1]
  - @ai-sdk/provider@2.0.0-canary.3
  - @ai-sdk/provider-utils@3.0.0-canary.4

## 3.0.0-canary.3

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.3
  - @ai-sdk/provider@2.0.0-canary.2

## 3.0.0-canary.2

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.1
  - @ai-sdk/provider-utils@3.0.0-canary.2

## 3.0.0-canary.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.1

## 3.0.0-canary.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- Updated dependencies [d5f588f]
  - @ai-sdk/provider-utils@3.0.0-canary.0
  - @ai-sdk/provider@2.0.0-canary.0

## 2.2.4

### Patch Changes

- Updated dependencies [28be004]
  - @ai-sdk/provider-utils@2.2.3

## 2.2.3

### Patch Changes

- Updated dependencies [b01120e]
  - @ai-sdk/provider-utils@2.2.2

## 2.2.2

### Patch Changes

- 2085e59: feat (provider/amazon-bedrock): support tool results with image parts

## 2.2.1

### Patch Changes

- Updated dependencies [f10f0fa]
  - @ai-sdk/provider-utils@2.2.1

## 2.2.0

### Minor Changes

- 5bc638d: AI SDK 4.2

### Patch Changes

- Updated dependencies [5bc638d]
  - @ai-sdk/provider@1.1.0
  - @ai-sdk/provider-utils@2.2.0

## 2.1.6

### Patch Changes

- Updated dependencies [d0c4659]
  - @ai-sdk/provider-utils@2.1.15

## 2.1.5

### Patch Changes

- Updated dependencies [0bd5bc6]
  - @ai-sdk/provider@1.0.12
  - @ai-sdk/provider-utils@2.1.14

## 2.1.4

### Patch Changes

- d65df9d: feat (provider/amazon-bedrock): support AWS credential providers

## 2.1.3

### Patch Changes

- Updated dependencies [2e1101a]
  - @ai-sdk/provider@1.0.11
  - @ai-sdk/provider-utils@2.1.13

## 2.1.2

### Patch Changes

- Updated dependencies [1531959]
  - @ai-sdk/provider-utils@2.1.12

## 2.1.1

### Patch Changes

- a841484: fix (provider/bedrock): support budgetTokens

## 2.1.0

### Minor Changes

- cf7d818: feat (providers/amazon-bedrock): Add reasoning support to amazon-bedrock

## 2.0.6

### Patch Changes

- Updated dependencies [e1d3d42]
  - @ai-sdk/provider@1.0.10
  - @ai-sdk/provider-utils@2.1.11

## 2.0.5

### Patch Changes

- 58c3411: feat (provider/amazon-bedrock): add generate image support for Amazon Nova Canvas

## 2.0.4

### Patch Changes

- Updated dependencies [ddf9740]
  - @ai-sdk/provider@1.0.9
  - @ai-sdk/provider-utils@2.1.10

## 2.0.3

### Patch Changes

- d1475de: feat (provider/amazon-bedrock): add support for cache points

## 2.0.2

### Patch Changes

- Updated dependencies [2761f06]
  - @ai-sdk/provider@1.0.8
  - @ai-sdk/provider-utils@2.1.9

## 2.0.1

### Patch Changes

- Updated dependencies [2e898b4]
  - @ai-sdk/provider-utils@2.1.8

## 2.0.0

### Major Changes

- 3ff4ef8: feat (provider/amazon-bedrock): remove dependence on AWS SDK Bedrock client library

### Patch Changes

- Updated dependencies [3ff4ef8]
  - @ai-sdk/provider-utils@2.1.7

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

- Updated dependencies
  - @ai-sdk/provider-utils@2.0.0
  - @ai-sdk/provider@1.0.0

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

## 0.0.36

### Patch Changes

- e6042b1: feat (provider/anthropic): add haiku 3.5 model ids

## 0.0.35

### Patch Changes

- ac380e3: fix (provider/anthropic): continuation mode with 3+ steps

## 0.0.34

### Patch Changes

- b01bbb7: fix (provider/bedrock): tool calling broken w/ sonnet 3.5

## 0.0.33

### Patch Changes

- bc0ffc5: feat (provider/bedrock): add file content part support

## 0.0.32

### Patch Changes

- 3b1b69a: feat: provider-defined tools
- Updated dependencies
  - @ai-sdk/provider-utils@1.0.22
  - @ai-sdk/provider@0.0.26

## 0.0.31

### Patch Changes

- Updated dependencies [b9b0d7b]
  - @ai-sdk/provider@0.0.25
  - @ai-sdk/provider-utils@1.0.21

## 0.0.30

### Patch Changes

- 59d1abf: feat (provider/bedrock): support Bedrock amazon.titan-embed-text-v1 and amazon.titan-embed-text-v2:0 embeddings

## 0.0.29

### Patch Changes

- 8c3847e: fix (provider/bedrock): update amazon bedrock package to use safe version of aws sdk

## 0.0.28

### Patch Changes

- Updated dependencies [d595d0d]
  - @ai-sdk/provider@0.0.24
  - @ai-sdk/provider-utils@1.0.20

## 0.0.27

### Patch Changes

- 8a15307: fix (provider/bedrock): support assistant messages with trailing whitespace

## 0.0.26

### Patch Changes

- 8f080f4: fix (provider/bedrock): support parallel tool calls in streaming mode

## 0.0.25

### Patch Changes

- Updated dependencies [273f696]
  - @ai-sdk/provider-utils@1.0.19

## 0.0.24

### Patch Changes

- 01fc6c0: feat (provider/amazon-bedrock): support guardrails

## 0.0.23

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@1.0.18
  - @ai-sdk/provider@0.0.23

## 0.0.22

### Patch Changes

- c434799: feat (provider/bedrock): support multiple leading system messages

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

- d67fa9c: feat (provider/amazon-bedrock): add support for session tokens
- Updated dependencies [d67fa9c]
  - @ai-sdk/provider-utils@1.0.15

## 0.0.18

### Patch Changes

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

- Updated dependencies [d58517b]
  - @ai-sdk/provider@0.0.16
  - @ai-sdk/provider-utils@1.0.8

## 0.0.11

### Patch Changes

- Updated dependencies [96aed25]
  - @ai-sdk/provider@0.0.15
  - @ai-sdk/provider-utils@1.0.7

## 0.0.10

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@1.0.6

## 0.0.9

### Patch Changes

- a8d1c9e9: feat (ai/core): parallel image download
- Updated dependencies [a8d1c9e9]
  - @ai-sdk/provider-utils@1.0.5
  - @ai-sdk/provider@0.0.14

## 0.0.8

### Patch Changes

- Updated dependencies [4f88248f]
  - @ai-sdk/provider-utils@1.0.4

## 0.0.7

### Patch Changes

- 2b9da0f0: feat (core): support stopSequences setting.
- a5b58845: feat (core): support topK setting
- 4aa8deb3: feat (provider): support responseFormat setting in provider api
- 13b27ec6: chore (ai/core): remove grammar mode
- Updated dependencies
  - @ai-sdk/provider@0.0.13
  - @ai-sdk/provider-utils@1.0.3

## 0.0.6

### Patch Changes

- 42b11b8e: fix (provider/aws-bedrock): pass tool parameters for object generation without stringify

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

- 542a2b28: feat (@ai-sdk/bedrock): support custom bedrock configuration

## 0.0.1

### Patch Changes

- 02f6a088: feat (@ai-sdk/amazon-bedrock): add Amazon Bedrock provider
- Updated dependencies [02f6a088]
  - @ai-sdk/provider-utils@0.0.16
