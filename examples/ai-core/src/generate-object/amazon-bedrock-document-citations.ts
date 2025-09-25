import { bedrock, BedrockProviderOptions } from '@ai-sdk/amazon-bedrock';
import { generateObject } from 'ai';
import { z } from 'zod';
import fs from 'fs';
import 'dotenv/config';
import { BedrockFilePartProviderOptions } from '../../../../packages/amazon-bedrock/src/bedrock-chat-options';

async function main() {
  const result = await generateObject({
    model: bedrock('us.anthropic.claude-sonnet-4-20250514-v1:0'),
    schema: z.object({
      summary: z.string().describe('Summary of the PDF document'),
      keyPoints: z.array(z.string()).describe('Key points from the PDF'),
    }),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Summarize this PDF and provide key points.',
          },
          {
            type: 'file',
            data: fs.readFileSync('./data/ai.pdf'),
            mediaType: 'application/pdf',
            providerOptions: {
              bedrock: {
                citations: { enabled: true },
              } satisfies BedrockFilePartProviderOptions,
            },
          },
        ],
      },
    ],
  });

  console.log('Response:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
