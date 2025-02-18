# Tasks

- [ ] implementation
  - [x] reasoning settings & warnings
  - [x] reasoning output streaming
  - [x] reasoning output non-streaming
  - [x] convert reasoning input: CoreMessage -> LanguageModelMessage
  - [x] reasoning input anthropic mapping
  - [x] toResponseMessages reasoning support
  - [x] generateText assistant message reasoning parts
  - [x] fix for empty reasoning at source
  - [ ] streamText assistant message reasoning parts
  - [ ] reasoning conversion from ui messages (reasoning message roundtrips with UI)
  - [ ] support in ui parts
  - [ ] multistep ui with reasoning
- [ ] documentation
  - [ ] anthropic provider page
  - [ ] prompt page: assistant message reasoning part
  - [ ] message reference: assistant message reasoning part
  - [ ] reference pages: assistant message reasoning part
- [ ] examples
  - [x] anthropic reasoning examples
  - [x] anthropic reasoning chatbot with tools (generateText)
  - [ ] reasoning ui example
        with reasoning roundtrip
  - [ ] reasoning message roundtrip example
- [ ] changeset

# Future Work

- reasoning output redacted streaming
- reasoning output redacted non-streaming
- protocol extension for redacted reasoning

  Idea: fullReasoning, redacted flag on reasoning parts
