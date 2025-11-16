# ScrapeGraph AI Integration

This document describes the ScrapeGraph AI integration that has been added to the Vercel AI SDK.

## Overview

ScrapeGraph AI is an AI-powered web scraping service that provides multiple extraction methods. This integration adds a new provider package `@ai-sdk/scrapegraph` to the AI SDK ecosystem.

## What Was Added

### 1. Provider Package (`packages/scrapegraph/`)

A complete provider package with the following structure:

```
packages/scrapegraph/
├── src/
│   ├── index.ts                      # Main exports
│   ├── scrapegraph-provider.ts       # Core provider implementation
│   ├── scrapegraph-config.ts         # Configuration utilities
│   ├── scrapegraph-error.ts          # Error handling
│   ├── scrapegraph-types.ts          # TypeScript types
│   ├── scrapegraph-provider.test.ts  # Unit tests
│   └── version.ts                    # Version management
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsup.config.ts
├── vitest.node.config.js
├── vitest.edge.config.js
├── README.md
└── CHANGELOG.md
```

### 2. API Methods

The provider implements all ScrapeGraph AI API endpoints:

- **`smartScraper()`** - Extract structured data using AI (10 credits/page)
- **`searchScraper()`** - Search and extract from multiple sources (10 credits/website)
- **`markdownify()`** - Convert webpages to markdown (2 credits/page)
- **`scrape()`** - Fetch raw HTML content (1 credit/page)
- **`crawlInitiate()`** - Start multi-page crawling (2-10 credits/page)
- **`crawlFetchResults()`** - Poll crawl results
- **`agenticScraper()`** - AI-powered workflow automation (variable credits)
- **`sitemap()`** - Extract website structure (1 credit/request)

### 3. Example Implementation (`examples/scrapegraph/`)

A complete example project demonstrating all API methods:

```
examples/scrapegraph/
├── src/
│   └── index.ts                # Comprehensive examples
├── package.json
├── tsconfig.json
└── README.md
```

### 4. Documentation

#### Provider Documentation
- **`content/providers/03-community-providers/80-scrapegraph.mdx`**
  - Complete API reference
  - Usage examples for all methods
  - Configuration options
  - Cost information
  - Integration examples with AI models

#### Cookbook Recipe
- **`content/cookbook/05-node/57-web-scraping-agent.mdx`**
  - Building web scraping agents
  - Product research agent example
  - Multi-page crawler implementation
  - Use cases (competitive analysis, content aggregation, market research)
  - Best practices

### 5. Configuration Updates

Updated the following files to include the new package:

- **`tsconfig.json`** - Added scrapegraph package reference
- **`tsconfig.with-examples.json`** - Added scrapegraph example reference

## Installation & Usage

### Installation

```bash
pnpm add @ai-sdk/scrapegraph
```

### Basic Usage

```typescript
import { scrapegraph } from '@ai-sdk/scrapegraph';

// Extract structured data
const data = await scrapegraph.smartScraper({
  website_url: 'https://example.com',
  user_prompt: 'Extract product information',
  output_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      price: { type: 'number' }
    }
  }
});
```

### With AI SDK Integration

```typescript
import { scrapegraph } from '@ai-sdk/scrapegraph';
import { openai } from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const result = await generateText({
  model: openai('gpt-4-turbo'),
  tools: {
    scrapeWebsite: tool({
      description: 'Scrape and extract data from websites',
      parameters: z.object({
        url: z.string(),
        extractionPrompt: z.string(),
      }),
      execute: async ({ url, extractionPrompt }) => {
        return await scrapegraph.smartScraper({
          website_url: url,
          user_prompt: extractionPrompt,
        });
      },
    }),
  },
  prompt: 'Find information about AI developments',
  maxSteps: 5,
});
```

## API Configuration

The provider supports the following configuration options:

```typescript
import { createScrapeGraph } from '@ai-sdk/scrapegraph';

const customProvider = createScrapeGraph({
  apiKey: 'your-api-key',              // or set SCRAPEGRAPH_API_KEY env var
  baseURL: 'https://api.scrapegraphai.com/v1',
  headers: { 'Custom-Header': 'value' },
  fetch: customFetchFunction,
});
```

## Environment Variables

- `SCRAPEGRAPH_API_KEY` or `SGAI_APIKEY` - Your ScrapeGraph AI API key

## Features

✅ All ScrapeGraph AI API endpoints implemented
✅ TypeScript support with full type definitions
✅ Error handling with detailed error messages
✅ Custom fetch support for middleware/testing
✅ Comprehensive documentation and examples
✅ Unit tests for both Node.js and Edge environments
✅ Integration examples with AI models
✅ Cookbook recipes for common use cases

## Cost Management

Different endpoints have different credit costs:

| Endpoint | Cost |
|----------|------|
| `scrape()` | 1 credit/page |
| `markdownify()` | 2 credits/page |
| `smartScraper()` | 10 credits/page |
| `searchScraper()` | 10 credits/website |
| `crawlInitiate()` (AI) | 10 credits/page |
| `crawlInitiate()` (Markdown) | 2 credits/page |
| `agenticScraper()` | Variable |
| `sitemap()` | 1 credit/request |

## Testing

The package includes comprehensive tests:

```bash
cd packages/scrapegraph
pnpm test          # Run all tests
pnpm test:node     # Run Node.js tests
pnpm test:edge     # Run Edge runtime tests
```

## Building

```bash
cd packages/scrapegraph
pnpm build
```

Or from the root:

```bash
pnpm turbo build --filter=@ai-sdk/scrapegraph
```

## Files Created

### Package Files
- `packages/scrapegraph/package.json`
- `packages/scrapegraph/tsconfig.json`
- `packages/scrapegraph/tsconfig.build.json`
- `packages/scrapegraph/tsup.config.ts`
- `packages/scrapegraph/vitest.node.config.js`
- `packages/scrapegraph/vitest.edge.config.js`
- `packages/scrapegraph/README.md`
- `packages/scrapegraph/CHANGELOG.md`
- `packages/scrapegraph/src/index.ts`
- `packages/scrapegraph/src/scrapegraph-provider.ts`
- `packages/scrapegraph/src/scrapegraph-config.ts`
- `packages/scrapegraph/src/scrapegraph-error.ts`
- `packages/scrapegraph/src/scrapegraph-types.ts`
- `packages/scrapegraph/src/scrapegraph-provider.test.ts`
- `packages/scrapegraph/src/version.ts`

### Example Files
- `examples/scrapegraph/package.json`
- `examples/scrapegraph/tsconfig.json`
- `examples/scrapegraph/README.md`
- `examples/scrapegraph/src/index.ts`

### Documentation Files
- `content/providers/03-community-providers/80-scrapegraph.mdx`
- `content/cookbook/05-node/57-web-scraping-agent.mdx`

### Configuration Updates
- `tsconfig.json` (updated)
- `tsconfig.with-examples.json` (updated)

## Next Steps

1. **Test the integration** with a real API key
2. **Publish the package** to npm when ready
3. **Update the main documentation** index/navigation if needed
4. **Announce the integration** in relevant channels

## Resources

- [ScrapeGraph AI Website](https://scrapegraphai.com)
- [ScrapeGraph AI Documentation](https://docs.scrapegraphai.com)
- [ScrapeGraph AI API Reference](https://docs.scrapegraphai.com/api-reference)
- [AI SDK Documentation](https://ai-sdk.dev)

## Support

For issues or questions:
- GitHub Issues: https://github.com/vercel/ai/issues
- ScrapeGraph AI Support: https://scrapegraphai.com/support

