import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { smartScraperTool } from 'ai-sdk-scrapegraphai-tools';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    prompt:
      'Extract product information (name, price, description) from https://scrapegraphai.com',
    tools: {
      smartScraper: smartScraperTool,
    },
  });

  console.log('Tool Calls:', result.toolCalls);
  console.log('Tool Results:', result.toolResults);
  console.log('\nExtracted Information:');
  console.log(result.text);
});

