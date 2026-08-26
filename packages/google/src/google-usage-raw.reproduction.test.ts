import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGoogle } from './google-provider';

vi.mock('./version', () => ({
  VERSION: '0.0.0-test',
}));

const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const normalLiveResponse = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/google-usage-raw-live.json', import.meta.url),
    'utf8',
  ),
) as { usageMetadata: Record<string, unknown> };

const streamLiveResponse = readFileSync(
  new URL('./__fixtures__/google-usage-raw-live.chunks.txt', import.meta.url),
  'utf8',
);

const streamLiveUsage = JSON.parse(
  streamLiveResponse.trim().slice('data: '.length),
) as { usageMetadata: Record<string, unknown> };

const completeUsageMetadata = {
  promptTokenCount: 12,
  cachedContentTokenCount: 4,
  candidatesTokenCount: 71,
  toolUsePromptTokenCount: 65,
  thoughtsTokenCount: 89,
  totalTokenCount: 237,
  promptTokensDetails: [
    { modality: 'TEXT', tokenCount: 12, nestedSentinel: 'prompt' },
  ],
  cacheTokensDetails: [
    { modality: 'TEXT', tokenCount: 4, nestedSentinel: 'cache' },
  ],
  candidatesTokensDetails: [
    { modality: 'TEXT', tokenCount: 71, nestedSentinel: 'candidate' },
  ],
  toolUsePromptTokensDetails: [
    { modality: 'TEXT', tokenCount: 65, nestedSentinel: 'tool' },
  ],
  serviceTier: 'standard',
  topLevelSentinel: 'preserve-me',
};

function createModel(fetch: typeof globalThis.fetch) {
  return createGoogle({
    apiKey: 'test-api-key',
    fetch,
  }).languageModel('gemini-2.5-flash');
}

describe('Google usage.raw preservation reproduction', () => {
  it('preserves the complete live normal usageMetadata object', async () => {
    const model = createModel(async () =>
      Response.json(normalLiveResponse, {
        status: 200,
      }),
    );

    const result = await model.doGenerate({ prompt });

    expect(result.usage.raw).toEqual(normalLiveResponse.usageMetadata);
    expect(result.usage).toMatchObject({
      inputTokens: {
        total: 12,
        noCache: 12,
        cacheRead: 0,
      },
      outputTokens: {
        total: 142,
        text: 60,
        reasoning: 82,
      },
    });
  });

  it('preserves the complete live final streaming usageMetadata object', async () => {
    const model = createModel(async () => {
      return new Response(streamLiveResponse, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });

    const { stream } = await model.doStream({ prompt });
    const events = await convertReadableStreamToArray(stream);
    const finish = events.find(event => event.type === 'finish');

    expect(finish?.usage.raw).toEqual(streamLiveUsage.usageMetadata);
    expect(finish?.usage).toMatchObject({
      inputTokens: {
        total: 12,
        noCache: 8,
        cacheRead: 4,
      },
      outputTokens: {
        total: 160,
        text: 71,
        reasoning: 89,
      },
    });
  });

  it.each(['normal', 'streaming'] as const)(
    'preserves all documented fields and unknown usage properties on the %s path',
    async path => {
      const model = createModel(async () => {
        if (path === 'normal') {
          return Response.json({ usageMetadata: completeUsageMetadata });
        }

        return new Response(
          `data: ${JSON.stringify({
            usageMetadata: {
              promptTokenCount: 1,
              candidatesTokenCount: 1,
              totalTokenCount: 2,
            },
          })}\n\ndata: ${JSON.stringify({
            usageMetadata: completeUsageMetadata,
          })}\n\n`,
          {
            headers: { 'content-type': 'text/event-stream' },
          },
        );
      });

      const raw =
        path === 'normal'
          ? (await model.doGenerate({ prompt })).usage.raw
          : (
              await convertReadableStreamToArray(
                (
                  await model.doStream({ prompt })
                ).stream,
              )
            ).find(event => event.type === 'finish')?.usage.raw;

      expect(raw).toEqual(completeUsageMetadata);
    },
  );

  it.each([
    {
      toolUsePromptTokenCount: '65',
    },
    {
      cacheTokensDetails: [{ modality: 'TEXT', tokenCount: '4' }],
    },
    {
      toolUsePromptTokensDetails: [{ modality: 1, tokenCount: 65 }],
    },
  ])('rejects invalid documented usage values: %j', async invalidUsage => {
    const model = createModel(async () =>
      Response.json({
        usageMetadata: {
          promptTokenCount: 12,
          ...invalidUsage,
        },
      }),
    );

    await expect(model.doGenerate({ prompt })).rejects.toThrow();
  });
});
