import { generateText } from 'ai';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { z } from 'zod';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: bedrock('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
    prompt: 'Find me 3 accounts',
    tools: {
      querySalesforce: {
        description: 'Query Salesforce',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          return `Results for query: ${query}`;
        },
      },
    },
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log('Stop sequence:', result.providerMetadata?.bedrock?.stopSequence);
}

main().catch(error => {
  console.error('Error generating text:', error);
});
