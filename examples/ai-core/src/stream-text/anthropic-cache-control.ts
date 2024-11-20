import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

async function main() {
  const result = streamText({
    model: anthropic('claude-3-5-sonnet-20240620', {
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
    onFinish({ experimental_providerMetadata }) {
      console.log();
      console.log('=== onFinish ===');
      console.log(experimental_providerMetadata?.anthropic);
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log('=== providerMetadata Promise ===');
  console.log((await result.experimental_providerMetadata)?.anthropic);
  // e.g. { cacheCreationInputTokens: 2118, cacheReadInputTokens: 0 }
}

main().catch(console.error);
