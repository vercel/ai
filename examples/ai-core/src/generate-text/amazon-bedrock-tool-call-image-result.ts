import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod/v4';

async function main() {
  const result = await generateText({
    model: bedrock('us.anthropic.claude-3-7-sonnet-20250219-v1:0'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Please download this image https://upload.wikimedia.org/wikipedia/commons/f/f8/Alan_Turing_%281951%29.jpg and tell me what you see',
          },
        ],
      },
    ],
    tools: {
      submit: tool({
        description: 'Download an image',
        inputSchema: z.object({
          url: z.string().describe('The image URL'),
        }),
        execute: async ({ url }) => {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          return { bytes };
        },
        toModelOutput(result) {
          return {
            type: 'content',
            value: [
              {
                type: 'media',
                data: Buffer.from(result.bytes).toString('base64'),
                mediaType: 'image/jpeg',
              },
            ],
          };
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  console.log(result.text);
}

main().catch(console.error);
