import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMistral } from './mistral-provider';

type Usage = Record<string, unknown>;

const liveNormalResponse = JSON.parse(
  fs.readFileSync('src/__fixtures__/mistral-usage-raw-live.json', 'utf8'),
) as {
  usage: Usage;
};

const liveStreamEvents = fs
  .readFileSync('src/__fixtures__/mistral-usage-raw-live.chunks.txt', 'utf8')
  .trim()
  .split('\n')
  .map(line => JSON.parse(line) as { usage?: Usage });

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

function createJsonModel(responseBody: Record<string, unknown>) {
  return createMistral({
    apiKey: 'test-api-key',
    fetch: async () => Response.json(responseBody),
  }).chat('mistral-small-latest');
}

function createStreamModel(events: Array<Record<string, unknown>>) {
  return createMistral({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(
        `${events
          .map(event => `data: ${JSON.stringify(event)}\n\n`)
          .join('')}data: [DONE]\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  }).chat('mistral-small-latest');
}

function expectNormalizedUsageUnchanged(usage: LanguageModelV4Usage) {
  expect(usage).toMatchObject({
    inputTokens: {
      total: 20,
      noCache: 20,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: 2,
      text: 2,
      reasoning: undefined,
    },
  });
}

describe('Mistral raw usage preservation reproduction for #19870', () => {
  it('preserves the complete live normal usage object without changing normalized usage', async () => {
    const result = await createJsonModel(liveNormalResponse).doGenerate({
      prompt,
    });

    expect(result.usage.raw).toStrictEqual(liveNormalResponse.usage);
    expectNormalizedUsageUnchanged(result.usage);
  });

  it('preserves the final complete live streaming usage object', async () => {
    const firstUsage = {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
      service_tier: 'earlier-event',
    };
    const events = structuredClone(liveStreamEvents);
    events[1] = { ...events[1], usage: firstUsage };

    const result = await createStreamModel(events).doStream({ prompt });
    const parts = await convertReadableStreamToArray(result.stream);
    const finish = parts.find(part => part.type === 'finish');
    const finalUsage = events.at(-1)?.usage;

    expect(finalUsage).toBeDefined();
    expect(finish?.type).toBe('finish');
    expect(finish?.usage.raw).toStrictEqual(finalUsage);
    expect(finish?.usage.raw).not.toStrictEqual(firstUsage);
    expectNormalizedUsageUnchanged(finish!.usage);
  });

  it('preserves officially modeled and unknown usage fields at every represented level', async () => {
    const usage = {
      ...liveNormalResponse.usage,
      prompt_audio_seconds: 3,
      request_count: 1,
      num_cached_tokens: 0,
      prompt_tokens_details: {
        cached_tokens: 0,
        audio_tokens: 4,
        messages: [
          {
            role: 'user',
            total_tokens: 20,
          },
        ],
        unknown_prompt_sentinel: 'preserve-prompt',
      },
      prompt_token_details: {
        cached_tokens: 0,
        audio_tokens: 5,
        messages: [],
        unknown_prompt_token_sentinel: 'preserve-prompt-token',
      },
      completion_tokens_details: {
        reasoning_tokens: 1,
        unknown_completion_sentinel: 'preserve-completion',
      },
      unknown_usage_sentinel: 'preserve-usage',
    };
    const response = structuredClone(liveNormalResponse);
    response.usage = usage;

    const result = await createJsonModel(response).doGenerate({ prompt });

    expect(result.usage.raw).toStrictEqual(usage);
    expectNormalizedUsageUnchanged(result.usage);
  });

  it.each([
    ['prompt_tokens', 'invalid'],
    ['completion_tokens', 'invalid'],
    ['total_tokens', 'invalid'],
    ['prompt_audio_seconds', 'invalid'],
    ['request_count', 'invalid'],
    ['service_tier', 123],
    ['num_cached_tokens', 'invalid'],
    ['prompt_tokens_details', { cached_tokens: 'invalid' }],
    ['prompt_tokens_details', { audio_tokens: 'invalid' }],
    ['prompt_tokens_details', { messages: 'invalid' }],
    ['prompt_token_details', { cached_tokens: 'invalid' }],
    ['prompt_token_details', { audio_tokens: 'invalid' }],
    ['prompt_token_details', { messages: 'invalid' }],
    ['completion_tokens_details', { reasoning_tokens: 'invalid' }],
  ])('rejects an invalid known %s value', async (field, invalidValue) => {
    const response = structuredClone(liveNormalResponse);
    response.usage = {
      ...response.usage,
      [field]: invalidValue,
    };

    await expect(
      createJsonModel(response).doGenerate({ prompt }),
    ).rejects.toThrow();
  });
});
