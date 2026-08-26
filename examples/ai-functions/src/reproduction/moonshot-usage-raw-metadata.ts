import { createMoonshotAI } from '@ai-sdk/moonshotai';
import type { FetchFunction } from '@ai-sdk/provider-utils';
import { generateText, streamText } from 'ai';
import { isDeepStrictEqual } from 'node:util';

const expectedRawUsage = {
  prompt_tokens: 10,
  completion_tokens: 8,
  total_tokens: 18,
  cached_tokens: 3,
  prompt_tokens_details: {
    cached_tokens: 3,
    provider_prompt_sentinel: { cache_tier: 'future' },
  },
  completion_tokens_details: {
    reasoning_tokens: 2,
    provider_completion_sentinel: { token_class: 'future' },
  },
  provider_usage_sentinel: { billing_tier: 'future' },
};

const responseBase = {
  id: 'chatcmpl-reproduction',
  created: 1_787_771_085,
  model: 'kimi-k3',
};

function jsonFetch(body: unknown): FetchFunction {
  return async () =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    });
}

function streamFetch(chunks: Array<unknown>): FetchFunction {
  return async () =>
    new Response(
      [
        ...chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
        'data: [DONE]\n\n',
      ].join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    );
}

function createProvider(fetch: FetchFunction) {
  return createMoonshotAI({ apiKey: 'test-api-key', fetch });
}

function assertNormalizedUsage(
  label: string,
  usage: {
    inputTokens: number | undefined;
    inputTokenDetails: {
      noCacheTokens: number | undefined;
      cacheReadTokens: number | undefined;
    };
    outputTokens: number | undefined;
    outputTokenDetails: {
      textTokens: number | undefined;
      reasoningTokens: number | undefined;
    };
    totalTokens: number | undefined;
  },
) {
  const actual = {
    inputTokens: usage.inputTokens,
    noCacheTokens: usage.inputTokenDetails.noCacheTokens,
    cacheReadTokens: usage.inputTokenDetails.cacheReadTokens,
    outputTokens: usage.outputTokens,
    textTokens: usage.outputTokenDetails.textTokens,
    reasoningTokens: usage.outputTokenDetails.reasoningTokens,
    totalTokens: usage.totalTokens,
  };
  const expected = {
    inputTokens: 10,
    noCacheTokens: 7,
    cacheReadTokens: 3,
    outputTokens: 8,
    textTokens: 6,
    reasoningTokens: 2,
    totalTokens: 18,
  };

  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      `Reproduction invariant failed: ${label} normalized usage changed: ${JSON.stringify(actual)}`,
    );
  }
}

async function generateUsage() {
  const provider = createProvider(
    jsonFetch({
      ...responseBase,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'OK' },
          finish_reason: 'stop',
        },
      ],
      usage: expectedRawUsage,
    }),
  );

  return (
    await generateText({
      model: provider('kimi-k3'),
      prompt: 'Reply with OK.',
    })
  ).usage;
}

async function streamUsage(location: 'choice' | 'top-level') {
  const finishChunk = {
    ...responseBase,
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: { content: 'OK' },
        finish_reason: 'stop',
        ...(location === 'choice' && { usage: expectedRawUsage }),
      },
    ],
  };
  const chunks: Array<unknown> = [finishChunk];

  if (location === 'top-level') {
    chunks.push({
      ...responseBase,
      object: 'chat.completion.chunk',
      choices: [],
      usage: expectedRawUsage,
    });
  }

  const provider = createProvider(streamFetch(chunks));
  const result = streamText({
    model: provider('kimi-k3'),
    prompt: 'Reply with OK.',
  });

  return result.usage;
}

async function assertKnownUsageValidation() {
  const provider = createProvider(
    jsonFetch({
      ...responseBase,
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'OK' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        ...expectedRawUsage,
        prompt_tokens: 'invalid-known-field-type',
      },
    }),
  );

  let rejected = false;
  try {
    await generateText({
      model: provider('kimi-k3'),
      prompt: 'Reply with OK.',
    });
  } catch {
    rejected = true;
  }

  if (!rejected) {
    throw new Error(
      'Reproduction invariant failed: known prompt_tokens type validation was not retained',
    );
  }
}

async function main() {
  const cases = [
    ['non-streaming', await generateUsage()],
    ['streaming choice usage', await streamUsage('choice')],
    ['streaming top-level usage', await streamUsage('top-level')],
  ] as const;

  const metadataFailures: Array<string> = [];
  for (const [label, usage] of cases) {
    assertNormalizedUsage(label, usage);
    if (!isDeepStrictEqual(usage.raw, expectedRawUsage)) {
      metadataFailures.push(`${label}: ${JSON.stringify(usage.raw)}`);
    }
  }

  await assertKnownUsageValidation();

  if (metadataFailures.length > 0) {
    throw new Error(
      `ISSUE #19619 REPRODUCED: Moonshot usage.raw stripped provider metadata\n${metadataFailures.join('\n')}`,
    );
  }

  console.log(
    'Issue #19619 is fixed: complete Moonshot usage.raw metadata was preserved.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
