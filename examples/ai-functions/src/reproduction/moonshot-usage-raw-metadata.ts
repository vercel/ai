import { createMoonshotAI } from '@ai-sdk/moonshotai';
import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Reply with OK.' }],
  },
];

const providerUsage = {
  prompt_tokens: 20,
  completion_tokens: 30,
  total_tokens: 50,
  cached_tokens: 6,
  provider_usage_metadata: { tier: 'sentinel-tier' },
  prompt_tokens_details: {
    cached_tokens: 6,
    provider_prompt_metadata: 'sentinel-prompt',
  },
  completion_tokens_details: {
    reasoning_tokens: 7,
    provider_completion_metadata: 'sentinel-completion',
  },
};

function createProvider(response: () => Response) {
  return createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async () => response(),
  });
}

function jsonResponse(usage: unknown) {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-reproduction',
      created: 1,
      model: 'kimi-k3',
      choices: [
        {
          message: { role: 'assistant', content: 'OK' },
          finish_reason: 'stop',
        },
      ],
      usage,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

function streamResponse(chunks: Array<unknown>) {
  return new Response(
    `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  );
}

function assertNormalizedUsage(usage: LanguageModelV4Usage, context: string) {
  assert.deepStrictEqual(
    usage.inputTokens,
    {
      total: 20,
      noCache: 14,
      cacheRead: 6,
      cacheWrite: undefined,
    },
    `${context}: normalized input/cache token counts changed`,
  );
  assert.deepStrictEqual(
    usage.outputTokens,
    {
      total: 30,
      text: 23,
      reasoning: 7,
    },
    `${context}: normalized output/reasoning token counts changed`,
  );
}

function recordRawUsageFailure(
  failures: Array<string>,
  context: string,
  usage: LanguageModelV4Usage,
) {
  if (!isDeepStrictEqual(usage.raw, providerUsage)) {
    failures.push(context);
  }
}

async function readStreamFinishUsage(response: Response) {
  const provider = createProvider(() => response.clone());
  const result = await provider('kimi-k3').doStream({ prompt });
  const reader = result.stream.getReader();

  while (true) {
    const { done, value: part } = await reader.read();
    if (done) {
      break;
    }
    if (part.type === 'finish') {
      return part.usage;
    }
  }

  throw new Error(
    'SECONDARY_ASSERTION_FAILED: stream did not emit finish usage',
  );
}

async function main() {
  const rawUsageFailures: Array<string> = [];

  const generateResult = await createProvider(() =>
    jsonResponse(providerUsage),
  )('kimi-k3').doGenerate({ prompt });
  assertNormalizedUsage(generateResult.usage, 'non-streaming');
  recordRawUsageFailure(
    rawUsageFailures,
    'non-streaming response',
    generateResult.usage,
  );

  const usageOnFinishChunk = await readStreamFinishUsage(
    streamResponse([
      {
        id: 'chatcmpl-stream-finish',
        created: 1,
        model: 'kimi-k3',
        choices: [
          {
            delta: { content: 'OK' },
            finish_reason: 'stop',
          },
        ],
        usage: providerUsage,
      },
    ]),
  );
  assertNormalizedUsage(usageOnFinishChunk, 'streaming finish chunk');
  recordRawUsageFailure(
    rawUsageFailures,
    'streaming finish chunk',
    usageOnFinishChunk,
  );

  const usageOnSeparateChunk = await readStreamFinishUsage(
    streamResponse([
      {
        id: 'chatcmpl-stream-separate',
        created: 1,
        model: 'kimi-k3',
        choices: [
          {
            delta: { content: 'OK' },
            finish_reason: 'stop',
          },
        ],
        usage: null,
      },
      {
        id: 'chatcmpl-stream-separate',
        created: 1,
        model: 'kimi-k3',
        choices: [],
        usage: providerUsage,
      },
    ]),
  );
  assertNormalizedUsage(usageOnSeparateChunk, 'separate streaming usage chunk');
  recordRawUsageFailure(
    rawUsageFailures,
    'separate streaming usage chunk',
    usageOnSeparateChunk,
  );

  let invalidKnownFieldRejected = false;
  try {
    await createProvider(() =>
      jsonResponse({ ...providerUsage, prompt_tokens: '20' }),
    )('kimi-k3').doGenerate({ prompt });
  } catch {
    invalidKnownFieldRejected = true;
  }
  assert.equal(
    invalidKnownFieldRejected,
    true,
    'SECONDARY_ASSERTION_FAILED: known prompt_tokens type was accepted',
  );

  if (rawUsageFailures.length > 0) {
    throw new Error(
      `ISSUE_19619_REPRODUCED: usage.raw stripped provider metadata in ${rawUsageFailures.join(', ')}`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
