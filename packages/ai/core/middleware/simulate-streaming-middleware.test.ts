import {
  convertAsyncIterableToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { streamText } from '../generate-text';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
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
    const mockModel = new MockLanguageModelV1({
      async doGenerate() {
        return {
          text: 'This is a test response',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10 },
          rawCall: { rawPrompt: '', rawSettings: {} },
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
    const mockModel = new MockLanguageModelV1({
      async doGenerate() {
        return {
          text: 'This is a test response',
          reasoning: 'This is the reasoning process',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10 },
          rawCall: { rawPrompt: '', rawSettings: {} },
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
    const mockModel = new MockLanguageModelV1({
      async doGenerate() {
        return {
          text: 'This is a test response',
          reasoning: [
            { type: 'text', text: 'First reasoning step' },
            { type: 'text', text: 'Second reasoning step', signature: 'abc' },
          ],
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10 },
          rawCall: { rawPrompt: '', rawSettings: {} },
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
    const mockModel = new MockLanguageModelV1({
      async doGenerate() {
        return {
          text: 'This is a test response',
          reasoning: [
            { type: 'text', text: 'First reasoning step' },
            { type: 'redacted', data: 'data' },
          ],
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10 },
          rawCall: { rawPrompt: '', rawSettings: {} },
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
    const mockModel = new MockLanguageModelV1({
      async doGenerate() {
        return {
          text: 'This is a test response',
          toolCalls: [
            {
              toolCallId: 'tool-1',
              toolName: 'calculator',
              args: '{"expression": "2+2"}',
              toolCallType: 'function',
            },
            {
              toolCallId: 'tool-2',
              toolName: 'weather',
              args: '{"location": "New York"}',
              toolCallType: 'function',
            },
          ],
          finishReason: 'tool-calls',
          usage: { promptTokens: 10, completionTokens: 10 },
          rawCall: { rawPrompt: '', rawSettings: {} },
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
    const mockModel = new MockLanguageModelV1({
      async doGenerate() {
        return {
          text: 'This is a test response',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10 },
          rawCall: { rawPrompt: '', rawSettings: {} },
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
    const mockModel = new MockLanguageModelV1({
      async doGenerate() {
        return {
          text: '',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 0 },
          rawCall: { rawPrompt: '', rawSettings: {} },
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
    const mockModel = new MockLanguageModelV1({
      async doGenerate() {
        return {
          text: 'This is a test response',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 10 },
          rawCall: { rawPrompt: '', rawSettings: {} },
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
