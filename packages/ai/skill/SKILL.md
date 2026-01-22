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

## Provider-Specific Information

For questions about specific providers (OpenAI, Anthropic, Google, etc.), search their dedicated packages:

1. **Provider documentation**: `grep "your query" node_modules/@ai-sdk/<provider>/docs/`
2. **Provider source code**: `grep "your query" node_modules/@ai-sdk/<provider>/src/`

To find provider files:

- `glob "node_modules/@ai-sdk/<provider>/docs/**/*.mdx"` for provider documentation
- `glob "node_modules/@ai-sdk/<provider>/src/**/*.ts"` for provider source files

This is especially important for `providerOptions`, which are provider-specific settings passed to model calls. Each provider has unique options documented in their package.
