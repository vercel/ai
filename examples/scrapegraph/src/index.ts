import { scrapegraph } from '@ai-sdk/scrapegraph';

async function main() {
  console.log('ScrapeGraph AI SDK Examples\n');

  // Example 1: SmartScraper - Extract structured data
  console.log('1. SmartScraper Example:');
  try {
    const smartScraperResult = await scrapegraph.smartScraper({
      website_url: 'https://example.com',
      user_prompt: 'Extract the main heading and description from the page',
      output_schema: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          description: { type: 'string' },
        },
      },
    });
    console.log('SmartScraper result:', smartScraperResult);
  } catch (error) {
    console.error('SmartScraper error:', error);
  }
  console.log();

  // Example 2: Markdownify - Convert to markdown
  console.log('2. Markdownify Example:');
  try {
    const markdown = await scrapegraph.markdownify({
      website_url: 'https://example.com',
      render_heavy_js: false,
    });
    console.log('Markdown (first 500 chars):', markdown.substring(0, 500));
  } catch (error) {
    console.error('Markdownify error:', error);
  }
  console.log();

  // Example 3: SearchScraper - Search and extract
  console.log('3. SearchScraper Example:');
  try {
    const searchResults = await scrapegraph.searchScraper({
      user_prompt: 'Find information about AI and machine learning',
      num_results: 3,
    });
    console.log('Search results:', searchResults);
  } catch (error) {
    console.error('SearchScraper error:', error);
  }
  console.log();

  // Example 4: Scrape - Get raw HTML
  console.log('4. Scrape Example:');
  try {
    const html = await scrapegraph.scrape({
      website_url: 'https://example.com',
      render_heavy_js: false,
    });
    console.log('HTML (first 500 chars):', html.substring(0, 500));
  } catch (error) {
    console.error('Scrape error:', error);
  }
  console.log();

  // Example 5: Sitemap - Extract site structure
  console.log('5. Sitemap Example:');
  try {
    const sitemap = await scrapegraph.sitemap({
      website_url: 'https://example.com',
    });
    console.log('Sitemap:', sitemap);
  } catch (error) {
    console.error('Sitemap error:', error);
  }
  console.log();

  // Example 6: Crawl - Multi-page crawling (initiate and poll)
  console.log('6. Crawl Example:');
  try {
    const crawlResponse = await scrapegraph.crawlInitiate({
      url: 'https://example.com',
      prompt: 'Extract all page titles',
      depth: 1,
      max_pages: 5,
      same_domain_only: true,
      extraction_mode: 'ai',
    });
    console.log('Crawl initiated:', crawlResponse);

    // Poll for results
    if (crawlResponse.request_id) {
      console.log('Polling for crawl results...');
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        const results = await scrapegraph.crawlFetchResults(
          crawlResponse.request_id,
        );
        console.log(`Attempt ${attempts + 1}: Status = ${results.status}`);

        if (results.status === 'completed') {
          console.log('Crawl completed:', results.data);
          break;
        } else if (results.status === 'failed') {
          console.error('Crawl failed:', results.error);
          break;
        }

        attempts++;
      }

      if (attempts >= maxAttempts) {
        console.log('Crawl polling timed out');
      }
    }
  } catch (error) {
    console.error('Crawl error:', error);
  }
  console.log();

  // Example 7: Agentic Scraper - AI-powered workflow
  console.log('7. Agentic Scraper Example:');
  try {
    const agenticResult = await scrapegraph.agenticScraper({
      url: 'https://example.com',
      user_prompt: 'Navigate the site and extract key information',
      ai_extraction: true,
      persistent_session: false,
    });
    console.log('Agentic scraper result:', agenticResult);
  } catch (error) {
    console.error('Agentic scraper error:', error);
  }

  console.log('\nAll examples completed!');
}

main().catch(console.error);

