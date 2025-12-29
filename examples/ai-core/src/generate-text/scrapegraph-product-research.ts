import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import {
  searchScraperTool,
  smartScraperTool,
} from 'ai-sdk-scrapegraphai-tools';
import { run } from '../lib/run';

run(async () => {
  const productQuery = 'mechanical keyboards under $100';

  const result = await generateText({
    model: openai('gpt-4o'),
    prompt: `Research ${productQuery} and provide:
      1. Product specifications comparison
      2. Price comparison across different retailers
      3. Customer reviews summary
      4. Pros and cons
      5. Best value recommendation`,
    tools: {
      searchScraper: searchScraperTool,
      smartScraper: smartScraperTool,
    },
    stopWhen: stepCountIs(10),
    maxSteps: 10,
  });

  console.log(`Product Research: ${productQuery}`);
  console.log('=' .repeat(50));
  console.log(`\nTools used: ${result.toolCalls.length} calls`);
  console.log('\nResearch Report:');
  console.log(result.text);
});

