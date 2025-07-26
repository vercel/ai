import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';
import fs from 'node:fs';

const errorMessage = fs.readFileSync('data/error-message.txt', 'utf8');

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-5-sonnet-20240620'),
    headers: {
      "anthropic-beta": "extended-cache-ttl-2025-04-11",
    },
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
                cacheControl: { type: 'ephemeral', ttl: '1hr' },
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

  console.log('Usage information:', result.providerMetadata?.anthropic?.usage);
  
  const cachedResult = await generateText({
    model: anthropic('claude-3-5-sonnet-20240620'),
    headers: {
      "anthropic-beta": "extended-cache-ttl-2025-04-11",
    },
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
                cacheControl: { type: 'ephemeral', ttl: '1hr' },
              },
            },
          },
          {
            type: 'text',
            text: 'What is this?.',
          },
        ],
      },
    ],
  });
  
  console.log(cachedResult.text);
  console.log();

  console.log('Usage information:', cachedResult.providerMetadata?.anthropic?.usage);
}

main().catch(console.error);
