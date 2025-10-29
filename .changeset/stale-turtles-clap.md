---
'@ai-sdk/amazon-bedrock': minor
'@ai-sdk/google-vertex': minor
---

feat(provider/amazon-bedrock,provider/google-vertex-anthropic): add support for tool calling with structured output

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
