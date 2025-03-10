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
- [ ] image detail support
- [ ] json response format support
- [ ] provider option: structuredOutputs false
- [ ] custom: cached prompt token usage information
- [ ] custom: predicted outputs?

### reasoning

- [x] reasoning model settings etc
- [x] developer messages
- [x] provider option: reasoning effort
- [ ] reasoning tokens output (streaming / non-streaming)

### provider-defined tool support

- [x] web search tool (basic)
- [ ] computer use tool
- [ ] file search

### previousResponseId support

### integration

- [x] export responses language model to azure

### documentation

- [ ] responses section under OpenAI provider
