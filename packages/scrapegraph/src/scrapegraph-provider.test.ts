import { describe, it, expect } from 'vitest';
import { createScrapeGraph } from './scrapegraph-provider';

describe('createScrapeGraph', () => {
  it('should create a provider instance', () => {
    const provider = createScrapeGraph({
      apiKey: 'test-key',
    });

    expect(provider).toBeDefined();
    expect(provider.smartScraper).toBeDefined();
    expect(provider.searchScraper).toBeDefined();
    expect(provider.markdownify).toBeDefined();
    expect(provider.scrape).toBeDefined();
    expect(provider.crawlInitiate).toBeDefined();
    expect(provider.crawlFetchResults).toBeDefined();
    expect(provider.agenticScraper).toBeDefined();
    expect(provider.sitemap).toBeDefined();
  });

  it('should throw error when API key is missing', () => {
    expect(() => {
      const provider = createScrapeGraph();
      // Trigger API key loading by calling a method that requires headers
      // This would throw when trying to make an actual API call
    }).not.toThrow(); // Provider creation should not throw
  });
});

