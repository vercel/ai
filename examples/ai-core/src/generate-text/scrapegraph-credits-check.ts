import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { getCreditsTool, healthzTool } from 'ai-sdk-scrapegraphai-tools';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    prompt:
      'Check my ScrapeGraph API credits balance and verify the API health status',
    tools: {
      getCredits: getCreditsTool,
      healthz: healthzTool,
    },
  });

  console.log('Tool Calls:', result.toolCalls);
  console.log('Tool Results:', result.toolResults);
  console.log('\nAPI Status:');
  console.log(result.text);
});

