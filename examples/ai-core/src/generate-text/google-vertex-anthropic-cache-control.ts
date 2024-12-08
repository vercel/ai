import 'dotenv/config';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';
import fs from 'node:fs';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

async function main() {
  const result = await generateText({
    model: vertexAnthropic('claude-3-5-sonnet-v2@20241022', {
      cacheControl: true,
    }),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'You are a JavaScript expert.',
          },
          {
            type: 'text',
            text: `Error message: ${errorMessage}`,
            experimental_providerMetadata: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
          {
            type: 'text',
            text: 'Explain the error message.',
          },
        ],
      },
    ],
  });

  console.log(result.text);
  console.log(result.experimental_providerMetadata?.anthropic);
  // e.g. { cacheCreationInputTokens: 2118, cacheReadInputTokens: 0 }
}

main().catch(console.error);
