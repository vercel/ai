import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import type { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
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

const fireworks = createFireworks({ apiKey: 'test-key' });

describe('Fireworks chat reasoning', () => {
  it.each([
    ['accounts/fireworks/models/gpt-oss-120b', 'none', 'minimal'],
    ['accounts/fireworks/models/glm-5p3', 'none', 'minimal'],
    ['accounts/fireworks/models/nemotron-3-ultra-nvfp4', 'minimal', 'low'],
  ] as const)(
    'should map unsupported reasoning for %s from "%s" to "%s" with a warning in doGenerate',
    async (modelId, reasoning, effort) => {
      prepareJsonResponse();

      const result = await fireworks
        .chatModel(modelId)
        .doGenerate({ prompt, reasoning });

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

  it('should return the compatibility warning in stream-start', async () => {
    server.urls[url].response = {
      type: 'stream-chunks',
      chunks: [
        'data: {"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ],
    };

    const { stream } = await fireworks
      .chatModel('accounts/fireworks/models/gpt-oss-120b')
      .doStream({ prompt, reasoning: 'none', topK: 1 });
    const parts = await convertReadableStreamToArray(stream);

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      reasoning_effort: 'minimal',
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
            'reasoning "none" is not directly supported by this model. mapped to effort "minimal".',
        },
      ],
    });
  });

  it.each([
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ] as const)('should send "%s" directly without warnings', async reasoning => {
    prepareJsonResponse();

    const result = await model.doGenerate({ prompt, reasoning });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      reasoning_effort: reasoning,
    });
    expect(result.warnings).toEqual([]);
  });

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

  it.each([
    ['accounts/fireworks/models/kimi-k3', 'max'],
    ['accounts/fireworks/models/nemotron-3-ultra-nvfp4', 'minimal'],
  ] as const)(
    'should send provider reasoning effort for %s unchanged as "%s"',
    async (modelId, reasoningEffort) => {
      prepareJsonResponse();

      const result = await fireworks.chatModel(modelId).doGenerate({
        prompt,
        providerOptions: { fireworks: { reasoningEffort } },
      });

      expect(await server.calls[0].requestBodyJson).toMatchObject({
        reasoning_effort: reasoningEffort,
      });
      expect(result.warnings).toEqual([]);
    },
  );
});

describe('Fireworks chat prepareRequest', () => {
  const chatModel = fireworks.chatModel(
    'accounts/fireworks/models/gpt-oss-120b',
  ) as OpenAICompatibleChatLanguageModel;

  it('should apply the Fireworks request body transform', async () => {
    const { body } = await chatModel.prepareRequest({
      prompt,
      providerOptions: {
        fireworks: {
          promptCacheKey: 'cache-key',
          serviceTier: 'priority',
          thinking: { type: 'enabled', budgetTokens: 1024 },
          reasoningHistory: 'interleaved',
        },
      },
    });

    expect(body).toMatchObject({
      prompt_cache_key: 'cache-key',
      service_tier: 'priority',
      thinking: { type: 'enabled', budget_tokens: 1024 },
      reasoning_history: 'interleaved',
    });
    expect(body).not.toHaveProperty('promptCacheKey');
    expect(body).not.toHaveProperty('serviceTier');
    expect(body).not.toHaveProperty('reasoningHistory');
    expect(server.calls).toHaveLength(0);
  });

  it('should map reasoning with the compatibility warning', async () => {
    const { body, warnings } = await chatModel.prepareRequest({
      prompt,
      reasoning: 'none',
    });

    expect(body.reasoning_effort).toBe('minimal');
    expect(warnings).toEqual([
      {
        type: 'compatibility',
        feature: 'reasoning',
        details:
          'reasoning "none" is not directly supported by this model. mapped to effort "minimal".',
      },
    ]);
    expect(server.calls).toHaveLength(0);
  });
});
