## Tasks

### generate text support

- [x] generateText chatbot prototype
- [x] message conversion testing
- [x] image inputs
- [x] doGenerate testing
- [x] structured outputs (json mode)
- [x] finish reason support
- [x] tool call support
- [x] test tool mode structured outputs

### streamText support

- [x] streamText chatbot prototype
- [x] test scaffolding
- [x] finish reason support
- [x] test incomplete response (different chunks)
- [x] model id, created at, message id
- [x] tool call support
- [x] test streaming tool calls

### args

- [x] settings
- [x] system message support
- [x] provider option: parallel tool calls = false
- [x] provider option: store = false
- [x] provider option: metadata
- [x] provider option: user
- [x] provider option (on images): detail
- [x] json response format support
- [ ] provider option: structuredOutputs (strict false) strictStructuredOutput: false
- [ ] custom: cached prompt token usage information
- [ ] custom: predicted outputs?
- [ ] tool option: strict (requires tool provider options)

### reasoning

- [x] reasoning model settings etc
- [x] developer messages
- [x] provider option: reasoning effort
- [ ] reasoning tokens output (streaming / non-streaming)

### provider-defined tool support

- [x] web search tool (basic)
- [ ] web search tool options
- [ ] computer use tool
- [ ] file search

### previousResponseId support

### integration

- [x] export responses language model to azure

### documentation

- [ ] responses section under OpenAI provider
