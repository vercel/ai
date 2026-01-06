# @ai-sdk/google-vertex

## 4.0.7

### Patch Changes

- Updated dependencies [d937c8f]
  - @ai-sdk/provider@3.0.2
  - @ai-sdk/anthropic@3.0.7
  - @ai-sdk/google@3.0.4
  - @ai-sdk/provider-utils@4.0.4

## 4.0.6

### Patch Changes

- Updated dependencies [2231e84]
  - @ai-sdk/anthropic@3.0.6

## 4.0.5

### Patch Changes

- Updated dependencies [0b429d4]
  - @ai-sdk/provider-utils@4.0.3
  - @ai-sdk/anthropic@3.0.5
  - @ai-sdk/google@3.0.3

## 4.0.4

### Patch Changes

- Updated dependencies [bf39dac]
  - @ai-sdk/anthropic@3.0.4

## 4.0.3

### Patch Changes

- Updated dependencies [77b760d]
  - @ai-sdk/anthropic@3.0.3

## 4.0.2

### Patch Changes

- 863d34f: fix: trigger release to update `@latest`
- Updated dependencies [863d34f]
  - @ai-sdk/anthropic@3.0.2
  - @ai-sdk/google@3.0.2
  - @ai-sdk/provider@3.0.1
  - @ai-sdk/provider-utils@4.0.2

## 4.0.1

### Patch Changes

- Updated dependencies [29264a3]
  - @ai-sdk/provider-utils@4.0.1
  - @ai-sdk/anthropic@3.0.1
  - @ai-sdk/google@3.0.1

## 4.0.0

### Major Changes

- dee8b05: ai SDK 6 beta

### Minor Changes

- 78928cb: release: start 5.1 beta

### Patch Changes

- 0c3b58b: fix(provider): add specificationVersion to ProviderV3
- 47a88a1: Remove duplicate gemini-1.0-pro-001 model ID
- 8d9e8ad: chore(provider): remove generics from EmbeddingModelV3

  Before

  ```ts
  model.textEmbeddingModel('my-model-id');
  ```

  After

  ```ts
  model.embeddingModel('my-model-id');
  ```

- 32a6c13: Add Google Maps grounding tool support for location-aware Gemini responses
- 95f65c2: chore: use import \* from zod/v4
- 0b92881: Add Google Vertex RAG Engine grounding provider tool
- 544d4e8: chore(specification): rename v3 provider defined tool to provider tool
- 0c4822d: feat: `EmbeddingModelV3`
- f8c981f: Fix adding google search along with url context in vertex ai
- 00dfa76: feat(provider/google-vertex): Add support for the imageSize provider option
- 0e29b86: Add claude-opus-4-5@20251101 to Google Vertex Anthropic models
- e8109d3: feat: tool execution approval
- 87db851: fix(vertex/anthropic): passing beta header only for structured outputs
- ed329cb: feat: `Provider-V3`
- 3bd2689: feat: extended token usage
- 1cad0ab: feat: add provider version to user-agent header
- 024e778: feat(provider/vertext): add express mode support
- 8dac895: feat: `LanguageModelV3`
- 82ceb49: Add claude sonnet 4.5 in google vertex anthropic provider
- 457318b: chore(provider,ai): switch to SharedV3Warning and unified warnings
- 0ad470b: feat(provider/google): add enterpriseWebSearch tool
- 9061dc0: feat: image editing
- ee8cd23: fix(vertex): allow 'vertex' as a key for providerOptions
- 366f50b: chore(provider): add deprecated textEmbeddingModel and textEmbedding aliases
- 2825757: Add Google File search tool
- 4616b86: chore: update zod peer depenedency version
- 33d9327: add `gemini-3-pro-preview` and `gemini-3-pro-image-preview` model IDs
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

- 522f6b8: feat: `ImageModelV3`
- 870297d: feat(google): gemini-3-flash
- cdb463a: update google-auth-library to ^10.5.0
- 10c1322: fix: moved dependency `@ai-sdk/test-server` to devDependencies
- 4d2e88e: fix(google,google-vertex): update known model IDs
- e833473: chore (provider/google): Add preview modelIds for gemini 2.5 flash and lite
- Updated dependencies
  - @ai-sdk/anthropic@3.0.0
  - @ai-sdk/provider@3.0.0
  - @ai-sdk/google@3.0.0
  - @ai-sdk/provider-utils@4.0.0

## 4.0.0-beta.135

### Patch Changes

- Updated dependencies [218bba1]
  - @ai-sdk/google@3.0.0-beta.90

## 4.0.0-beta.134

### Patch Changes

- Updated dependencies [2049c5b]
  - @ai-sdk/anthropic@3.0.0-beta.98

## 4.0.0-beta.133

### Patch Changes

- Updated dependencies [475189e]
  - @ai-sdk/provider@3.0.0-beta.32
  - @ai-sdk/anthropic@3.0.0-beta.97
  - @ai-sdk/google@3.0.0-beta.89
  - @ai-sdk/provider-utils@4.0.0-beta.59

## 4.0.0-beta.132

### Patch Changes

- Updated dependencies [2625a04]
  - @ai-sdk/anthropic@3.0.0-beta.96
  - @ai-sdk/provider@3.0.0-beta.31
  - @ai-sdk/google@3.0.0-beta.88
  - @ai-sdk/provider-utils@4.0.0-beta.58

## 4.0.0-beta.131

### Patch Changes

- Updated dependencies [cbf52cd]
  - @ai-sdk/anthropic@3.0.0-beta.95
  - @ai-sdk/provider@3.0.0-beta.30
  - @ai-sdk/google@3.0.0-beta.87
  - @ai-sdk/provider-utils@4.0.0-beta.57

## 4.0.0-beta.130

### Patch Changes

- Updated dependencies [9549c9e]
  - @ai-sdk/provider@3.0.0-beta.29
  - @ai-sdk/anthropic@3.0.0-beta.94
  - @ai-sdk/google@3.0.0-beta.86
  - @ai-sdk/provider-utils@4.0.0-beta.56

## 4.0.0-beta.129

### Patch Changes

- Updated dependencies [50b70d6]
  - @ai-sdk/provider-utils@4.0.0-beta.55
  - @ai-sdk/anthropic@3.0.0-beta.93
  - @ai-sdk/google@3.0.0-beta.85

## 4.0.0-beta.128

### Patch Changes

- Updated dependencies [fd788ce]
  - @ai-sdk/google@3.0.0-beta.84

## 4.0.0-beta.127

### Patch Changes

- Updated dependencies [166b6d7]
  - @ai-sdk/google@3.0.0-beta.83

## 4.0.0-beta.126

### Patch Changes

- 9061dc0: feat: image editing
- Updated dependencies [9061dc0]
  - @ai-sdk/provider-utils@4.0.0-beta.54
  - @ai-sdk/provider@3.0.0-beta.28
  - @ai-sdk/google@3.0.0-beta.82
  - @ai-sdk/anthropic@3.0.0-beta.92

## 4.0.0-beta.125

### Patch Changes

- 0ad470b: feat(provider/google): add enterpriseWebSearch tool
- Updated dependencies [0ad470b]
  - @ai-sdk/google@3.0.0-beta.81

## 4.0.0-beta.124

### Patch Changes

- Updated dependencies [d129d89]
  - @ai-sdk/anthropic@3.0.0-beta.91

## 4.0.0-beta.123

### Patch Changes

- 870297d: feat(google): gemini-3-flash
- Updated dependencies [870297d]
  - @ai-sdk/google@3.0.0-beta.80

## 4.0.0-beta.122

### Patch Changes

- 366f50b: chore(provider): add deprecated textEmbeddingModel and textEmbedding aliases
- Updated dependencies [366f50b]
  - @ai-sdk/anthropic@3.0.0-beta.90
  - @ai-sdk/provider@3.0.0-beta.27
  - @ai-sdk/google@3.0.0-beta.79
  - @ai-sdk/provider-utils@4.0.0-beta.53

## 4.0.0-beta.121

### Patch Changes

- Updated dependencies [763d04a]
  - @ai-sdk/provider-utils@4.0.0-beta.52
  - @ai-sdk/anthropic@3.0.0-beta.89
  - @ai-sdk/google@3.0.0-beta.78

## 4.0.0-beta.120

### Patch Changes

- 87db851: fix(vertex/anthropic): passing beta header only for structured outputs
- Updated dependencies [87db851]
  - @ai-sdk/anthropic@3.0.0-beta.88

## 4.0.0-beta.119

### Patch Changes

- 32a6c13: Add Google Maps grounding tool support for location-aware Gemini responses
- Updated dependencies [32a6c13]
  - @ai-sdk/google@3.0.0-beta.77

## 4.0.0-beta.118

### Patch Changes

- Updated dependencies [c1efac4]
  - @ai-sdk/provider-utils@4.0.0-beta.51
  - @ai-sdk/anthropic@3.0.0-beta.87
  - @ai-sdk/google@3.0.0-beta.76

## 4.0.0-beta.117

### Patch Changes

- Updated dependencies [32223c8]
  - @ai-sdk/provider-utils@4.0.0-beta.50
  - @ai-sdk/anthropic@3.0.0-beta.86
  - @ai-sdk/google@3.0.0-beta.75

## 4.0.0-beta.116

### Patch Changes

- Updated dependencies [83e5744]
  - @ai-sdk/provider-utils@4.0.0-beta.49
  - @ai-sdk/anthropic@3.0.0-beta.85
  - @ai-sdk/google@3.0.0-beta.74

## 4.0.0-beta.115

### Patch Changes

- Updated dependencies [960ec8f]
  - @ai-sdk/provider-utils@4.0.0-beta.48
  - @ai-sdk/anthropic@3.0.0-beta.84
  - @ai-sdk/google@3.0.0-beta.73

