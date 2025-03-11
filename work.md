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

### web search support

- [x] web search tool (basic)
- [x] sources support: generate
- [x] sources support: stream
- [ ] web search tool options

### previousResponseId support

- [x] provider option: previousResponseId
- [x] providerMetadata: responseId

### computer use support

- [ ] computer use tool

### integration

- [x] export responses language model to azure

### documentation

- [ ] responses section under OpenAI provider
- [ ] provider options table (top-level)

### future work

- [ ] file search tool
- [ ] tool option: strict (requires tool provider options)
- [ ] progress information (e.g. websearch)
- [ ] citations
