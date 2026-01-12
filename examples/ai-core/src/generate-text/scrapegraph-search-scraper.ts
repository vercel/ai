import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import { searchScraperTool } from 'ai-sdk-scrapegraphai-tools';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o'),
    prompt:
      'Search for the latest AI web scraping tools and summarize the top 3 findings',
    tools: {
      searchScraper: searchScraperTool,
    },
    stopWhen: stepCountIs(5),
  });

  console.log('Tool Calls:', result.toolCalls);
  console.log('Tool Results:', result.toolResults);
  console.log('\nSearch Summary:');
  console.log(result.text);
});

