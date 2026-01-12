import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { markdownifyTool } from 'ai-sdk-scrapegraphai-tools';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: 'Convert https://docs.scrapegraphai.com to markdown format',
    tools: {
      markdownify: markdownifyTool,
    },
  });

  console.log('Tool Calls:', result.toolCalls);
  console.log('Tool Results:', result.toolResults);
  console.log('\nMarkdown Content:');
  console.log(result.text);
});

