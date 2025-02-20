# Tasks

- [x] implementation flannel
  - [x] reasoning settings & warnings
  - [x] reasoning output streaming
  - [x] reasoning output non-streaming
  - [x] convert reasoning input: CoreMessage -> LanguageModelMessage
  - [x] reasoning input anthropic mapping
  - [x] toResponseMessages reasoning support
  - [x] fix for empty reasoning at source
  - [x] ui message to core message conversion
  - [x] generateText assistant message reasoning parts
  - [x] streamText assistant message reasoning parts
- [ ] implementation denim

  - [ ] specification
    - [x] input
    - [x] doGenerate output
  - [ ] anthropic provider
    - [x] input mapping
  - [x] messages
  - [x] convertToLanguageModelMessage
  - [x] generateText
    - [x] reasoningText
    - [x] reasoningDetails
    - [x] update output messages mapping
  - [ ] streamText

- [ ] documentation
  - [x] anthropic provider page
  - [x] prompt page: assistant message reasoning part
  - [ ] reference pages: assistant message reasoning part
- [x] examples
  - [x] anthropic reasoning examples
  - [x] anthropic reasoning chatbot with tools (generateText)
  - [x] reasoning ui example with roundtrip
- [ ] testing
  - [ ] e2e deepseek
  - [ ] e2e anthropic
- [ ] changeset