## 4.0.0-beta.114

### Patch Changes

- 47a88a1: Remove duplicate gemini-1.0-pro-001 model ID

## 4.0.0-beta.113

### Patch Changes

- Updated dependencies [6c38080]
  - @ai-sdk/anthropic@3.0.0-beta.83

## 4.0.0-beta.112

### Patch Changes

- ee8cd23: fix(vertex): allow 'vertex' as a key for providerOptions
- Updated dependencies [ee8cd23]
  - @ai-sdk/google@3.0.0-beta.72

## 4.0.0-beta.111

### Patch Changes

- Updated dependencies [49e2b6a]
  - @ai-sdk/google@3.0.0-beta.71

## 4.0.0-beta.110

### Patch Changes

- Updated dependencies [e9e157f]
  - @ai-sdk/provider-utils@4.0.0-beta.47
  - @ai-sdk/anthropic@3.0.0-beta.82
  - @ai-sdk/google@3.0.0-beta.70

## 4.0.0-beta.109

### Patch Changes

- Updated dependencies [81e29ab]
  - @ai-sdk/provider-utils@4.0.0-beta.46
  - @ai-sdk/anthropic@3.0.0-beta.81
  - @ai-sdk/google@3.0.0-beta.69

## 4.0.0-beta.108

### Patch Changes

- Updated dependencies [05d5b9a]
  - @ai-sdk/anthropic@3.0.0-beta.80

## 4.0.0-beta.107

### Patch Changes

- 024e778: feat(provider/vertext): add express mode support

## 4.0.0-beta.106

### Patch Changes

- 3bd2689: feat: extended token usage
- Updated dependencies [3bd2689]
  - @ai-sdk/anthropic@3.0.0-beta.79
  - @ai-sdk/provider@3.0.0-beta.26
  - @ai-sdk/google@3.0.0-beta.68
  - @ai-sdk/provider-utils@4.0.0-beta.45

## 4.0.0-beta.105

### Patch Changes

- Updated dependencies [9e1e758]
  - @ai-sdk/anthropic@3.0.0-beta.78

## 4.0.0-beta.104

### Patch Changes

- 4d2e88e: fix(google,google-vertex): update known model IDs
- Updated dependencies [4d2e88e]
  - @ai-sdk/google@3.0.0-beta.67

## 4.0.0-beta.103

### Patch Changes

- Updated dependencies [b2dbfbf]
  - @ai-sdk/anthropic@3.0.0-beta.77

## 4.0.0-beta.102

### Patch Changes

- Updated dependencies [53f3368]
  - @ai-sdk/provider@3.0.0-beta.25
  - @ai-sdk/anthropic@3.0.0-beta.76
  - @ai-sdk/google@3.0.0-beta.66
  - @ai-sdk/provider-utils@4.0.0-beta.44

## 4.0.0-beta.101

### Patch Changes

- Updated dependencies [0ae783e]
  - @ai-sdk/anthropic@3.0.0-beta.75

## 4.0.0-beta.100

### Patch Changes

- Updated dependencies [dce03c4]
  - @ai-sdk/provider-utils@4.0.0-beta.43
  - @ai-sdk/anthropic@3.0.0-beta.74
  - @ai-sdk/provider@3.0.0-beta.24
  - @ai-sdk/google@3.0.0-beta.65

## 4.0.0-beta.99

### Patch Changes

- Updated dependencies [3ed5519]
  - @ai-sdk/provider-utils@4.0.0-beta.42
  - @ai-sdk/anthropic@3.0.0-beta.73
  - @ai-sdk/google@3.0.0-beta.64

## 4.0.0-beta.98

### Patch Changes

- Updated dependencies [a5f77a6]
  - @ai-sdk/anthropic@3.0.0-beta.72

## 4.0.0-beta.97

### Patch Changes

- Updated dependencies [1bd7d32]
  - @ai-sdk/provider-utils@4.0.0-beta.41
  - @ai-sdk/anthropic@3.0.0-beta.71
  - @ai-sdk/provider@3.0.0-beta.23
  - @ai-sdk/google@3.0.0-beta.63

## 4.0.0-beta.96

### Patch Changes

- 00dfa76: feat(provider/google-vertex): Add support for the imageSize provider option

## 4.0.0-beta.95

### Patch Changes

- Updated dependencies [f13958c]
  - @ai-sdk/anthropic@3.0.0-beta.70

## 4.0.0-beta.94

### Patch Changes

- Updated dependencies [589a4ee]
  - @ai-sdk/anthropic@3.0.0-beta.69

## 4.0.0-beta.93

### Patch Changes

- Updated dependencies [9e35785]
  - @ai-sdk/anthropic@3.0.0-beta.68

## 4.0.0-beta.92

### Patch Changes

- Updated dependencies [eb56fc6]
  - @ai-sdk/anthropic@3.0.0-beta.67

## 4.0.0-beta.91

### Patch Changes

- cdb463a: update google-auth-library to ^10.5.0

## 4.0.0-beta.90

### Patch Changes

- 544d4e8: chore(specification): rename v3 provider defined tool to provider tool
- Updated dependencies [544d4e8]
  - @ai-sdk/provider-utils@4.0.0-beta.40
  - @ai-sdk/anthropic@3.0.0-beta.66
  - @ai-sdk/provider@3.0.0-beta.22
  - @ai-sdk/google@3.0.0-beta.62

## 4.0.0-beta.89

### Patch Changes

- Updated dependencies [954c356]
  - @ai-sdk/provider-utils@4.0.0-beta.39
  - @ai-sdk/anthropic@3.0.0-beta.65
  - @ai-sdk/provider@3.0.0-beta.21
  - @ai-sdk/google@3.0.0-beta.61

## 4.0.0-beta.88

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@4.0.0-beta.38
  - @ai-sdk/anthropic@3.0.0-beta.64
  - @ai-sdk/google@3.0.0-beta.60

## 4.0.0-beta.87

### Patch Changes

- 457318b: chore(provider,ai): switch to SharedV3Warning and unified warnings
- Updated dependencies [457318b]
  - @ai-sdk/anthropic@3.0.0-beta.63
  - @ai-sdk/provider@3.0.0-beta.20
  - @ai-sdk/google@3.0.0-beta.59
  - @ai-sdk/provider-utils@4.0.0-beta.37

## 4.0.0-beta.86

### Patch Changes

- 0e29b86: Add claude-opus-4-5@20251101 to Google Vertex Anthropic models

## 4.0.0-beta.85

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
  - @ai-sdk/google@3.0.0-beta.58
  - @ai-sdk/provider-utils@4.0.0-beta.36

## 4.0.0-beta.84

### Patch Changes

- Updated dependencies [10d819b]
  - @ai-sdk/provider@3.0.0-beta.18
  - @ai-sdk/anthropic@3.0.0-beta.61
  - @ai-sdk/google@3.0.0-beta.57
  - @ai-sdk/provider-utils@4.0.0-beta.35

## 4.0.0-beta.83

### Patch Changes

- Updated dependencies [6fc35cb]
  - @ai-sdk/anthropic@3.0.0-beta.60

## 4.0.0-beta.82

### Patch Changes

- Updated dependencies [2109385]
  - @ai-sdk/anthropic@3.0.0-beta.59

## 4.0.0-beta.81

### Patch Changes

- Updated dependencies [83aaad8]
  - @ai-sdk/anthropic@3.0.0-beta.58

## 4.0.0-beta.80

### Patch Changes

- Updated dependencies [e300a3b]
  - @ai-sdk/google@3.0.0-beta.56

## 4.0.0-beta.79

### Patch Changes

- Updated dependencies [b8ea36e]
  - @ai-sdk/anthropic@3.0.0-beta.57

## 4.0.0-beta.78

### Patch Changes

- Updated dependencies [983e394]
  - @ai-sdk/anthropic@3.0.0-beta.56

## 4.0.0-beta.77

### Patch Changes

- Updated dependencies [db913bd]
  - @ai-sdk/provider@3.0.0-beta.17
  - @ai-sdk/google@3.0.0-beta.55
  - @ai-sdk/anthropic@3.0.0-beta.55
  - @ai-sdk/provider-utils@4.0.0-beta.34

## 4.0.0-beta.76

### Patch Changes

- Updated dependencies [bb28cac]
  - @ai-sdk/google@3.0.0-beta.54

## 4.0.0-beta.75

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

## 4.0.0-beta.74

### Patch Changes

- 33d9327: add `gemini-3-pro-preview` and `gemini-3-pro-image-preview` model IDs
- Updated dependencies [33d9327]
  - @ai-sdk/google@3.0.0-beta.53

## 4.0.0-beta.73

### Patch Changes

- Updated dependencies [fff8d59]
  - @ai-sdk/google@3.0.0-beta.52

## 4.0.0-beta.72

### Patch Changes

- Updated dependencies [8370068]
  - @ai-sdk/google@3.0.0-beta.51

## 4.0.0-beta.71

### Patch Changes

- Updated dependencies [9be07c8]
  - @ai-sdk/google@3.0.0-beta.50

## 4.0.0-beta.70

### Patch Changes

- Updated dependencies [8ee8edc]
  - @ai-sdk/google@3.0.0-beta.49

## 4.0.0-beta.69

### Patch Changes

- Updated dependencies [6078060]
  - @ai-sdk/google@3.0.0-beta.48

## 4.0.0-beta.68

### Patch Changes

- Updated dependencies
  - @ai-sdk/google@3.0.0-beta.47

## 4.0.0-beta.67

### Patch Changes

- Updated dependencies [1d15673]
  - @ai-sdk/anthropic@3.0.0-beta.54

## 4.0.0-beta.66

### Patch Changes

