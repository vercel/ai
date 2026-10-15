import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createFireworks } from './fireworks-provider';

const model = createFireworks({ apiKey: 'test-key' }).chatModel('test-model');
const prompt: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];
const url = 'https://api.fireworks.ai/inference/v1/chat/completions';
const server = createTestServer({ [url]: {} });

function prepareJsonResponse() {
  server.urls[url].response = {
    type: 'json-value',
    body: {
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  };
}

describe('Fireworks chat reasoning', () => {
  it.each([
    ['minimal', 'low'],
    ['xhigh', 'high'],
    ['max', 'high'],
  ] as const)(
    'should coerce "%s" to "%s" with a warning in doGenerate',
    async (reasoning, effort) => {
      prepareJsonResponse();

      const result = await model.doGenerate({ prompt, reasoning });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        reasoning_effort: effort,
      });
      expect(result.warnings).toEqual([
        {
          type: 'compatibility',
          feature: 'reasoning',
          details: `reasoning "${reasoning}" is not directly supported by this model. mapped to effort "${effort}".`,
        },
      ]);
    },
  );

  it('should return the max compatibility warning in stream-start', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        'data: {"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ],
    };

    const { stream } = await model.doStream({
      prompt,
      reasoning: 'max',
      topK: 1,
    });
    const parts = await convertReadableStreamToArray(stream);

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      reasoning_effort: 'high',
      stream: true,
    });
    expect(parts[0]).toEqual({
      type: 'stream-start',
      warnings: [
        { type: 'unsupported', feature: 'topK' },
        {
          type: 'compatibility',
          feature: 'reasoning',
          details:
            'reasoning "max" is not directly supported by this model. mapped to effort "high".',
        },
      ],
    });
  });

  it.each(['low', 'medium', 'high'] as const)(
    'should pass through "%s" without warnings',
    async reasoning => {
      prepareJsonResponse();

      const result = await model.doGenerate({ prompt, reasoning });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        reasoning_effort: reasoning,
      });
      expect(result.warnings).toEqual([]);
    },
  );

  it('should honor provider reasoning effort without warning about ignored portable max', async () => {
    prepareJsonResponse();

    const result = await model.doGenerate({
      prompt,
      reasoning: 'max',
      providerOptions: { fireworks: { reasoningEffort: 'medium' } },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      reasoning_effort: 'medium',
    });
    expect(result.warnings).toEqual([]);
  });
});
