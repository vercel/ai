import { jsonSchema } from '@ai-sdk/provider-utils';
import {
  convertAsyncIterableToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { streamText } from '../generate-text';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { tool } from '../tool/tool';
import { simulateStreamingMiddleware } from './simulate-streaming-middleware';

const DEFAULT_SETTINGs = {
  prompt: 'Test prompt',
  experimental_generateMessageId: mockId({ prefix: 'msg' }),
  _internal: {
    generateId: mockId({ prefix: 'id' }),
    currentDate: () => new Date('2025-01-01'),
  },
};

const testUsage = {
  inputTokens: 5,
  outputTokens: 10,
  totalTokens: 18,
  reasoningTokens: 3,
  cachedInputTokens: undefined,
};

describe('simulateStreamingMiddleware', () => {
  it('should simulate streaming with text response', async () => {
    const mockModel = new MockLanguageModelV2({
      async doGenerate() {
        return {
          content: [{ type: 'text', text: 'This is a test response' }],
          finishReason: 'stop',
          usage: testUsage,
          warnings: [],
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
          content: [
            {
              type: 'reasoning',
              reasoningType: 'text',
              text: 'This is the reasoning process',
            },
            { type: 'text', text: 'This is a test response' },
          ],
          finishReason: 'stop',
          usage: testUsage,
          warnings: [],
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
          content: [
            { type: 'text', text: 'This is a test response' },
            {
              type: 'reasoning',
              text: 'First reasoning step',
            },
            {
              type: 'reasoning',
              text: 'Second reasoning step',
            },
            {
              type: 'reasoning',
              text: '',
              providerMetadata: {
                testProvider: {
                  signature: 'abc',
                },
              },
            },
          ],
          finishReason: 'stop',
          usage: testUsage,
          warnings: [],
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
          content: [
            {
              type: 'reasoning',
              text: 'First reasoning step',
            },
            {
              type: 'reasoning',
              text: 'data',
              providerMetadata: {
                testProvider: { isRedacted: true },
              },
            },
            {
              type: 'text',
              text: 'This is a test response',
            },
          ],
          finishReason: 'stop',
          usage: testUsage,
          warnings: [],
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

    expect(await convertAsyncIterableToArray(result.fullStream))
      .toMatchInlineSnapshot(`
        [
          {
            "type": "start",
          },
          {
            "request": {},
            "type": "start-step",
            "warnings": [],
          },
          {
            "text": "First reasoning step",
            "type": "reasoning",
          },
          {
            "providerMetadata": {
              "testProvider": {
                "isRedacted": true,
              },
            },
            "text": "data",
            "type": "reasoning",
          },
          {
            "text": "This is a test response",
            "type": "text",
          },
          {
            "finishReason": "stop",
            "providerMetadata": undefined,
            "response": {
              "headers": undefined,
              "id": "id-3",
              "modelId": "mock-model-id",
              "timestamp": 2025-01-01T00:00:00.000Z,
            },
            "type": "finish-step",
            "usage": {
              "cachedInputTokens": undefined,
              "inputTokens": 5,
              "outputTokens": 10,
              "reasoningTokens": 3,
              "totalTokens": 18,
            },
          },
          {
            "finishReason": "stop",
            "totalUsage": {
              "cachedInputTokens": undefined,
              "inputTokens": 5,
              "outputTokens": 10,
              "reasoningTokens": 3,
              "totalTokens": 18,
            },
            "type": "finish",
          },
        ]
      `);
  });

  it('should simulate streaming with tool calls', async () => {
    const mockModel = new MockLanguageModelV2({
      async doGenerate() {
        return {
          content: [
            {
              type: 'text',
              text: 'This is a test response',
            },
            {
              type: 'tool-call',
              toolCallId: 'tool-1',
              toolName: 'calculator',
              input: '{"expression": "2+2"}',
              toolCallType: 'function',
            },
            {
              type: 'tool-call',
              toolCallId: 'tool-2',
              toolName: 'weather',
              input: '{"location": "New York"}',
              toolCallType: 'function',
            },
          ],
          finishReason: 'tool-calls',
          usage: testUsage,
          warnings: [],
        };
      },
    });

    const result = streamText({
      model: wrapLanguageModel({
        model: mockModel,
        middleware: simulateStreamingMiddleware(),
      }),
      tools: {
        calculator: tool({
          inputSchema: jsonSchema<{ expression: string }>({
            type: 'object',
          }),
        }),
        weather: tool({
          inputSchema: jsonSchema<{ location: string }>({
            type: 'object',
          }),
        }),
      },
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
          content: [{ type: 'text', text: 'This is a test response' }],
          finishReason: 'stop',
          usage: testUsage,
          providerMetadata: { custom: { key: 'value' } },
          warnings: [],
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
          content: [{ type: 'text', text: '' }],
          finishReason: 'stop',
          usage: testUsage,
          warnings: [],
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
          content: [{ type: 'text', text: 'This is a test response' }],
          finishReason: 'stop',
          usage: testUsage,
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
