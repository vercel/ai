import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config();

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

const anthropic = createAnthropic({
  // example fetch wrapper that logs the input to the API call:
  fetch: async (url, options) => {
    console.log('URL', url);
    console.log('Headers', JSON.stringify(options!.headers, null, 2));
    console.log(
      `Body ${JSON.stringify(JSON.parse(options!.body! as string), null, 2)}`,
    );
    return await fetch(url, options);
  },
});

async function main() {
  const result = await streamText({
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
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  // console.log(await result.experimental_providerMetadata?.anthropic);
  // e.g. { cacheCreationInputTokens: 2118, cacheReadInputTokens: 0 }
}

main().catch(console.error);