- 0b92881: Add Google Vertex RAG Engine grounding provider tool
- Updated dependencies [0b92881]
  - @ai-sdk/google@3.0.0-beta.46

## 4.0.0-beta.65

### Patch Changes

- Updated dependencies [9b17031]
  - @ai-sdk/google@3.0.0-beta.45

## 4.0.0-beta.64

### Patch Changes

- Updated dependencies [0cfae4c]
  - @ai-sdk/google@3.0.0-beta.44

## 4.0.0-beta.63

### Patch Changes

- Updated dependencies [b681d7d]
  - @ai-sdk/provider@3.0.0-beta.16
  - @ai-sdk/anthropic@3.0.0-beta.53
  - @ai-sdk/google@3.0.0-beta.43
  - @ai-sdk/provider-utils@4.0.0-beta.33

## 4.0.0-beta.62

### Patch Changes

- Updated dependencies [32d8dbb]
  - @ai-sdk/provider-utils@4.0.0-beta.32
  - @ai-sdk/anthropic@3.0.0-beta.52
  - @ai-sdk/google@3.0.0-beta.42

## 4.0.0-beta.61

### Patch Changes

- Updated dependencies [1742445]
  - @ai-sdk/anthropic@3.0.0-beta.51
  - @ai-sdk/google@3.0.0-beta.41

## 4.0.0-beta.60

### Patch Changes

- 2825757: Add Google File search tool
- Updated dependencies [2825757]
  - @ai-sdk/google@3.0.0-beta.40

## 4.0.0-beta.59

### Patch Changes

- Updated dependencies [bb36798]
  - @ai-sdk/provider@3.0.0-beta.15
  - @ai-sdk/anthropic@3.0.0-beta.50
  - @ai-sdk/google@3.0.0-beta.39
  - @ai-sdk/provider-utils@4.0.0-beta.31

## 4.0.0-beta.58

### Patch Changes

- Updated dependencies [4f16c37]
  - @ai-sdk/provider-utils@4.0.0-beta.30
  - @ai-sdk/anthropic@3.0.0-beta.49
  - @ai-sdk/google@3.0.0-beta.38

## 4.0.0-beta.57

### Patch Changes

- Updated dependencies [af3780b]
  - @ai-sdk/provider@3.0.0-beta.14
  - @ai-sdk/anthropic@3.0.0-beta.48
  - @ai-sdk/google@3.0.0-beta.37
  - @ai-sdk/provider-utils@4.0.0-beta.29

## 4.0.0-beta.56

### Patch Changes

- Updated dependencies [c8003fb]
  - @ai-sdk/google@3.0.0-beta.36

## 4.0.0-beta.55

### Patch Changes

- Updated dependencies [016b111]
  - @ai-sdk/provider-utils@4.0.0-beta.28
  - @ai-sdk/anthropic@3.0.0-beta.47
  - @ai-sdk/google@3.0.0-beta.35

## 4.0.0-beta.54

### Patch Changes

- Updated dependencies [37c58a0]
  - @ai-sdk/provider@3.0.0-beta.13
  - @ai-sdk/anthropic@3.0.0-beta.46
  - @ai-sdk/google@3.0.0-beta.34
  - @ai-sdk/provider-utils@4.0.0-beta.27

## 4.0.0-beta.53

### Patch Changes

- Updated dependencies [f4e4a95]
  - @ai-sdk/anthropic@3.0.0-beta.45

## 4.0.0-beta.52

### Patch Changes

- Updated dependencies [cf4e2a9]
  - @ai-sdk/anthropic@3.0.0-beta.44

## 4.0.0-beta.51

### Patch Changes

- Updated dependencies [d1bdadb]
  - @ai-sdk/provider@3.0.0-beta.12
  - @ai-sdk/anthropic@3.0.0-beta.43
  - @ai-sdk/google@3.0.0-beta.33
  - @ai-sdk/provider-utils@4.0.0-beta.26

## 4.0.0-beta.50

### Patch Changes

- Updated dependencies [4c44a5b]
  - @ai-sdk/provider@3.0.0-beta.11
  - @ai-sdk/anthropic@3.0.0-beta.42
  - @ai-sdk/google@3.0.0-beta.32
  - @ai-sdk/provider-utils@4.0.0-beta.25

## 4.0.0-beta.49

### Patch Changes

- 0c3b58b: fix(provider): add specificationVersion to ProviderV3
- Updated dependencies [0c3b58b]
  - @ai-sdk/anthropic@3.0.0-beta.41
  - @ai-sdk/provider@3.0.0-beta.10
  - @ai-sdk/google@3.0.0-beta.31
  - @ai-sdk/provider-utils@4.0.0-beta.24

## 4.0.0-beta.48

### Patch Changes

- Updated dependencies [a755db5]
  - @ai-sdk/provider@3.0.0-beta.9
  - @ai-sdk/anthropic@3.0.0-beta.40
  - @ai-sdk/google@3.0.0-beta.30
  - @ai-sdk/provider-utils@4.0.0-beta.23

## 4.0.0-beta.47

### Patch Changes

- Updated dependencies [58920e0]
  - @ai-sdk/provider-utils@4.0.0-beta.22
  - @ai-sdk/anthropic@3.0.0-beta.39
  - @ai-sdk/google@3.0.0-beta.29

## 4.0.0-beta.46

### Patch Changes

- Updated dependencies [293a6b7]
  - @ai-sdk/provider-utils@4.0.0-beta.21
  - @ai-sdk/anthropic@3.0.0-beta.38
  - @ai-sdk/google@3.0.0-beta.28

## 4.0.0-beta.45

### Patch Changes

- Updated dependencies [7c4328e]
  - @ai-sdk/anthropic@3.0.0-beta.37

## 4.0.0-beta.44

### Patch Changes

- Updated dependencies [21f378c]
  - @ai-sdk/anthropic@3.0.0-beta.36

## 4.0.0-beta.43

### Patch Changes

- Updated dependencies [80894b3]
  - @ai-sdk/anthropic@3.0.0-beta.35

## 4.0.0-beta.42

### Patch Changes

- Updated dependencies [fca786b]
  - @ai-sdk/provider-utils@4.0.0-beta.20
  - @ai-sdk/anthropic@3.0.0-beta.34
  - @ai-sdk/google@3.0.0-beta.27

## 4.0.0-beta.41

### Patch Changes

- Updated dependencies [0e38a79]
  - @ai-sdk/anthropic@3.0.0-beta.33

## 4.0.0-beta.40

### Patch Changes

- Updated dependencies [f4db7b5]
  - @ai-sdk/anthropic@3.0.0-beta.32

## 4.0.0-beta.39

### Patch Changes

- Updated dependencies [ca07285]
  - @ai-sdk/anthropic@3.0.0-beta.31

## 4.0.0-beta.38

### Patch Changes

- Updated dependencies [9354297]
  - @ai-sdk/anthropic@3.0.0-beta.30

## 4.0.0-beta.37

### Patch Changes

- Updated dependencies [3794514]
  - @ai-sdk/provider-utils@4.0.0-beta.19
  - @ai-sdk/anthropic@3.0.0-beta.29
  - @ai-sdk/provider@3.0.0-beta.8
  - @ai-sdk/google@3.0.0-beta.26

## 4.0.0-beta.36

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@3.0.0-beta.28
  - @ai-sdk/provider@3.0.0-beta.7
  - @ai-sdk/google@3.0.0-beta.25
  - @ai-sdk/provider-utils@4.0.0-beta.18

## 4.0.0-beta.35

### Patch Changes

- Updated dependencies [4c5a6be]
  - @ai-sdk/anthropic@3.0.0-beta.27

## 4.0.0-beta.34

### Patch Changes

- Updated dependencies [f33a018]
  - @ai-sdk/anthropic@3.0.0-beta.26

## 4.0.0-beta.33

### Patch Changes

- Updated dependencies [703459a]
  - @ai-sdk/provider-utils@4.0.0-beta.17
  - @ai-sdk/anthropic@3.0.0-beta.25
  - @ai-sdk/google@3.0.0-beta.24

## 4.0.0-beta.32

### Patch Changes

- Updated dependencies [d08308b]
  - @ai-sdk/anthropic@3.0.0-beta.24

## 4.0.0-beta.31

### Patch Changes

- Updated dependencies [6f845b4]
  - @ai-sdk/anthropic@3.0.0-beta.23

## 4.0.0-beta.30

### Patch Changes

- f8c981f: Fix adding google search along with url context in vertex ai
- Updated dependencies [f8c981f]
  - @ai-sdk/google@3.0.0-beta.23

## 4.0.0-beta.29

### Patch Changes

- Updated dependencies [09ba2dd]
  - @ai-sdk/google@3.0.0-beta.22

## 4.0.0-beta.28

### Patch Changes

- Updated dependencies [ed537e1]
  - @ai-sdk/anthropic@3.0.0-beta.22

## 4.0.0-beta.27

### Patch Changes

- Updated dependencies [6306603]
  - @ai-sdk/provider-utils@4.0.0-beta.16
  - @ai-sdk/anthropic@3.0.0-beta.21
  - @ai-sdk/google@3.0.0-beta.21

## 4.0.0-beta.26

### Patch Changes

- Updated dependencies [f0b2157]
  - @ai-sdk/provider-utils@4.0.0-beta.15
  - @ai-sdk/anthropic@3.0.0-beta.20
  - @ai-sdk/google@3.0.0-beta.20

## 4.0.0-beta.25

### Patch Changes

- Updated dependencies [3b1d015]
  - @ai-sdk/provider-utils@4.0.0-beta.14
  - @ai-sdk/anthropic@3.0.0-beta.19
  - @ai-sdk/google@3.0.0-beta.19

## 4.0.0-beta.24

