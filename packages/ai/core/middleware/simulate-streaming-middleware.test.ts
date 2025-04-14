import {
  convertAsyncIterableToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { streamText } from '../generate-text';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV2 } from '../test/mock-language-model-v1';
import { simulateStreamingMiddleware } from './simulate-streaming-middleware';

const DEFAULT_SETTINGs = {
  prompt: 'Test prompt',
  experimental_generateMessageId: mockId({ prefix: 'msg' }),
  _internal: {
    generateId: mockId({ prefix: 'id' }),
    currentDate: () => new Date('2025-01-01'),
  },
};

describe('simulateStreamingMiddleware', () => {
  it('should simulate streaming with text response', async () => {
    const mockModel = new MockLanguageModelV2({
      async doGenerate() {
        return {
          text: { type: 'text', text: 'This is a test response' },
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    });

    const result = streamText({
      model: wrapLanguageModel({
        model: mockModel,
        middleware: simulateStreamingMiddleware(),
      }),
      ...DEFAULT_SETTINGs,
    });

    expect(
      await convertAsyncIterableToArray(result.fullStream),
    ).toMatchSnapshot();
  });

  it('should simulate streaming with reasoning as string', async () => {
    const mockModel = new MockLanguageModelV2({
      async doGenerate() {
        return {
          text: { type: 'text', text: 'This is a test response' },
          reasoning: [
            {
              type: 'reasoning',
              reasoningType: 'text',
              text: 'This is the reasoning process',
            },
          ],
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    });

    const result = streamText({
      model: wrapLanguageModel({
        model: mockModel,
        middleware: simulateStreamingMiddleware(),
      }),
      ...DEFAULT_SETTINGs,
    });

    expect(
      await convertAsyncIterableToArray(result.fullStream),
    ).toMatchSnapshot();
  });

  it('should simulate streaming with reasoning as array of text objects', async () => {
    const mockModel = new MockLanguageModelV2({
      async doGenerate() {
        return {
          text: { type: 'text', text: 'This is a test response' },
          reasoning: [
            {
              type: 'reasoning',
              reasoningType: 'text',
              text: 'First reasoning step',
            },
            {
              type: 'reasoning',
              reasoningType: 'text',
              text: 'Second reasoning step',
            },
            {
              type: 'reasoning',
              reasoningType: 'signature',
              signature: 'abc',
            },
          ],
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    });

    const result = streamText({
      model: wrapLanguageModel({
        model: mockModel,
        middleware: simulateStreamingMiddleware(),
      }),
      ...DEFAULT_SETTINGs,
    });

    expect(
      await convertAsyncIterableToArray(result.fullStream),
    ).toMatchSnapshot();
  });

  it('should simulate streaming with reasoning as array of mixed objects', async () => {
    const mockModel = new MockLanguageModelV2({
      async doGenerate() {
        return {
          text: { type: 'text', text: 'This is a test response' },
          reasoning: [
            {
              type: 'reasoning',
              reasoningType: 'text',
              text: 'First reasoning step',
            },
            {
              type: 'reasoning',
              reasoningType: 'redacted',
              data: 'data',
            },
          ],
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    });

    const result = streamText({
      model: wrapLanguageModel({
        model: mockModel,
        middleware: simulateStreamingMiddleware(),
      }),
      ...DEFAULT_SETTINGs,
    });

    expect(
      await convertAsyncIterableToArray(result.fullStream),
    ).toMatchSnapshot();
  });

  it('should simulate streaming with tool calls', async () => {
    const mockModel = new MockLanguageModelV2({
      async doGenerate() {
        return {
          text: { type: 'text', text: 'This is a test response' },
          toolCalls: [
            {
              type: 'tool-call',
              toolCallId: 'tool-1',
              toolName: 'calculator',
              args: '{"expression": "2+2"}',
              toolCallType: 'function',
            },
            {
              type: 'tool-call',
              toolCallId: 'tool-2',
              toolName: 'weather',
              args: '{"location": "New York"}',
              toolCallType: 'function',
            },
          ],
          finishReason: 'tool-calls',
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    });

    const result = streamText({
      model: wrapLanguageModel({
        model: mockModel,
        middleware: simulateStreamingMiddleware(),
      }),
      ...DEFAULT_SETTINGs,
    });

    expect(
      await convertAsyncIterableToArray(result.fullStream),
    ).toMatchSnapshot();
  });

  it('should preserve additional metadata in the response', async () => {
    const mockModel = new MockLanguageModelV2({
      async doGenerate() {
        return {
          text: { type: 'text', text: 'This is a test response' },
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 10 },
          providerMetadata: { custom: { key: 'value' } },
        };
      },
    });

    const result = streamText({
      model: wrapLanguageModel({
        model: mockModel,
        middleware: simulateStreamingMiddleware(),
      }),
      ...DEFAULT_SETTINGs,
    });

    expect(
      await convertAsyncIterableToArray(result.fullStream),
    ).toMatchSnapshot();
  });

  it('should handle empty text response', async () => {
    const mockModel = new MockLanguageModelV2({
      async doGenerate() {
        return {
          text: { type: 'text', text: '' },
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 0 },
        };
      },
    });

    const result = streamText({
      model: wrapLanguageModel({
        model: mockModel,
        middleware: simulateStreamingMiddleware(),
      }),
      ...DEFAULT_SETTINGs,
    });

    expect(
      await convertAsyncIterableToArray(result.fullStream),
    ).toMatchSnapshot();
  });

  it('should pass through warnings from the model', async () => {
    const mockModel = new MockLanguageModelV2({
      async doGenerate() {
        return {
          text: { type: 'text', text: 'This is a test response' },
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 10 },
          warnings: [
            { type: 'other', message: 'Test warning', code: 'test_warning' },
          ],
        };
      },
    });

    const result = streamText({
      model: wrapLanguageModel({
        model: mockModel,
        middleware: simulateStreamingMiddleware(),
      }),
      ...DEFAULT_SETTINGs,
    });

    result.consumeStream();

    expect(await result.warnings).toMatchSnapshot();
  });
});
