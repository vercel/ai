import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: 'Search for information about TypeScript best practices',
    tools: {
      webSearch: openai.tools.webSearchPreview({
        searchContextSize: 'medium',
        userLocation: {
          type: 'approximate',
          city: 'San Francisco',
          region: 'California',
          country: 'US',
        },
      }),

      fileSearch: openai.tools.fileSearch({
        maxNumResults: 5,
        ranking: {
          ranker: 'auto',
        },
      }),
    },
  });

  console.log('Result:', result.text);
  console.log('Tool calls made:', result.toolCalls.length);

  for (const toolCall of result.toolCalls) {
    console.log(`\nTool Call:`);
    console.log(`- Tool: ${toolCall.toolName}`);
    console.log(`- Input:`, JSON.stringify(toolCall.input, null, 2));
  }
}

main().catch(console.error);
