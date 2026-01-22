---
name: ai-sdk
description: Answer questions about the AI SDK and help build AI-powered features. Use when developers: (1) Ask about AI SDK functions like generateText, streamText, ToolLoopAgent, or tools, (2) Want to build AI agents, chatbots, or text generation features, (3) Have questions about AI providers (OpenAI, Anthropic, etc.), streaming, tool calling, or structured output.
metadata:
  author: Vercel Inc.
  version: '1.0'
---

## AI SDK Usage

When you need up-to-date information about the AI SDK, search the bundled documentation and source code in `node_modules/ai/`:

1. **Documentation**: `grep "your query" node_modules/ai/docs/`
2. **Source code**: `grep "your query" node_modules/ai/src/`

To find specific files:
- `glob "node_modules/ai/docs/**/*.mdx"` for documentation files
- `glob "node_modules/ai/src/**/*.ts"` for source files

Use these resources for current API details, usage patterns, and examples.

For common errors and troubleshooting, see [Common Errors Reference](references/common-errors.md).
