import 'dotenv/config';
import { vertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { streamText } from 'ai';
import fs from 'node:fs';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

async function main() {
  const result = streamText({
    model: vertexAnthropic('claude-3-5-sonnet-v2@20241022'),
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
            providerOptions: {
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
    onFinish({ providerMetadata }) {
      console.log();
      console.log('=== onFinish ===');
      console.log(providerMetadata?.anthropic);
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log('=== providerMetadata Promise ===');
  console.log((await result.providerMetadata)?.anthropic);
  // e.g. { cacheCreationInputTokens: 2118, cacheReadInputTokens: 0 }
}

main().catch(console.error);
