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
- [x] json response format support
- [x] provider option: parallel tool calls
- [x] provider option: store
- [x] provider option: metadata
- [x] provider option: user
- [x] provider option (on images): detail
- [x] provider option: strictJsonSchema
- [x] provider metadata: cached prompt token usage

### reasoning

- [x] reasoning model settings etc
- [x] developer messages
- [x] provider option: reasoning effort
- [x] provider metadata: reasoning tokens

### provider-defined tool support

- [x] web search tool (basic)
- [ ] web search tool options
- [ ] computer use tool
- [ ] file search

### previousResponseId support

- [ ] provider option: previousResponseId

### integration

- [x] export responses language model to azure

### documentation

- [ ] responses section under OpenAI provider
- [ ] provider options table (top-level)

### future work

- [ ] tool option: strict (requires tool provider options)
