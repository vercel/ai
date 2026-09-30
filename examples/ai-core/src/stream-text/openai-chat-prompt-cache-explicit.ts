import { openai, type OpenAIChatLanguageModelOptions } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { run } from '../lib/run';

const stablePrefix =
  'A support ticket must include the account ID, incident time, observed behavior, expected behavior, and attempted mitigations. '.repeat(
    128,
  );
const promptCacheKey = 'ai-sdk:gpt-5.6:chat-explicit-cache:' + randomUUID();

async function streamWithCachedPrefix(label: string, question: string) {
  const result = streamText({
    model: openai.chat('gpt-5.6'),
    maxOutputTokens: 80,
    allowSystemInMessages: true,
    messages: [
      {
        role: 'system',
        content: stablePrefix,
        providerOptions: {
          openai: {
            promptCacheBreakpoint: { mode: 'explicit' },
          },
        },
      },
      { role: 'user', content: question },
    ],
    providerOptions: {
      openai: {
        reasoningEffort: 'none',
        promptCacheKey,
        promptCacheOptions: { mode: 'explicit', ttl: '30m' },
      } satisfies OpenAIChatLanguageModelOptions,
    },
  });

  process.stdout.write(label + ' response: ');
  for await (const textDelta of result.textStream) {
    process.stdout.write(textDelta);
  }
  console.log();

  return {
    usage: await result.usage,
    providerMetadata: await result.providerMetadata,
  };
}

run(async () => {
  const firstResult = await streamWithCachedPrefix(
    'First',
    'Summarize the required ticket fields.',
  );

  await setTimeout(1000);

  const secondResult = await streamWithCachedPrefix(
    'Second',
    'Which required field describes troubleshooting already performed?',
  );

  const firstOpenAIMetadata = firstResult.providerMetadata?.openai as
    | { usage?: { cacheWriteTokens?: number } }
    | undefined;
  console.log('Cache writes:', firstOpenAIMetadata?.usage?.cacheWriteTokens);
  console.log('Cache reads:', secondResult.usage.cachedInputTokens);
});
