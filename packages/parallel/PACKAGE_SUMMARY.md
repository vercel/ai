# Parallel Chat API Package Summary

## Overview

This package provides integration for Parallel's Chat API within the AI SDK ecosystem. The package follows the same structure and patterns as the Perplexity provider package.

## Package Details

- **Package Name**: `@ai-sdk/parallel`
- **Version**: 0.0.1
- **License**: Apache-2.0
- **API Endpoint**: https://api.parallel.ai
- **Environment Variable**: `PARALLEL_API_KEY`

## Features Implemented

### Core Functionality
- ✅ OpenAI ChatCompletions compatible API
- ✅ Streaming support with low latency (3s p50 TTFT)
- ✅ JSON schema response format support
- ✅ Custom system prompts
- ✅ Standard AI SDK LanguageModelV3 interface
- ✅ Proper error handling and validation
- ✅ TypeScript types and declarations

### Supported Models
- `speed` - Optimized for low latency interactive applications

## File Structure

```
packages/parallel/
├── src/
│   ├── index.ts                           # Main entry point
│   ├── parallel-provider.ts               # Provider implementation
│   ├── parallel-language-model.ts         # Language model implementation
│   ├── parallel-language-model-options.ts # Model ID types
│   ├── parallel-language-model-prompt.ts  # Prompt types
│   ├── convert-to-parallel-messages.ts    # Message conversion utilities
│   ├── map-parallel-finish-reason.ts      # Finish reason mapping
│   └── version.ts                         # Version information
├── dist/                                  # Built output (generated)
├── package.json                           # Package configuration
├── tsconfig.json                          # TypeScript configuration
├── tsconfig.build.json                    # Build-specific TypeScript config
├── tsup.config.ts                         # Build tool configuration
├── turbo.json                             # Turbo build configuration
├── vitest.node.config.js                  # Node test configuration
├── vitest.edge.config.js                  # Edge runtime test configuration
├── README.md                              # Package documentation
├── EXAMPLE.md                             # Usage examples
└── CHANGELOG.md                           # Version history
```

## API Reference

### Provider Instance

```typescript
import { parallel } from '@ai-sdk/parallel';

// Use with AI SDK
const model = parallel('speed');
```

### Custom Provider

```typescript
import { createParallel } from '@ai-sdk/parallel';

const parallel = createParallel({
  apiKey: 'your-api-key',
  baseURL: 'https://api.parallel.ai',
  headers: { /* custom headers */ },
  fetch: customFetch, // optional custom fetch
});
```

## Implementation Details

### Based on Parallel API Documentation

From [Parallel's Chat API Quickstart](https://docs.parallel.ai/chat-api/chat-quickstart):

1. **API Endpoint**: `https://api.parallel.ai/chat/completions`
2. **Model Name**: `speed`
3. **Authentication**: Bearer token via `PARALLEL_API_KEY`
4. **Features**:
   - OpenAI SDK compatible
   - Streaming support
   - JSON schema response format
   - 300 requests/minute rate limit
   - 3 second p50 TTFT

### Key Differences from Perplexity Package

1. **No Citations**: Parallel doesn't return citations in the same format as Perplexity
2. **No Images**: Parallel doesn't return image metadata like Perplexity
3. **Simplified Metadata**: Simpler usage and response metadata structure
4. **Model ID**: Single `speed` model instead of multiple sonar models

## Build Status

- ✅ TypeScript compilation successful
- ✅ Type checking passes
- ✅ No linter errors
- ✅ Build outputs generated correctly

## Dependencies

### Runtime Dependencies
- `@ai-sdk/provider` (workspace:*)
- `@ai-sdk/provider-utils` (workspace:*)

### Development Dependencies
- `@ai-sdk/test-server` (workspace:*)
- `@types/node` (20.17.24)
- `@vercel/ai-tsconfig` (workspace:*)
- `tsup` (^8)
- `typescript` (5.8.3)
- `zod` (3.25.76)

### Peer Dependencies
- `zod` (^3.25.76 || ^4.1.8)

## Usage Example

```typescript
import { parallel } from '@ai-sdk/parallel';
import { generateText, streamText } from 'ai';

// Basic text generation
const { text } = await generateText({
  model: parallel('speed'),
  prompt: 'What does Parallel Web Systems do?',
});

// Streaming
const result = await streamText({
  model: parallel('speed'),
  prompt: 'Explain quantum computing',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

// JSON Schema output
const { object } = await generateObject({
  model: parallel('speed'),
  schema: z.object({
    reasoning: z.string(),
    answer: z.string(),
    citations: z.array(z.string()),
  }),
  prompt: 'Research quantum computing',
});
```

## Testing

Test configuration files are in place:
- `vitest.node.config.js` - For Node.js environment tests
- `vitest.edge.config.js` - For Edge runtime tests

To run tests:
```bash
pnpm test           # Run all tests
pnpm test:node      # Run Node.js tests
pnpm test:edge      # Run Edge runtime tests
pnpm test:watch     # Watch mode
```

## Next Steps

Potential enhancements:
1. Add unit tests for message conversion
2. Add integration tests with mock API
3. Add support for additional Parallel API features as they become available
4. Add documentation to the main AI SDK docs site
5. Add example applications in the examples directory

## Related Documentation

- [Parallel Chat API Documentation](https://docs.parallel.ai/chat-api/chat-quickstart)
- [AI SDK Provider Interface](https://ai-sdk.dev/docs)
- [Perplexity Package](../perplexity) - Reference implementation

