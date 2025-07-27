import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    prompt: 'Search for recent information about AI SDK development',
    tools: {
      webSearch: anthropic.tools.webSearch_20250305({
        maxUses: 3,
        allowedDomains: ['github.com', 'vercel.com', 'docs.ai'],
        userLocation: {
          type: 'approximate',
          city: 'San Francisco',
          region: 'California',
          country: 'US',
        },
      }),

      computer: anthropic.tools.computer_20250124({
        displayWidthPx: 1920,
        displayHeightPx: 1080,
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
