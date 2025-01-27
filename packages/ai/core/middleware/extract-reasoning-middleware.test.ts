import { generateText } from '../generate-text';
import { experimental_wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { extractReasoningMiddleware } from './extract-reasoning-middleware';

describe('extractReasoningMiddleware', () => {
  it('should extract reasoning from <think> tags during generation', async () => {
    const mockModel = new MockLanguageModelV1({
      async doGenerate() {
        return {
          text: '<think>analyzing the request</think>Here is the response',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10 },
          rawCall: {
            rawPrompt: 'Hello, how can I help?',
            rawSettings: {},
          },
        };
      },
    });

    const result = await generateText({
      model: experimental_wrapLanguageModel({
        model: mockModel,
        middleware: extractReasoningMiddleware({ tagName: 'think' }),
      }),
      prompt: 'Hello, how can I help?',
    });

    expect(result.reasoning).toStrictEqual('analyzing the request');
    expect(result.text).toStrictEqual('Here is the response');
  });

  it('should extract multiple reasoning from <think> tags during generation', async () => {
    const mockModel = new MockLanguageModelV1({
      async doGenerate() {
        return {
          text: '<think>analyzing the request</think>Here is the response<think>thinking about the response</think>more',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10 },
          rawCall: {
            rawPrompt: 'Hello, how can I help?',
            rawSettings: {},
          },
        };
      },
    });

    const result = await generateText({
      model: experimental_wrapLanguageModel({
        model: mockModel,
        middleware: extractReasoningMiddleware({ tagName: 'think' }),
      }),
      prompt: 'Hello, how can I help?',
    });

    expect(result.reasoning).toStrictEqual(
      'analyzing the request\nthinking about the response',
    );
    expect(result.text).toStrictEqual('Here is the response\nmore');
  });
});