### Patch Changes

- Updated dependencies [d116b4b]
  - @ai-sdk/provider-utils@4.0.0-beta.13
  - @ai-sdk/anthropic@3.0.0-beta.18
  - @ai-sdk/google@3.0.0-beta.18

## 4.0.0-beta.23

### Patch Changes

- Updated dependencies [7e32fea]
  - @ai-sdk/provider-utils@4.0.0-beta.12
  - @ai-sdk/anthropic@3.0.0-beta.17
  - @ai-sdk/google@3.0.0-beta.17

## 4.0.0-beta.22

### Patch Changes

- Updated dependencies [ee50cc5]
  - @ai-sdk/google@3.0.0-beta.16

## 4.0.0-beta.21

### Patch Changes

- Updated dependencies [9cff587]
  - @ai-sdk/anthropic@3.0.0-beta.16

## 4.0.0-beta.20

### Patch Changes

- 95f65c2: chore: use import \* from zod/v4
- Updated dependencies
  - @ai-sdk/provider-utils@4.0.0-beta.11
  - @ai-sdk/anthropic@3.0.0-beta.15
  - @ai-sdk/google@3.0.0-beta.15

## 4.0.0-beta.19

### Patch Changes

- 82ceb49: Add claude sonnet 4.5 in google vertex anthropic provider

## 4.0.0-beta.18

### Major Changes

- dee8b05: ai SDK 6 beta

### Patch Changes

- Updated dependencies [dee8b05]
  - @ai-sdk/anthropic@3.0.0-beta.14
  - @ai-sdk/google@3.0.0-beta.14
  - @ai-sdk/provider@3.0.0-beta.6
  - @ai-sdk/provider-utils@4.0.0-beta.10

## 3.1.0-beta.17

### Patch Changes

- Updated dependencies [521c537]
  - @ai-sdk/provider-utils@3.1.0-beta.9
  - @ai-sdk/anthropic@2.1.0-beta.13
  - @ai-sdk/google@2.1.0-beta.13

## 3.1.0-beta.16

### Patch Changes

- Updated dependencies [e06565c]
  - @ai-sdk/provider-utils@3.1.0-beta.8
  - @ai-sdk/anthropic@2.1.0-beta.12
  - @ai-sdk/google@2.1.0-beta.12

## 3.1.0-beta.15

### Patch Changes

- Updated dependencies [9a728c8]
  - @ai-sdk/google@2.1.0-beta.11

## 3.1.0-beta.14

### Patch Changes

- e8109d3: feat: tool execution approval
- Updated dependencies
  - @ai-sdk/provider@2.1.0-beta.5
  - @ai-sdk/provider-utils@3.1.0-beta.7
  - @ai-sdk/anthropic@2.1.0-beta.11
  - @ai-sdk/google@2.1.0-beta.10

## 3.1.0-beta.13

### Patch Changes

- Updated dependencies [dedf206]
  - @ai-sdk/anthropic@2.1.0-beta.10

## 3.1.0-beta.12

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.1.0-beta.6
  - @ai-sdk/anthropic@2.1.0-beta.9
  - @ai-sdk/provider@2.1.0-beta.4
  - @ai-sdk/google@2.1.0-beta.9

## 3.1.0-beta.11

### Patch Changes

- Updated dependencies [7728ac5]
  - @ai-sdk/google@2.1.0-beta.8

## 3.1.0-beta.10

### Patch Changes

- Updated dependencies [a5a8db4]
  - @ai-sdk/anthropic@2.1.0-beta.8

## 3.1.0-beta.9

### Patch Changes

- Updated dependencies [e1e2821]
  - @ai-sdk/anthropic@2.1.0-beta.7

## 3.1.0-beta.8

### Patch Changes

- 8dac895: feat: `LanguageModelV3`
- 10c1322: fix: moved dependency `@ai-sdk/test-server` to devDependencies
- Updated dependencies
  - @ai-sdk/provider-utils@3.1.0-beta.5
  - @ai-sdk/anthropic@2.1.0-beta.6
  - @ai-sdk/provider@2.1.0-beta.3
  - @ai-sdk/google@2.1.0-beta.7

## 3.1.0-beta.7

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@2.1.0-beta.5

## 3.1.0-beta.6

### Patch Changes

- e833473: chore (provider/google): Add preview modelIds for gemini 2.5 flash and lite
- Updated dependencies [e833473]
  - @ai-sdk/google@2.1.0-beta.6

## 3.1.0-beta.5

### Patch Changes

- 4616b86: chore: update zod peer depenedency version
- Updated dependencies [4616b86]
  - @ai-sdk/provider-utils@3.1.0-beta.4
  - @ai-sdk/anthropic@2.1.0-beta.4
  - @ai-sdk/google@2.1.0-beta.5

## 3.1.0-beta.4

### Patch Changes

- ed329cb: feat: `Provider-V3`
- 522f6b8: feat: `ImageModelV3`
- Updated dependencies
  - @ai-sdk/anthropic@2.1.0-beta.3
  - @ai-sdk/provider@2.1.0-beta.2
  - @ai-sdk/google@2.1.0-beta.4
  - @ai-sdk/provider-utils@3.1.0-beta.3

## 3.1.0-beta.3

### Patch Changes

- 0c4822d: feat: `EmbeddingModelV3`
- 1cad0ab: feat: add provider version to user-agent header
- Updated dependencies
  - @ai-sdk/provider@2.1.0-beta.1
  - @ai-sdk/google@2.1.0-beta.3
  - @ai-sdk/anthropic@2.1.0-beta.2
  - @ai-sdk/provider-utils@3.1.0-beta.2

## 3.1.0-beta.2

### Patch Changes

- Updated dependencies [7dea60e]
  - @ai-sdk/google@2.1.0-beta.2

## 3.1.0-beta.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/test-server@1.0.0-beta.0
  - @ai-sdk/provider-utils@3.1.0-beta.1
  - @ai-sdk/anthropic@2.1.0-beta.1
  - @ai-sdk/google@2.1.0-beta.1

## 3.1.0-beta.0

### Minor Changes

- 78928cb: release: start 5.1 beta

### Patch Changes

- Updated dependencies [78928cb]
  - @ai-sdk/anthropic@2.1.0-beta.0
  - @ai-sdk/google@2.1.0-beta.0
  - @ai-sdk/provider@2.1.0-beta.0
  - @ai-sdk/provider-utils@3.1.0-beta.0

## 3.0.27

### Patch Changes

- Updated dependencies [da92132]
  - @ai-sdk/anthropic@2.0.17

## 3.0.26

### Patch Changes

- Updated dependencies [0294b58]
  - @ai-sdk/provider-utils@3.0.9
  - @ai-sdk/anthropic@2.0.16
  - @ai-sdk/google@2.0.14

## 3.0.25

### Patch Changes

- Updated dependencies [c8aab0a]
  - @ai-sdk/anthropic@2.0.15

## 3.0.24

### Patch Changes

- Updated dependencies [2338c79]
  - @ai-sdk/anthropic@2.0.14

## 3.0.23

### Patch Changes

- 1887c53: feat(provider/google-vertex): add support for urlContext, googleSearch and codeExecution tools

## 3.0.22

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@2.0.13
  - @ai-sdk/google@2.0.13

## 3.0.21

### Patch Changes

- e2b7558: added the title parameter for embeddings through the google vertex provider

## 3.0.20

### Patch Changes

- 921186b: chore (provider/vertex): update GoogleVertexModelId

## 3.0.19

### Patch Changes

- Updated dependencies [99964ed]
  - @ai-sdk/provider-utils@3.0.8
  - @ai-sdk/anthropic@2.0.12
  - @ai-sdk/google@2.0.12

## 3.0.18

### Patch Changes

- Updated dependencies [c7fee29]
  - @ai-sdk/anthropic@2.0.11

## 3.0.17

### Patch Changes

- Updated dependencies [c152ef7]
  - @ai-sdk/anthropic@2.0.10

## 3.0.16

### Patch Changes

- Updated dependencies [cdc6b7a]
  - @ai-sdk/anthropic@2.0.9

## 3.0.15

### Patch Changes

- Updated dependencies [a14fc2b]
  - @ai-sdk/google@2.0.11

## 3.0.14

### Patch Changes

- a8a73c5: Update Claude model IDs in Google Vertex Anthropic provider and documentation link
- Updated dependencies [886e7cd]
  - @ai-sdk/provider-utils@3.0.7
  - @ai-sdk/anthropic@2.0.8
  - @ai-sdk/google@2.0.10

## 3.0.13

### Patch Changes

- Updated dependencies [1b5a3d3]
  - @ai-sdk/provider-utils@3.0.6
  - @ai-sdk/anthropic@2.0.7
  - @ai-sdk/google@2.0.9

## 3.0.12

### Patch Changes

- d09caa5: The taskType parameter now properly maps to snake case in the final payload.

## 3.0.11

### Patch Changes

- Updated dependencies [0857788]
  - @ai-sdk/provider-utils@3.0.5
  - @ai-sdk/anthropic@2.0.6
  - @ai-sdk/google@2.0.8

## 3.0.10

### Patch Changes

- Updated dependencies [68751f9]
  - @ai-sdk/provider-utils@3.0.4
  - @ai-sdk/anthropic@2.0.5
  - @ai-sdk/google@2.0.7

## 3.0.9

### Patch Changes

- Updated dependencies [ae859ce]
  - @ai-sdk/anthropic@2.0.4

## 3.0.8

### Patch Changes

- 9010126: add autoTruncate support for google vertex
- c0a9d12: fix(provider/vertex): pass taskType for each content value. taskType needs to be passed in instances and not parameters for google-vertex

