# Vercel AI SDK - ScrapeGraph AI Provider

The **[ScrapeGraph AI provider](https://scrapegraphai.com)** for the [Vercel AI SDK](https://ai-sdk.dev) provides AI-powered web scraping capabilities through various scraping methods.

## Setup

The ScrapeGraph AI provider is available in the `@ai-sdk/scrapegraph` module. You can install it with:

```bash
npm i @ai-sdk/scrapegraph
```

## Provider Instance

You can import the default provider instance `scrapegraph` from `@ai-sdk/scrapegraph`:

```ts
import { scrapegraph } from '@ai-sdk/scrapegraph';
```

## Example Usage

### SmartScraper - Extract Structured Data

```ts
import { scrapegraph } from '@ai-sdk/scrapegraph';

const data = await scrapegraph.smartScraper({
  website_url: 'https://example.com',
  user_prompt: 'Extract product information including name, price, and description',
  output_schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      price: { type: 'number' },
      description: { type: 'string' }
    }
  }
});

console.log(data);
```

### SearchScraper - Search and Extract

```ts
import { scrapegraph } from '@ai-sdk/scrapegraph';

const results = await scrapegraph.searchScraper({
  user_prompt: 'Find the latest AI research papers',
  num_results: 5
});

console.log(results);
```

### Markdownify - Convert to Markdown

```ts
import { scrapegraph } from '@ai-sdk/scrapegraph';

const markdown = await scrapegraph.markdownify({
  website_url: 'https://example.com',
  render_heavy_js: false
});

console.log(markdown);
```

### Scrape - Raw HTML

```ts
import { scrapegraph } from '@ai-sdk/scrapegraph';

const html = await scrapegraph.scrape({
  website_url: 'https://example.com',
  render_heavy_js: false
});

console.log(html);
```

### Crawl - Multi-page Crawling

```ts
import { scrapegraph } from '@ai-sdk/scrapegraph';

// Initiate crawl
const { request_id } = await scrapegraph.crawlInitiate({
  url: 'https://example.com',
  prompt: 'Extract product data',
  depth: 2,
  max_pages: 10,
  same_domain_only: true,
  extraction_mode: 'ai'
});

// Poll for results
let results;
do {
  results = await scrapegraph.crawlFetchResults(request_id);
  if (results.status === 'completed') {
    console.log(results.data);
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
} while (results.status === 'processing' || results.status === 'pending');
```

### Agentic Scraper - AI-Powered Workflow

```ts
import { scrapegraph } from '@ai-sdk/scrapegraph';

const data = await scrapegraph.agenticScraper({
  url: 'https://example.com',
  user_prompt: 'Navigate to products, filter by category, and extract top items',
  steps: [
    'Click on the products link',
    'Select category: Electronics',
    'Extract top 5 items'
  ],
  ai_extraction: true
});

console.log(data);
```

### Sitemap - Extract Site Structure

```ts
import { scrapegraph } from '@ai-sdk/scrapegraph';

const sitemap = await scrapegraph.sitemap({
  website_url: 'https://example.com'
});

console.log(sitemap);
```

## Configuration

You can configure the provider with custom settings:

```ts
import { createScrapeGraph } from '@ai-sdk/scrapegraph';

const customScrapeGraph = createScrapeGraph({
  apiKey: 'your-api-key', // or set SCRAPEGRAPH_API_KEY env variable
  baseURL: 'https://api.scrapegraphai.com/v1',
  headers: {
    'Custom-Header': 'value'
  }
});

const data = await customScrapeGraph.smartScraper({
  website_url: 'https://example.com',
  user_prompt: 'Extract content'
});
```

## Documentation

Please check out the **[ScrapeGraph AI documentation](https://docs.scrapegraphai.com)** for more information.

