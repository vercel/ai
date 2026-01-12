import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import {
  smartScraperTool,
  searchScraperTool,
  markdownifyTool,
  sitemapTool,
} from 'ai-sdk-scrapegraphai-tools';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o'),
    prompt: `Analyze the ScrapeGraph AI website (https://scrapegraphai.com):
      1. Get the sitemap structure
      2. Extract key product features
      3. Search for user reviews or testimonials
      4. Convert the main page to markdown for documentation`,
    tools: {
      smartScraper: smartScraperTool,
      searchScraper: searchScraperTool,
      markdownify: markdownifyTool,
      sitemap: sitemapTool,
    },
    stopWhen: stepCountIs(10),
  });

  console.log('Tool Calls:', result.toolCalls.length);
  console.log('\nAnalysis Report:');
  console.log(result.text);
});