## 3.0.7

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.3
  - @ai-sdk/anthropic@2.0.3
  - @ai-sdk/google@2.0.6

## 3.0.6

### Patch Changes

- Updated dependencies [38ac190]
  - @ai-sdk/provider-utils@3.0.2
  - @ai-sdk/anthropic@2.0.2
  - @ai-sdk/google@2.0.5

## 3.0.5

### Patch Changes

- Updated dependencies [961dda1]
  - @ai-sdk/google@2.0.4

## 3.0.4

### Patch Changes

- Updated dependencies [9fb0252]
  - @ai-sdk/google@2.0.3

## 3.0.3

### Patch Changes

- Updated dependencies [90d212f]
  - @ai-sdk/provider-utils@3.0.1
  - @ai-sdk/anthropic@2.0.1
  - @ai-sdk/google@2.0.2

## 3.0.2

### Patch Changes

- b9cd900: feat(providers/google-vertex) Add TaskType support for Text Embedding Model
- Updated dependencies [f5464aa]
  - @ai-sdk/google@2.0.1

## 3.0.1

### Patch Changes

- 11e3ba4: Make revisedPrompt nullish in schema

## 3.0.0

### Major Changes

- d5f588f: AI SDK 5
- 516be5b: ### Move Image Model Settings into generate options

  Image Models no longer have settings. Instead, `maxImagesPerCall` can be passed directly to `generateImage()`. All other image settings can be passed to `providerOptions[provider]`.

  Before

  ```js
  await generateImage({
    model: luma.image('photon-flash-1', {
      maxImagesPerCall: 5,
      pollIntervalMillis: 500,
    }),
    prompt,
    n: 10,
  });
  ```

  After

  ```js
  await generateImage({
    model: luma.image('photon-flash-1'),
    prompt,
    n: 10,
    maxImagesPerCall: 5,
    providerOptions: {
      luma: { pollIntervalMillis: 5 },
    },
  });
  ```

  Pull Request: https://github.com/vercel/ai/pull/6180

### Minor Changes

- 6ca44f2: Fixed global region for vertex provider

### Patch Changes

- 8e171f5: feat (provider/google-vertex): add imagen-3.0-generate-002
- cea5997: chore(providers/google-vertex): update embedding model to use providerOptions
- 9ccce3a: feat (google-vertex): Set `.providerMetaData` for image model responses
- e2aceaf: feat: add raw chunk support
- 26735b5: chore(embedding-model): add v2 interface
- 443d8ec: feat(embedding-model-v2): add response body field
- 5c9eec4: chore(providers/anthropic): switch to providerOptions
- 66962ed: fix(packages): export node10 compatible types
- d9209ca: fix (image-model): `specificationVersion: v1` -> `v2`
- 9301f86: refactor (image-model): rename `ImageModelV1` to `ImageModelV2`
- 7378473: chore(providers/google): switch to providerOptions
- 779d916: feat: add provider option schemas for vertex imagegen and google genai
- 91715e5: fix (provider/google-vertex): fix anthropic support for image urls in messages
- d1a034f: feature: using Zod 4 for internal stuff
- fd65bc6: chore(embedding-model-v2): rename rawResponse to response
- 205077b: fix: improve Zod compatibility
- bb13f18: Add reasoning token output support for gemini models via Vertex AI Provider
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0
  - @ai-sdk/provider@2.0.0
  - @ai-sdk/google@2.0.0
  - @ai-sdk/anthropic@2.0.0

## 3.0.0-beta.21

### Patch Changes

- Updated dependencies [88a8ee5]
  - @ai-sdk/provider-utils@3.0.0-beta.10
  - @ai-sdk/anthropic@2.0.0-beta.13
  - @ai-sdk/google@2.0.0-beta.19

## 3.0.0-beta.20

### Patch Changes

- Updated dependencies
  - @ai-sdk/google@2.0.0-beta.18
  - @ai-sdk/anthropic@2.0.0-beta.12
  - @ai-sdk/provider@2.0.0-beta.2
  - @ai-sdk/provider-utils@3.0.0-beta.9

## 3.0.0-beta.19

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@2.0.0-beta.11
  - @ai-sdk/google@2.0.0-beta.17
  - @ai-sdk/provider-utils@3.0.0-beta.8

## 3.0.0-beta.18

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.7
  - @ai-sdk/anthropic@2.0.0-beta.10
  - @ai-sdk/google@2.0.0-beta.16

## 3.0.0-beta.17

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@2.0.0-beta.9
  - @ai-sdk/provider-utils@3.0.0-beta.6
  - @ai-sdk/google@2.0.0-beta.15

## 3.0.0-beta.16

### Patch Changes

- Updated dependencies [75f03b1]
  - @ai-sdk/google@2.0.0-beta.14

## 3.0.0-beta.15

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.5
  - @ai-sdk/anthropic@2.0.0-beta.8
  - @ai-sdk/google@2.0.0-beta.13

## 3.0.0-beta.14

### Patch Changes

- 205077b: fix: improve Zod compatibility
- Updated dependencies [205077b]
  - @ai-sdk/provider-utils@3.0.0-beta.4
  - @ai-sdk/anthropic@2.0.0-beta.7
  - @ai-sdk/google@2.0.0-beta.12

## 3.0.0-beta.13

### Patch Changes

- Updated dependencies [6a16dcf]
  - @ai-sdk/google@2.0.0-beta.11

## 3.0.0-beta.12

### Minor Changes

- 6ca44f2: Fixed global region for vertex provider

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.3
  - @ai-sdk/google@2.0.0-beta.10
  - @ai-sdk/anthropic@2.0.0-beta.6

## 3.0.0-beta.11

### Patch Changes

- Updated dependencies [8af9e03]
  - @ai-sdk/google@2.0.0-beta.9

## 3.0.0-beta.10

### Patch Changes

- Updated dependencies [b9ddcdd]
  - @ai-sdk/anthropic@2.0.0-beta.5

## 3.0.0-beta.9

### Patch Changes

- Updated dependencies [2e06f14]
  - @ai-sdk/google@2.0.0-beta.8

## 3.0.0-beta.8

### Patch Changes

- Updated dependencies [19a4336]
  - @ai-sdk/google@2.0.0-beta.7

## 3.0.0-beta.7

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@2.0.0-beta.4

## 3.0.0-beta.6

### Patch Changes

- Updated dependencies [878bf45]
  - @ai-sdk/google@2.0.0-beta.6

## 3.0.0-beta.5

### Patch Changes

- Updated dependencies [42fcd32]
  - @ai-sdk/google@2.0.0-beta.5

## 3.0.0-beta.4

### Patch Changes

- Updated dependencies
  - @ai-sdk/google@2.0.0-beta.4

## 3.0.0-beta.3

### Patch Changes

- d1a034f: feature: using Zod 4 for internal stuff
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-beta.2
  - @ai-sdk/anthropic@2.0.0-beta.3
  - @ai-sdk/google@2.0.0-beta.3

## 3.0.0-beta.2

### Patch Changes

- Updated dependencies
  - @ai-sdk/google@2.0.0-beta.2
  - @ai-sdk/anthropic@2.0.0-beta.2

## 3.0.0-beta.1

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-beta.1
  - @ai-sdk/provider-utils@3.0.0-beta.1
  - @ai-sdk/anthropic@2.0.0-beta.1
  - @ai-sdk/google@2.0.0-beta.1

## 3.0.0-alpha.15

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-alpha.15
  - @ai-sdk/provider-utils@3.0.0-alpha.15
  - @ai-sdk/anthropic@2.0.0-alpha.15
  - @ai-sdk/google@2.0.0-alpha.15

## 3.0.0-alpha.14

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-alpha.14
  - @ai-sdk/anthropic@2.0.0-alpha.14
  - @ai-sdk/google@2.0.0-alpha.14
  - @ai-sdk/provider-utils@3.0.0-alpha.14

## 3.0.0-alpha.13

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@2.0.0-alpha.13
  - @ai-sdk/provider@2.0.0-alpha.13
  - @ai-sdk/google@2.0.0-alpha.13
  - @ai-sdk/provider-utils@3.0.0-alpha.13

## 3.0.0-alpha.12

### Patch Changes

- e2aceaf: feat: add raw chunk support
- Updated dependencies [e2aceaf]
  - @ai-sdk/anthropic@2.0.0-alpha.12
  - @ai-sdk/google@2.0.0-alpha.12
  - @ai-sdk/provider@2.0.0-alpha.12
  - @ai-sdk/provider-utils@3.0.0-alpha.12

## 3.0.0-alpha.11

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@2.0.0-alpha.11
  - @ai-sdk/provider@2.0.0-alpha.11
  - @ai-sdk/google@2.0.0-alpha.11
  - @ai-sdk/provider-utils@3.0.0-alpha.11

## 3.0.0-alpha.10

### Patch Changes

- bb13f18: Add reasoning token output support for gemini models via Vertex AI Provider
- Updated dependencies
  - @ai-sdk/google@2.0.0-alpha.10
  - @ai-sdk/provider@2.0.0-alpha.10
  - @ai-sdk/anthropic@2.0.0-alpha.10
  - @ai-sdk/provider-utils@3.0.0-alpha.10

## 3.0.0-alpha.9

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@2.0.0-alpha.9
  - @ai-sdk/provider@2.0.0-alpha.9
  - @ai-sdk/google@2.0.0-alpha.9
  - @ai-sdk/provider-utils@3.0.0-alpha.9

## 3.0.0-alpha.8

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@2.0.0-alpha.8
  - @ai-sdk/provider-utils@3.0.0-alpha.8
  - @ai-sdk/google@2.0.0-alpha.8
  - @ai-sdk/provider@2.0.0-alpha.8

## 3.0.0-alpha.7

### Patch Changes

