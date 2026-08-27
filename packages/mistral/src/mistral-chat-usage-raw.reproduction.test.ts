import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMistral } from './mistral-provider';

const CHAT_COMPLETIONS_URL = 'https://api.mistral.ai/v1/chat/completions';

const TEST_PROMPT: LanguageModelV3Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Reply with OK.' }] },
];

const server = createTestServer({
  [CHAT_COMPLETIONS_URL]: {},
});

const model = createMistral({
  apiKey: 'test-api-key',
}).chat('mistral-small-latest');

const liveNormalResponse = JSON.parse(
  fs.readFileSync('src/__fixtures__/mistral-usage-raw-live.json', 'utf8'),
);

const liveStreamChunks = fs
  .readFileSync('src/__fixtures__/mistral-usage-raw-live.chunks.txt', 'utf8')
  .trim()
  .split('\n')
  .map(line => `data: ${line}\n\n`);

function prepareNormalResponse(usage: Record<string, unknown>) {
  server.urls[CHAT_COMPLETIONS_URL].response = {
    type: 'json-value',
    body: {
      ...liveNormalResponse,
      usage,
    },
  };
}

function prepareStreamResponse(usages: Record<string, unknown>[]) {
  server.urls[CHAT_COMPLETIONS_URL].response = {
    type: 'stream-chunks',
    chunks: [
      ...liveStreamChunks.slice(0, -1),
      ...usages.map(usage => {
        const finalChunk = JSON.parse(liveStreamChunks.at(-1)!.slice(6));
        return `data: ${JSON.stringify({ ...finalChunk, usage })}\n\n`;
      }),
      'data: [DONE]\n\n',
    ],
  };
}

async function generateUsage() {
  return (await model.doGenerate({ prompt: TEST_PROMPT })).usage;
}

async function streamUsage() {
  const result = await model.doStream({ prompt: TEST_PROMPT });
  const parts = await convertReadableStreamToArray(result.stream);
  return parts.find(part => part.type === 'finish')!.usage;
}

describe('Mistral chat raw usage issue #19870', () => {
  it('preserves the complete live normal usage object', async () => {
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'json-value',
      body: liveNormalResponse,
    };

    const usage = await generateUsage();

    expect(usage.raw).toStrictEqual(liveNormalResponse.usage);
    expect(usage).toMatchObject({
      inputTokens: {
        total: 19,
        noCache: 19,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 2,
        text: 2,
        reasoning: undefined,
      },
    });
  });

  it('preserves the complete live streaming usage object', async () => {
    server.urls[CHAT_COMPLETIONS_URL].response = {
      type: 'stream-chunks',
      chunks: [...liveStreamChunks, 'data: [DONE]\n\n'],
    };

    const usage = await streamUsage();
    const finalProviderUsage = JSON.parse(
      liveStreamChunks.at(-1)!.slice(6),
    ).usage;

    expect(usage.raw).toStrictEqual(finalProviderUsage);
    expect(usage).toMatchObject({
      inputTokens: {
        total: 19,
        noCache: 19,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 2,
        text: 2,
        reasoning: undefined,
      },
    });
  });

  it('preserves known and unknown usage fields without changing normalized tokens', async () => {
    const completeUsage = {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      prompt_audio_seconds: 3,
      request_count: 1,
      service_tier: 'standard',
      num_cached_tokens: 10,
      prompt_tokens_details: {
        cached_tokens: 8,
        audio_tokens: 2,
        messages: [{ role: 'user', total_tokens: 4 }],
        unknown_prompt_detail: 'preserve',
      },
      prompt_token_details: {
        cached_tokens: 7,
        audio_tokens: 1,
        messages: [{ role: 'system', total_tokens: 3 }],
        unknown_legacy_prompt_detail: 'preserve',
      },
      completion_tokens_details: {
        reasoning_tokens: 6,
        unknown_completion_detail: 'preserve',
      },
      unknown_usage_field: 'preserve',
    };
    prepareNormalResponse(completeUsage);

    const usage = await generateUsage();

    expect(usage.raw).toStrictEqual(completeUsage);
    expect(usage).toMatchObject({
      inputTokens: {
        total: 100,
        noCache: 90,
        cacheRead: 10,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 20,
        text: 20,
        reasoning: undefined,
      },
    });
  });

  it('uses the final streaming usage event', async () => {
    const firstUsage = {
      prompt_tokens: 1,
      completion_tokens: 2,
      total_tokens: 3,
    };
    const finalUsage = {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    };
    prepareStreamResponse([firstUsage, finalUsage]);

    const usage = await streamUsage();

    expect(usage.raw).toStrictEqual(finalUsage);
    expect(usage.inputTokens.total).toBe(10);
    expect(usage.outputTokens.total).toBe(20);
  });

  describe.each([
    ['prompt_tokens', { prompt_tokens: 'invalid' }],
    ['completion_tokens', { completion_tokens: 'invalid' }],
    ['total_tokens', { total_tokens: 'invalid' }],
    ['prompt_audio_seconds', { prompt_audio_seconds: 'invalid' }],
    ['request_count', { request_count: 'invalid' }],
    ['service_tier', { service_tier: 123 }],
    ['num_cached_tokens', { num_cached_tokens: 'invalid' }],
    ['prompt_tokens_details', { prompt_tokens_details: 'invalid' }],
    ['prompt_token_details', { prompt_token_details: 'invalid' }],
    ['completion_tokens_details', { completion_tokens_details: 'invalid' }],
    [
      'prompt_tokens_details.cached_tokens',
      { prompt_tokens_details: { cached_tokens: 'invalid' } },
    ],
    [
      'prompt_tokens_details.audio_tokens',
      { prompt_tokens_details: { audio_tokens: 'invalid' } },
    ],
    [
      'prompt_tokens_details.messages',
      { prompt_tokens_details: { messages: 'invalid' } },
    ],
    [
      'prompt_token_details.cached_tokens',
      { prompt_token_details: { cached_tokens: 'invalid' } },
    ],
    [
      'prompt_token_details.audio_tokens',
      { prompt_token_details: { audio_tokens: 'invalid' } },
    ],
    [
      'prompt_token_details.messages',
      { prompt_token_details: { messages: 'invalid' } },
    ],
    [
      'completion_tokens_details.reasoning_tokens',
      { completion_tokens_details: { reasoning_tokens: 'invalid' } },
    ],
  ])('known field %s', (_field, invalidUsagePart) => {
    it('rejects an invalid value', async () => {
      prepareNormalResponse({
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 12,
        ...invalidUsagePart,
      });

      await expect(generateUsage()).rejects.toThrow();
    });
  });
});
