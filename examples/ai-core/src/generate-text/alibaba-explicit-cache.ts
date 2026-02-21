import { alibaba } from '@ai-sdk/alibaba';
import { generateText } from 'ai';
import 'dotenv/config';

/**
 * Demonstrates Alibaba's explicit cache feature using cache_control.
 * Requires minimum 1,024 tokens for explicit caching.
 */

async function main() {
  // Long system prompt (1024+ tokens required for explicit cache)
  const longSystemPrompt = 'You are an expert AI assistant. '.repeat(200);

  console.log('First request...\n');

  const firstResult = await generateText({
    model: alibaba('qwen-plus'),
    messages: [
      {
        role: 'system',
        content: longSystemPrompt,
        providerOptions: {
          alibaba: {
            cache_control: { type: 'ephemeral' },
          },
        },
      },
      {
        role: 'user',
        content: 'What is artificial intelligence?',
      },
    ],
  });

  console.log('Text:', firstResult.text.substring(0, 50) + '...');
  console.log('Usage:', firstResult.usage);
  console.log();

  console.log('Second request (hits cache within 5 minutes)...\n');

  const secondResult = await generateText({
    model: alibaba('qwen-plus'),
    messages: [
      {
        role: 'system',
        content: longSystemPrompt, // Same content
        providerOptions: {
          alibaba: {
            cache_control: { type: 'ephemeral' },
          },
        },
      },
      {
        role: 'user',
        content: 'Explain machine learning briefly.',
      },
    ],
  });

  console.log('Text:', secondResult.text.substring(0, 50) + '...');
  console.log('Usage:', secondResult.usage);
  console.log();

  console.log('='.repeat(50));

  const firstCachedTokens = firstResult.usage.cachedInputTokens ?? 0;
  const secondCachedTokens = secondResult.usage.cachedInputTokens ?? 0;

  if (firstCachedTokens > 0) {
    console.log(
      `SUCCESS: First request hit existing cache (${firstCachedTokens} tokens)`,
    );
    console.log('(Cache from previous run still valid - within 5 minute TTL)');
  } else {
    console.log('First request: no cache hit (cache created for next request)');
  }

  if (secondCachedTokens > 0) {
    console.log(
      `SUCCESS: Second request hit cache (${secondCachedTokens} tokens)`,
    );
  } else {
    console.log('Second request: no cache hit');
  }
}

main().catch(console.error);