- Updated dependencies [5c56081]
  - @ai-sdk/provider@2.0.0-alpha.7
  - @ai-sdk/anthropic@2.0.0-alpha.7
  - @ai-sdk/google@2.0.0-alpha.7
  - @ai-sdk/provider-utils@3.0.0-alpha.7

## 3.0.0-alpha.6

### Patch Changes

- Updated dependencies [0d2c085]
  - @ai-sdk/provider@2.0.0-alpha.6
  - @ai-sdk/anthropic@2.0.0-alpha.6
  - @ai-sdk/google@2.0.0-alpha.6
  - @ai-sdk/provider-utils@3.0.0-alpha.6

## 3.0.0-alpha.4

### Patch Changes

- 9ccce3a: feat (google-vertex): Set `.providerMetaData` for image model responses
- Updated dependencies
  - @ai-sdk/provider@2.0.0-alpha.4
  - @ai-sdk/anthropic@2.0.0-alpha.4
  - @ai-sdk/google@2.0.0-alpha.4
  - @ai-sdk/provider-utils@3.0.0-alpha.4

## 3.0.0-alpha.3

### Patch Changes

- Updated dependencies [6b98118]
  - @ai-sdk/provider@2.0.0-alpha.3
  - @ai-sdk/anthropic@2.0.0-alpha.3
  - @ai-sdk/google@2.0.0-alpha.3
  - @ai-sdk/provider-utils@3.0.0-alpha.3

## 3.0.0-alpha.2

### Patch Changes

- Updated dependencies [26535e0]
  - @ai-sdk/provider@2.0.0-alpha.2
  - @ai-sdk/anthropic@2.0.0-alpha.2
  - @ai-sdk/google@2.0.0-alpha.2
  - @ai-sdk/provider-utils@3.0.0-alpha.2

## 3.0.0-alpha.1

### Patch Changes

- Updated dependencies [3f2f00c]
  - @ai-sdk/provider@2.0.0-alpha.1
  - @ai-sdk/anthropic@2.0.0-alpha.1
  - @ai-sdk/google@2.0.0-alpha.1
  - @ai-sdk/provider-utils@3.0.0-alpha.1

## 3.0.0-canary.20

### Patch Changes

- Updated dependencies [faf8446]
  - @ai-sdk/provider-utils@3.0.0-canary.19
  - @ai-sdk/anthropic@2.0.0-canary.19
  - @ai-sdk/google@2.0.0-canary.20

## 3.0.0-canary.19

### Patch Changes

- Updated dependencies [40acf9b]
  - @ai-sdk/provider-utils@3.0.0-canary.18
  - @ai-sdk/anthropic@2.0.0-canary.18
  - @ai-sdk/google@2.0.0-canary.19

## 3.0.0-canary.18

### Major Changes

- 516be5b: ### Move Image Model Settings into generate options

  Image Models no longer have settings. Instead, `maxImagesPerCall` can be passed directly to `generateImage()`. All other image settings can be passed to `providerOptions[provider]`.

  Before

  ```js
  await generateImage({
    model: luma.image('photon-flash-1', {
      maxImagesPerCall: 5,
      pollIntervalMillis: 500,
    }),
    prompt,
    n: 10,
  });
  ```

  After

  ```js
  await generateImage({
    model: luma.image('photon-flash-1'),
    prompt,
    n: 10,
    maxImagesPerCall: 5,
    providerOptions: {
      luma: { pollIntervalMillis: 5 },
    },
  });
  ```

  Pull Request: https://github.com/vercel/ai/pull/6180

### Patch Changes

- Updated dependencies
  - @ai-sdk/google@2.0.0-canary.18
  - @ai-sdk/provider-utils@3.0.0-canary.17
  - @ai-sdk/anthropic@2.0.0-canary.17

## 3.0.0-canary.17

### Patch Changes

- Updated dependencies [87b828f]
  - @ai-sdk/provider-utils@3.0.0-canary.16
  - @ai-sdk/anthropic@2.0.0-canary.16
  - @ai-sdk/google@2.0.0-canary.17

## 3.0.0-canary.16

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.15
  - @ai-sdk/provider@2.0.0-canary.14
  - @ai-sdk/anthropic@2.0.0-canary.15
  - @ai-sdk/google@2.0.0-canary.16

## 3.0.0-canary.15

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.14
  - @ai-sdk/provider@2.0.0-canary.13
  - @ai-sdk/anthropic@2.0.0-canary.14
  - @ai-sdk/google@2.0.0-canary.15

## 3.0.0-canary.14

### Patch Changes

- 8e171f5: feat (provider/google-vertex): add imagen-3.0-generate-002
- d9209ca: fix (image-model): `specificationVersion: v1` -> `v2`
- Updated dependencies
  - @ai-sdk/google@2.0.0-canary.14
  - @ai-sdk/provider@2.0.0-canary.12
  - @ai-sdk/provider-utils@3.0.0-canary.13
  - @ai-sdk/anthropic@2.0.0-canary.13

## 3.0.0-canary.13

### Patch Changes

- 5c9eec4: chore(providers/anthropic): switch to providerOptions
- 7378473: chore(providers/google): switch to providerOptions
- Updated dependencies
  - @ai-sdk/anthropic@2.0.0-canary.12
  - @ai-sdk/provider@2.0.0-canary.11
  - @ai-sdk/google@2.0.0-canary.13
  - @ai-sdk/provider-utils@3.0.0-canary.12

## 3.0.0-canary.12

### Patch Changes

- 66962ed: fix(packages): export node10 compatible types
- 9301f86: refactor (image-model): rename `ImageModelV1` to `ImageModelV2`
- Updated dependencies
  - @ai-sdk/google@2.0.0-canary.12
  - @ai-sdk/provider-utils@3.0.0-canary.11
  - @ai-sdk/anthropic@2.0.0-canary.11
  - @ai-sdk/provider@2.0.0-canary.10

## 3.0.0-canary.11

### Patch Changes

- Updated dependencies [e86be6f]
  - @ai-sdk/provider@2.0.0-canary.9
  - @ai-sdk/anthropic@2.0.0-canary.10
  - @ai-sdk/google@2.0.0-canary.11
  - @ai-sdk/provider-utils@3.0.0-canary.10

## 3.0.0-canary.10

### Patch Changes

- cea5997: chore(providers/google-vertex): update embedding model to use providerOptions
- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.8
  - @ai-sdk/google@2.0.0-canary.10
  - @ai-sdk/anthropic@2.0.0-canary.9
  - @ai-sdk/provider-utils@3.0.0-canary.9

## 3.0.0-canary.9

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.8
  - @ai-sdk/provider@2.0.0-canary.7
  - @ai-sdk/anthropic@2.0.0-canary.8
  - @ai-sdk/google@2.0.0-canary.9

## 3.0.0-canary.8

### Patch Changes

- 26735b5: chore(embedding-model): add v2 interface
- 443d8ec: feat(embedding-model-v2): add response body field
- fd65bc6: chore(embedding-model-v2): rename rawResponse to response
- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.6
  - @ai-sdk/google@2.0.0-canary.8
  - @ai-sdk/anthropic@2.0.0-canary.7
  - @ai-sdk/provider-utils@3.0.0-canary.7

## 3.0.0-canary.7

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.5
  - @ai-sdk/anthropic@2.0.0-canary.6
  - @ai-sdk/google@2.0.0-canary.7
  - @ai-sdk/provider-utils@3.0.0-canary.6

## 3.0.0-canary.6

### Patch Changes

- Updated dependencies [6f6bb89]
  - @ai-sdk/provider@2.0.0-canary.4
  - @ai-sdk/anthropic@2.0.0-canary.5
  - @ai-sdk/google@2.0.0-canary.6
  - @ai-sdk/provider-utils@3.0.0-canary.5

## 3.0.0-canary.5

### Patch Changes

- Updated dependencies [d1a1aa1]
  - @ai-sdk/provider@2.0.0-canary.3
  - @ai-sdk/anthropic@2.0.0-canary.4
  - @ai-sdk/google@2.0.0-canary.5
  - @ai-sdk/provider-utils@3.0.0-canary.4

## 3.0.0-canary.4

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.3
  - @ai-sdk/provider@2.0.0-canary.2
  - @ai-sdk/anthropic@2.0.0-canary.3
  - @ai-sdk/google@2.0.0-canary.4

## 3.0.0-canary.3

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider@2.0.0-canary.1
  - @ai-sdk/anthropic@2.0.0-canary.2
  - @ai-sdk/google@2.0.0-canary.3
  - @ai-sdk/provider-utils@3.0.0-canary.2

## 3.0.0-canary.2

### Patch Changes

- Updated dependencies [5cf30ea]
  - @ai-sdk/google@2.0.0-canary.2

## 3.0.0-canary.1

### Patch Changes

- 779d916: feat: add provider option schemas for vertex imagegen and google genai
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.1
  - @ai-sdk/google@2.0.0-canary.1
  - @ai-sdk/anthropic@2.0.0-canary.1

## 3.0.0-canary.0

### Major Changes

- d5f588f: AI SDK 5

### Patch Changes

- 91715e5: fix (provider/google-vertex): fix anthropic support for image urls in messages
- Updated dependencies
  - @ai-sdk/provider-utils@3.0.0-canary.0
  - @ai-sdk/anthropic@2.0.0-canary.0
  - @ai-sdk/google@2.0.0-canary.0
  - @ai-sdk/provider@2.0.0-canary.0

## 2.2.7

### Patch Changes

- Updated dependencies [28be004]
  - @ai-sdk/provider-utils@2.2.3
  - @ai-sdk/anthropic@1.2.4
  - @ai-sdk/google@1.2.5

## 2.2.6

### Patch Changes

