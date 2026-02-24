import { alibaba } from '@ai-sdk/alibaba';
import { generateText } from 'ai';
import 'dotenv/config';

/**
 * Demonstrates Alibaba's explicit cache feature using cache_control.
 * Requires minimum 1,024 tokens for explicit caching.
 */

async function main() {
  const longDocument = 'Here is important context about AI: '.repeat(200);

  console.log('First request...\n');

  const firstResult = await generateText({
    model: alibaba('qwen-plus'),
    messages: [
      {
        role: 'system',
        content: 'You are an expert AI assistant.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Context: Please analyze this document.',
          },
          {
            type: 'text',
            text: longDocument,
            providerOptions: {
              alibaba: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
          {
            type: 'text',
            text: 'What is artificial intelligence?',
          },
        ],
      },
    ],
  });

  console.log('Text:', firstResult.text.substring(0, 50) + '...');
  console.log('Usage:', firstResult.usage);
  console.log(
    'Cache writes:',
    (firstResult.providerMetadata?.alibaba
      ?.cacheCreationInputTokens as number) ?? 0,
  );
  console.log();

  console.log('Second request (hits cache within 5 minutes)...\n');

  const secondResult = await generateText({
    model: alibaba('qwen-plus'),
    messages: [
      {
        role: 'system',
        content: 'You are an expert AI assistant.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Context: Please analyze this document.',
          },
          {
            type: 'text',
            text: longDocument,
            providerOptions: {
              alibaba: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
          {
            type: 'text',
            text: 'Explain machine learning briefly.',
          },
        ],
      },
    ],
  });

  console.log('Text:', secondResult.text.substring(0, 50) + '...');
  console.log('Usage:', secondResult.usage);
  console.log('Cache reads:', secondResult.usage.cachedInputTokens ?? 0);
  console.log();

  console.log('='.repeat(50));

  const firstWriteTokens = (firstResult.providerMetadata?.alibaba
    ?.cacheCreationInputTokens ?? 0) as number;
  const secondReadTokens = secondResult.usage.cachedInputTokens ?? 0;

  if (firstWriteTokens > 0) {
    console.log(
      `SUCCESS: First request created cache (${firstWriteTokens} tokens written)`,
    );
  } else {
    console.log(
      'FAILURE: First request did not create cache - content may be too small',
    );
  }

  if (secondReadTokens > 0) {
    console.log(
      `SUCCESS: Second request hit cache (${secondReadTokens} tokens read from cache)`,
    );
  } else {
    console.log('FAILURE: Second request did not hit cache - may have expired');
  }
}

main().catch(console.error);
