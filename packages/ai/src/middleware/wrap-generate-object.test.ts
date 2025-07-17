import { LanguageModelV2 } from '@ai-sdk/provider';
import { z } from 'zod/v4';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { wrapGenerateObject } from './wrap-generate-object';

const dummyResponseValues = {
  finishReason: 'stop' as const,
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    reasoningTokens: undefined,
    cachedInputTokens: undefined,
  },
  response: { id: 'id-1', timestamp: new Date(123), modelId: 'm-1' },
  warnings: [],
};

describe('wrapGenerateObject', () => {
  it('should create a working middleware wrapper', async () => {
    const model = new MockLanguageModelV2({
      doGenerate: {
        ...dummyResponseValues,
        content: [{ type: 'text', text: '{ "content": "Hello, world!" }' }],
      },
    });

    const wrappedGenerateObject = wrapGenerateObject<{
      model: LanguageModelV2;
      hot?: boolean;
    }>({
      middleware: ({ options, doGenerateObject }) => {
        const { hot, ...baseOptions } = options;
        let temperature = baseOptions.temperature;
        if (hot) {
          temperature = Number.POSITIVE_INFINITY;
        }
        return doGenerateObject({ ...baseOptions, temperature });
      },
    });

    const result = await wrappedGenerateObject({
      model,
      schema: z.object({ content: z.string() }),
      prompt: 'prompt',
      hot: true,
    });

    expect(result.object).toMatchInlineSnapshot(`
      {
        "content": "Hello, world!",
      }
    `);
    expect(model.doGenerateCalls[0].temperature).toBe(Number.POSITIVE_INFINITY);
  });
});