- Updated dependencies [b01120e]
  - @ai-sdk/provider-utils@2.2.2
  - @ai-sdk/anthropic@1.2.3
  - @ai-sdk/google@1.2.4

## 2.2.5

### Patch Changes

- 9507f7e: fix (provider/google-vertex): pass through auth options for vertex provider

## 2.2.4

### Patch Changes

- Updated dependencies [aeaa92b]
  - @ai-sdk/anthropic@1.2.2

## 2.2.3

### Patch Changes

- Updated dependencies [871df87]
  - @ai-sdk/google@1.2.3

## 2.2.2

### Patch Changes

- Updated dependencies [f10f0fa]
  - @ai-sdk/provider-utils@2.2.1
  - @ai-sdk/anthropic@1.2.1
  - @ai-sdk/google@1.2.2

## 2.2.1

### Patch Changes

- Updated dependencies [994a13b]
  - @ai-sdk/google@1.2.1

## 2.2.0

### Minor Changes

- 5bc638d: AI SDK 4.2

### Patch Changes

- Updated dependencies [5bc638d]
  - @ai-sdk/anthropic@1.2.0
  - @ai-sdk/google@1.2.0
  - @ai-sdk/provider@1.1.0
  - @ai-sdk/provider-utils@2.2.0

## 2.1.31

### Patch Changes

- Updated dependencies [d0c4659]
  - @ai-sdk/provider-utils@2.1.15
  - @ai-sdk/google@1.1.27
  - @ai-sdk/anthropic@1.1.19

## 2.1.30

### Patch Changes

- Updated dependencies [0bd5bc6]
  - @ai-sdk/provider@1.0.12
  - @ai-sdk/google@1.1.26
  - @ai-sdk/anthropic@1.1.18
  - @ai-sdk/provider-utils@2.1.14

## 2.1.29

### Patch Changes

- Updated dependencies [2e1101a]
  - @ai-sdk/provider@1.0.11
  - @ai-sdk/anthropic@1.1.17
  - @ai-sdk/google@1.1.25
  - @ai-sdk/provider-utils@2.1.13

## 2.1.28

### Patch Changes

- Updated dependencies [5261762]
  - @ai-sdk/google@1.1.24

## 2.1.27

### Patch Changes

- Updated dependencies [413f5a7]
  - @ai-sdk/google@1.1.23

## 2.1.26

### Patch Changes

- Updated dependencies [62f46fd]
  - @ai-sdk/google@1.1.22

## 2.1.25

### Patch Changes

- Updated dependencies [1531959]
  - @ai-sdk/provider-utils@2.1.12
  - @ai-sdk/anthropic@1.1.16
  - @ai-sdk/google@1.1.21

## 2.1.24

### Patch Changes

- Updated dependencies [e1d3d42]
  - @ai-sdk/anthropic@1.1.15
  - @ai-sdk/provider@1.0.10
  - @ai-sdk/google@1.1.20
  - @ai-sdk/provider-utils@2.1.11

## 2.1.23

### Patch Changes

- Updated dependencies
  - @ai-sdk/google@1.1.19
  - @ai-sdk/anthropic@1.1.14

## 2.1.22

### Patch Changes

- Updated dependencies [5c8f512]
  - @ai-sdk/google@1.1.18

## 2.1.21

### Patch Changes

- Updated dependencies [3004b14]
  - @ai-sdk/anthropic@1.1.13

## 2.1.20

### Patch Changes

- Updated dependencies [b3e5a15]
  - @ai-sdk/anthropic@1.1.12

## 2.1.19

### Patch Changes

- Updated dependencies
  - @ai-sdk/anthropic@1.1.11

## 2.1.18

### Patch Changes

- Updated dependencies [ddf9740]
  - @ai-sdk/anthropic@1.1.10
  - @ai-sdk/provider@1.0.9
  - @ai-sdk/google@1.1.17
  - @ai-sdk/provider-utils@2.1.10

## 2.1.17

### Patch Changes

- Updated dependencies [1b2e2a0]
  - @ai-sdk/google@1.1.16

## 2.1.16

### Patch Changes

- Updated dependencies [2761f06]
  - @ai-sdk/provider@1.0.8
  - @ai-sdk/anthropic@1.1.9
  - @ai-sdk/google@1.1.15
  - @ai-sdk/provider-utils@2.1.9

## 2.1.15

### Patch Changes

- Updated dependencies [08a3641]
  - @ai-sdk/google@1.1.14

## 2.1.14

### Patch Changes

- Updated dependencies [2e898b4]
  - @ai-sdk/provider-utils@2.1.8
  - @ai-sdk/anthropic@1.1.8
  - @ai-sdk/google@1.1.13

## 2.1.13

### Patch Changes

- Updated dependencies [3ff4ef8]
  - @ai-sdk/provider-utils@2.1.7
  - @ai-sdk/anthropic@1.1.7
  - @ai-sdk/google@1.1.12

## 2.1.12

### Patch Changes

- Updated dependencies [6eb7fc4]
  - @ai-sdk/google@1.1.11

## 2.1.11

### Patch Changes

- 4da908a: feat (provider/google-vertex): add new gemini models

## 2.1.10

### Patch Changes

- Updated dependencies [e5567f7]
  - @ai-sdk/google@1.1.10

## 2.1.9

### Patch Changes

- Updated dependencies [b2573de]
  - @ai-sdk/google@1.1.9

## 2.1.8

### Patch Changes

- d89c3b9: feat (provider): add image model support to provider specification
- Updated dependencies [d89c3b9]
  - @ai-sdk/provider@1.0.7
  - @ai-sdk/anthropic@1.1.6
  - @ai-sdk/google@1.1.8
  - @ai-sdk/provider-utils@2.1.6

## 2.1.7

### Patch Changes

- d399f25: feat (provider/google-vertex): support public file urls in messages
- Updated dependencies [d399f25]
  - @ai-sdk/google@1.1.7

## 2.1.6

### Patch Changes

- Updated dependencies [e012cd8]
  - @ai-sdk/google@1.1.6

## 2.1.5

### Patch Changes

- Updated dependencies [3a602ca]
  - @ai-sdk/provider-utils@2.1.5
  - @ai-sdk/anthropic@1.1.5
  - @ai-sdk/google@1.1.5

## 2.1.4

### Patch Changes

- Updated dependencies [066206e]
  - @ai-sdk/provider-utils@2.1.4
  - @ai-sdk/anthropic@1.1.4
  - @ai-sdk/google@1.1.4

## 2.1.3

### Patch Changes

- Updated dependencies [39e5c1f]
  - @ai-sdk/provider-utils@2.1.3
  - @ai-sdk/anthropic@1.1.3
  - @ai-sdk/google@1.1.3

## 2.1.2

### Patch Changes

- 3a58a2e: feat (ai/core): throw NoImageGeneratedError from generateImage when no predictions are returned.
- Updated dependencies
  - @ai-sdk/provider-utils@2.1.2
  - @ai-sdk/provider@1.0.6
  - @ai-sdk/anthropic@1.1.2
  - @ai-sdk/google@1.1.2

## 2.1.1

### Patch Changes

- b284e2c: feat (provider/google-vertex): support prompt caching for Anthropic Claude models
- Updated dependencies
  - @ai-sdk/provider-utils@2.1.1
  - @ai-sdk/anthropic@1.1.1
  - @ai-sdk/provider@1.0.5
  - @ai-sdk/google@1.1.1

## 2.1.0

### Minor Changes

- 62ba5ad: release: AI SDK 4.1

### Patch Changes

- Updated dependencies [62ba5ad]
  - @ai-sdk/anthropic@1.1.0
  - @ai-sdk/google@1.1.0
  - @ai-sdk/provider-utils@2.1.0

## 2.0.19

### Patch Changes

- Updated dependencies [00114c5]
  - @ai-sdk/provider-utils@2.0.8
  - @ai-sdk/anthropic@1.0.9
  - @ai-sdk/google@1.0.17

## 2.0.18

### Patch Changes

- 218d001: feat (provider): Add maxImagesPerCall setting to all image providers.

## 2.0.17

### Patch Changes

- Updated dependencies [4eb9b41]
  - @ai-sdk/google@1.0.16

## 2.0.16

### Patch Changes

- Updated dependencies [7611964]
  - @ai-sdk/google@1.0.15

## 2.0.15

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@2.0.7
  - @ai-sdk/anthropic@1.0.8
  - @ai-sdk/google@1.0.14

## 2.0.14

### Patch Changes

- 19a2ce7: feat (ai/core): add aspectRatio and seed options to generateImage
- 6337688: feat: change image generation errors to warnings
- Updated dependencies
  - @ai-sdk/provider@1.0.4
  - @ai-sdk/provider-utils@2.0.6
  - @ai-sdk/anthropic@1.0.7
  - @ai-sdk/google@1.0.13

## 2.0.13

### Patch Changes

- e6ed588: feat (provider/google-vertex): Allow arbitrary image model ids.
- 6612561: fix (provider/google-vertex): Use optional fetch in embed and streamline config.

## 2.0.12

### Patch Changes

- 5ed5e45: chore (config): Use ts-library.json tsconfig for no-UI libs.
- Updated dependencies [5ed5e45]
  - @ai-sdk/provider-utils@2.0.5
  - @ai-sdk/anthropic@1.0.6
  - @ai-sdk/provider@1.0.3
  - @ai-sdk/google@1.0.12

## 2.0.11

### Patch Changes

- 5feec50: feat (provider/google-vertex): Add imagen support.

## 2.0.10

### Patch Changes

- d32abbd: feat (provider/google-vertex): Add gemini 2 models.

## 2.0.9

### Patch Changes

- Updated dependencies [db31e74]
  - @ai-sdk/google@1.0.11

## 2.0.8

