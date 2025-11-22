# ScrapeGraph AI Examples

This directory contains practical examples demonstrating how to use ScrapeGraph AI tools with the Vercel AI SDK.

## Prerequisites

1. Get your ScrapeGraph API key from the [ScrapeGraph AI Dashboard](https://dashboard.scrapegraphai.com/)
2. Set up your environment variables:

```bash
export SGAI_APIKEY=your_scrapegraph_api_key
export OPENAI_API_KEY=your_openai_api_key
```

Or create a `.env` file:

```bash
SGAI_APIKEY=your_scrapegraph_api_key
OPENAI_API_KEY=your_openai_api_key
```

## Installation

From the root of the repository:

```bash
pnpm install
pnpm build
```

## Available Examples

All examples are located in `examples/ai-core/src/generate-text/`:

### 1. Smart Scraper (`scrapegraph-smart-scraper.ts`)

Extract structured data from websites using AI (10 credits/page).

```bash
pnpm tsx examples/ai-core/src/generate-text/scrapegraph-smart-scraper.ts
```

This example demonstrates:
- AI-powered data extraction
- Structured information parsing
- Product information extraction

### 2. Search Scraper (`scrapegraph-search-scraper.ts`)

Search the web and extract information from multiple sources (10 credits/website).

```bash
pnpm tsx examples/ai-core/src/generate-text/scrapegraph-search-scraper.ts
```

This example demonstrates:
- Multi-source web searching
- Search result aggregation
- Content summarization

### 3. Markdownify (`scrapegraph-markdownify.ts`)

Convert webpages to clean markdown format (2 credits/page).

```bash
pnpm tsx examples/ai-core/src/generate-text/scrapegraph-markdownify.ts
```

This example demonstrates:
- HTML to Markdown conversion
- Documentation extraction
- Clean content formatting

### 4. Multiple Tools (`scrapegraph-multiple-tools.ts`)

Combine multiple ScrapeGraph tools for complex workflows.

```bash
pnpm tsx examples/ai-core/src/generate-text/scrapegraph-multiple-tools.ts
```

This example demonstrates:
- Using multiple tools together
- Sitemap extraction
- Comprehensive website analysis
- Multi-step workflows

### 5. Product Research (`scrapegraph-product-research.ts`)

Build a product research agent that compares products across websites.

```bash
pnpm tsx examples/ai-core/src/generate-text/scrapegraph-product-research.ts
```

This example demonstrates:
- Product comparison
- Price analysis
- Review aggregation
- Competitive research

### 6. Documentation Crawler (`scrapegraph-crawl-docs.ts`)

Crawl and extract documentation from multiple pages.

```bash
pnpm tsx examples/ai-core/src/generate-text/scrapegraph-crawl-docs.ts
```

This example demonstrates:
- Multi-page crawling
- Crawl job management
- Status monitoring
- Documentation extraction

### 7. Credits & Health Check (`scrapegraph-credits-check.ts`)

Check API credits balance and health status.

```bash
pnpm tsx examples/ai-core/src/generate-text/scrapegraph-credits-check.ts
```

This example demonstrates:
- API health monitoring
- Credit balance checking
- Account management

## Cost Estimation

| Tool               | Cost per Operation | Example File                          |
| ------------------ | ------------------ | ------------------------------------- |
| smartScraperTool   | 10 credits         | scrapegraph-smart-scraper.ts          |
| searchScraperTool  | 10 credits/site    | scrapegraph-search-scraper.ts         |
| markdownifyTool    | 2 credits          | scrapegraph-markdownify.ts            |
| crawlTool          | 2-10 credits/page  | scrapegraph-crawl-docs.ts             |
| sitemapTool        | 1 credit           | scrapegraph-multiple-tools.ts         |
| getCreditsTool     | Free               | scrapegraph-credits-check.ts          |
| healthzTool        | Free               | scrapegraph-credits-check.ts          |

## Best Practices

### 1. Rate Limiting

Use `stepCountIs()` to control the number of tool calls:

```typescript
import { stepCountIs } from 'ai';

const result = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Scrape multiple pages',
  tools: { smartScraper: smartScraperTool },
  stopWhen: stepCountIs(5), // Limit to 5 steps
});
```

### 2. Error Handling

Always implement proper error handling:

```typescript
try {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: 'Scrape https://example.com',
    tools: { smartScraper: smartScraperTool },
  });
  console.log(result.text);
} catch (error) {
  console.error('Scraping failed:', error);
}
```

### 3. Monitor Credits

Check your balance before expensive operations:

```typescript
import { getCreditsTool } from 'ai-sdk-scrapegraphai-tools';

// Check credits first
const { text: credits } = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Check my credits balance',
  tools: { getCredits: getCreditsTool },
});
```

## Use Cases

These examples demonstrate various use cases:

- **Competitive Analysis**: Monitor competitor websites (product-research)
- **Market Research**: Gather data from multiple sources (search-scraper)
- **Content Aggregation**: Collect and summarize content (multiple-tools)
- **Documentation Crawling**: Build RAG systems (crawl-docs)
- **Product Research**: Compare products across sites (product-research)
- **Price Monitoring**: Track product prices (smart-scraper)

## Additional Resources

- [ScrapeGraph AI Provider Documentation](/docs/providers/community-providers/scrapegraph)
- [Web Scraping Agent Cookbook](/docs/cookbook/node/web-scraping-scrapegraph-agent)
- [ScrapeGraph AI Documentation](https://docs.scrapegraphai.com)
- [ScrapeGraph AI Dashboard](https://dashboard.scrapegraphai.com/)
- [npm Package](https://www.npmjs.com/package/ai-sdk-scrapegraphai-tools)

## Troubleshooting

### API Key Not Found

Make sure your `SGAI_APIKEY` or `SCRAPEGRAPH_API_KEY` environment variable is set:

```bash
echo $SGAI_APIKEY
```

### Insufficient Credits

Check your balance:

```bash
pnpm tsx examples/ai-core/src/generate-text/scrapegraph-credits-check.ts
```

### Rate Limiting

If you hit rate limits, reduce the `maxSteps` or `stepCountIs()` value in your code.

## Contributing

To add new examples:

1. Create a new file in `examples/ai-core/src/generate-text/`
2. Follow the naming convention: `scrapegraph-<feature-name>.ts`
3. Use the `run()` helper from `../lib/run`
4. Document the example in this README

## Support

For issues or questions:

- [GitHub Issues](https://github.com/vercel/ai/issues)
- [ScrapeGraph AI Support](https://scrapegraphai.com/contact)
- [AI SDK Documentation](https://sdk.vercel.ai)

