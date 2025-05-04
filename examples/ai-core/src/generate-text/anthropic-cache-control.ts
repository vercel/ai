import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20240620'),
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
  });

  console.log(result.text);
  console.log();

  console.log('Cache read tokens:', result.usage.cachedInputTokens);
  console.log(
    'Cache write tokens:',
    result.providerMetadata?.anthropic?.cacheCreationInputTokens,
  );
}

main().catch(console.error);
