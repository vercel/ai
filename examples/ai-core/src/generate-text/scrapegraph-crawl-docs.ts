import { openai } from '@ai-sdk/openai';
import { generateText, stepCountIs } from 'ai';
import { crawlTool, getCrawlRequestTool } from 'ai-sdk-scrapegraphai-tools';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o'),
    prompt: `Start a crawl job for https://docs.scrapegraphai.com to extract all documentation pages.
      Monitor the crawl status and provide a summary when complete.`,
    tools: {
      crawl: crawlTool,
      getCrawlRequest: getCrawlRequestTool,
    },
    stopWhen: stepCountIs(10),
  });

  console.log('Crawl Job Progress');
  console.log('=' .repeat(50));
  console.log(`\nTool calls made: ${result.toolCalls.length}`);
  console.log('\nCrawl Summary:');
  console.log(result.text);

  // Display tool results for detailed information
  result.toolResults.forEach((toolResult, index) => {
    console.log(`\nTool Result ${index + 1}:`);
    console.log('Tool Name:', toolResult.toolName);
    console.log('Result:', JSON.stringify(toolResult.result, null, 2));
  });
});

