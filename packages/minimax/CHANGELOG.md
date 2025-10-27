# @ai-sdk/minimax

## 0.0.1

### Initial Release

- Added MiniMax provider with support for MiniMax-M2 text generation model
- **Default provider**: Anthropic-compatible API via `minimax` and `createMinimax` exports
- OpenAI-compatible API interface via `minimaxOpenAI` and `createMinimaxOpenAI` exports  
- Anthropic-compatible API interface via `minimaxAnthropic` export
- Both compatibility modes included in a single package
- Streaming and non-streaming text generation
- Custom configuration support for both modes
- Separate test files for each provider for better maintainability
- Provider identifiers: `minimax.anthropic` and `minimax.openai`