### Patch Changes

- e07439a: feat (provider/google): Include safety ratings response detail.
- 4017b0f: feat (provider/google-vertex): Enhance grounding metadata response detail.
- a9df182: feat (provider/google): Add support for search grounding.
- Updated dependencies
  - @ai-sdk/google@1.0.10

## 2.0.7

### Patch Changes

- Updated dependencies [c0b1c7e]
  - @ai-sdk/google@1.0.9

## 2.0.6

### Patch Changes

- b7372dc: feat (provider/google): Include optional response grounding metadata.
- 8224964: feat (provider/google-vertex): Add support for baseURL in API calls.
- Updated dependencies [b7372dc]
  - @ai-sdk/google@1.0.8

## 2.0.5

### Patch Changes

- Updated dependencies [09a9cab]
  - @ai-sdk/provider@1.0.2
  - @ai-sdk/anthropic@1.0.5
  - @ai-sdk/google@1.0.7
  - @ai-sdk/provider-utils@2.0.4

## 2.0.4

### Patch Changes

- 3cfcd0a: fix (provider/google-vertex): Remove unsupported cache control setting from Vertex Anthropic.

## 2.0.3

### Patch Changes

- Updated dependencies [9e54403]
  - @ai-sdk/google@1.0.6

## 2.0.2

### Patch Changes

- 5b0366e: fix (provider/vertex): fix internal reference

## 2.0.1

### Patch Changes

- bcd892e: feat (provider/google-vertex): Add support for Anthropic models.
- Updated dependencies [bcd892e]
  - @ai-sdk/anthropic@1.0.4

## 2.0.0

### Major Changes

- 0984f0b: feat (provider/google-vertex): Rewrite for Edge runtime support.

### Patch Changes

- 0984f0b: chore (providers/google-vertex): Remove unref'd base default provider.
- Updated dependencies
  - @ai-sdk/google@1.0.5
  - @ai-sdk/provider-utils@2.0.3

## 1.0.4

### Patch Changes

- 6373c60: fix (provider/google): send json schema into provider

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
- 8c5daa3: chore (provider/vertex): remove topK model setting

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

### Major Changes

- 8c5daa3: chore (provider/vertex): remove topK model setting

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

## 0.0.43

### Patch Changes

- 4360e2d: feat (provider/vertex): expose search grounding metadata
- e7823a3: feat (provider/vertex): add embedding support

## 0.0.42

### Patch Changes

- aa98cdb: chore: more flexible dependency versioning
- 1486128: feat: add supportsUrl to language model specification
- 1486128: feat (provider/google): support native file URLs without download
- 3b1b69a: feat: provider-defined tools
- Updated dependencies
  - @ai-sdk/provider-utils@1.0.22
  - @ai-sdk/provider@0.0.26

## 0.0.41

### Patch Changes

- Updated dependencies [b9b0d7b]
  - @ai-sdk/provider@0.0.25
  - @ai-sdk/provider-utils@1.0.21

## 0.0.40

### Patch Changes

- 8efa1c5: chore (provider/vertex): update GoogleVertexModelId

## 0.0.39

### Patch Changes

- 465189a: feat (provider/vertex): add schema support
- 33ba542: feat (provider/vertex): support frequencyPenalty setting
- 20ffa73: feat (provider/vertex): tool choice support & object generation with tool mode

## 0.0.38

### Patch Changes

- d595d0d: feat (ai/core): file content parts
- Updated dependencies [d595d0d]
  - @ai-sdk/provider@0.0.24
  - @ai-sdk/provider-utils@1.0.20

## 0.0.37

### Patch Changes

- Updated dependencies [273f696]
  - @ai-sdk/provider-utils@1.0.19

## 0.0.36

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@1.0.18
  - @ai-sdk/provider@0.0.23

## 0.0.35

### Patch Changes

- 26515cb: feat (ai/provider): introduce ProviderV1 specification
- Updated dependencies [26515cb]
  - @ai-sdk/provider@0.0.22
  - @ai-sdk/provider-utils@1.0.17

## 0.0.34

### Patch Changes

- Updated dependencies [09f895f]
  - @ai-sdk/provider-utils@1.0.16

## 0.0.33

### Patch Changes

- Updated dependencies [d67fa9c]
  - @ai-sdk/provider-utils@1.0.15

## 0.0.32

### Patch Changes

- Updated dependencies [f2c025e]
  - @ai-sdk/provider@0.0.21
  - @ai-sdk/provider-utils@1.0.14

## 0.0.31

### Patch Changes

- 04af64f: fix (provider/google-vertex): fix broken tool calling

## 0.0.30

### Patch Changes

- Updated dependencies [6ac355e]
  - @ai-sdk/provider@0.0.20
  - @ai-sdk/provider-utils@1.0.13

## 0.0.29

### Patch Changes

- Updated dependencies [dd712ac]
  - @ai-sdk/provider-utils@1.0.12

## 0.0.28

### Patch Changes

- 89b18ca: fix (ai/provider): send finish reason 'unknown' by default
- Updated dependencies [dd4a0f5]
  - @ai-sdk/provider@0.0.19
  - @ai-sdk/provider-utils@1.0.11

## 0.0.27

### Patch Changes

- 48f618d: feat (provider/google): add search grounding support

## 0.0.26

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@1.0.10
  - @ai-sdk/provider@0.0.18

## 0.0.25

### Patch Changes

- 1e94ed8: feat (provider/google-vertex): support json mode object generation

## 0.0.24

### Patch Changes

- 39b827a: feat (provider/google-vertex): support json mode object generation

## 0.0.23

### Patch Changes

- Updated dependencies [029af4c]
  - @ai-sdk/provider@0.0.17
  - @ai-sdk/provider-utils@1.0.9

## 0.0.22

### Patch Changes

- Updated dependencies [d58517b]
  - @ai-sdk/provider@0.0.16
  - @ai-sdk/provider-utils@1.0.8

## 0.0.21

### Patch Changes

- Updated dependencies [96aed25]
  - @ai-sdk/provider@0.0.15
  - @ai-sdk/provider-utils@1.0.7

## 0.0.20

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@1.0.6

## 0.0.19

### Patch Changes

- a8d1c9e9: feat (ai/core): parallel image download
- Updated dependencies [a8d1c9e9]
  - @ai-sdk/provider-utils@1.0.5
  - @ai-sdk/provider@0.0.14

## 0.0.18

### Patch Changes

- Updated dependencies [4f88248f]
  - @ai-sdk/provider-utils@1.0.4

## 0.0.17

### Patch Changes

- 2b9da0f0: feat (core): support stopSequences setting.
- a5b58845: feat (core): support topK setting
- 4aa8deb3: feat (provider): support responseFormat setting in provider api
- 13b27ec6: chore (ai/core): remove grammar mode
- Updated dependencies
  - @ai-sdk/provider@0.0.13
  - @ai-sdk/provider-utils@1.0.3

## 0.0.16

### Patch Changes

- 0eabc798: feat (provider/google-vertex): change vertexai library into peer dependency

## 0.0.15

### Patch Changes

- bb584330: feat (provider/google-vertex): use systemInstruction content parts

## 0.0.14

### Patch Changes

- Updated dependencies [b7290943]
  - @ai-sdk/provider@0.0.12
  - @ai-sdk/provider-utils@1.0.2

## 0.0.13

### Patch Changes

- Updated dependencies [d481729f]
  - @ai-sdk/provider-utils@1.0.1

## 0.0.12

### Patch Changes

- 5edc6110: feat (ai/core): add custom request header support
- Updated dependencies
  - @ai-sdk/provider@0.0.11
  - @ai-sdk/provider-utils@1.0.0

## 0.0.11

### Patch Changes

- Updated dependencies [02f6a088]
  - @ai-sdk/provider-utils@0.0.16

## 0.0.10

### Patch Changes

- Updated dependencies
  - @ai-sdk/provider-utils@0.0.15

## 0.0.9

### Patch Changes

- 4728c37f: feat (core): add text embedding model support to provider registry
- Updated dependencies [7910ae84]
  - @ai-sdk/provider-utils@0.0.14

## 0.0.8

### Patch Changes

- Updated dependencies [102ca22f]
  - @ai-sdk/provider@0.0.10
  - @ai-sdk/provider-utils@0.0.13

## 0.0.7

### Patch Changes

- 09295e2e: feat (@ai-sdk/google-vertex): automatically download image URLs
- Updated dependencies
  - @ai-sdk/provider@0.0.9
  - @ai-sdk/provider-utils@0.0.12

## 0.0.6

### Patch Changes

- 3a7a4ab6: fix (provider/vertex): fix undefined parts handling

## 0.0.5

### Patch Changes

- 7cab5e9c: feat (provider/vertex): add safety setting option on models

## 0.0.4

### Patch Changes

- f727d197: fix (provider/vertex): correct assistant message conversion
- f727d197: feat (provider/vertex): add tool call support
- 94c60cd3: feat (provider/google): add googleAuthOptions provider configuration setting

## 0.0.3

### Patch Changes

- f39c0dd2: feat (provider): implement toolChoice support
- Updated dependencies [f39c0dd2]
  - @ai-sdk/provider@0.0.8
  - @ai-sdk/provider-utils@0.0.11

## 0.0.2

### Patch Changes

- 24683b72: fix (provider/google-vertex): zod is not a dependency
- Updated dependencies [8e780288]
  - @ai-sdk/provider@0.0.7
  - @ai-sdk/provider-utils@0.0.10

## 0.0.1

### Patch Changes

- 6a50ac4: feat (provider/google-vertex): add Google Vertex provider (text generation and streaming only)
- Updated dependencies
  - @ai-sdk/provider@0.0.6
  - @ai-sdk/provider-utils@0.0.9
