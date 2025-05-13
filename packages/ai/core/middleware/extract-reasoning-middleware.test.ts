import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { generateText, streamText } from '../generate-text';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { extractReasoningMiddleware } from './extract-reasoning-middleware';

const testUsage = {
  inputTokens: 5,
  outputTokens: 10,
  totalTokens: 18,
  reasoningTokens: 3,
  cachedInputTokens: undefined,
};

describe('extractReasoningMiddleware', () => {
  describe('wrapGenerate', () => {
    it('should extract reasoning from <think> tags', async () => {
      const mockModel = new MockLanguageModelV2({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '<think>analyzing the request</think>Here is the response',
              },
            ],
            finishReason: 'stop',
            usage: testUsage,
            warnings: [],
          };
        },
      });

      const result = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        prompt: 'Hello, how can I help?',
      });

      expect(result.reasoningText).toStrictEqual('analyzing the request');
      expect(result.text).toStrictEqual('Here is the response');
    });

    it('should extract reasoning from <think> tags when there is no text', async () => {
      const mockModel = new MockLanguageModelV2({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '<think>analyzing the request\n</think>',
              },
            ],
            finishReason: 'stop',
            usage: testUsage,
            warnings: [],
          };
        },
      });

      const result = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        prompt: 'Hello, how can I help?',
      });

      expect(result.reasoningText).toStrictEqual('analyzing the request\n');
      expect(result.text).toStrictEqual('');
    });

    it('should extract reasoning from multiple <think> tags', async () => {
      const mockModel = new MockLanguageModelV2({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '<think>analyzing the request</think>Here is the response<think>thinking about the response</think>more',
              },
            ],
            finishReason: 'stop',
            usage: testUsage,
            warnings: [],
          };
        },
      });

      const result = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        prompt: 'Hello, how can I help?',
      });

      expect(result.reasoningText).toStrictEqual(
        'analyzing the request\nthinking about the response',
      );
      expect(result.text).toStrictEqual('Here is the response\nmore');
    });

    it('should prepend <think> tag IFF startWithReasoning is true', async () => {
      const mockModel = new MockLanguageModelV2({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: 'analyzing the request</think>Here is the response',
              },
            ],
            finishReason: 'stop',
            usage: testUsage,
            warnings: [],
          };
        },
      });

      const resultTrue = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({
            tagName: 'think',
            startWithReasoning: true,
          }),
        }),
        prompt: 'Hello, how can I help?',
      });

      const resultFalse = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({
            tagName: 'think',
          }),
        }),
        prompt: 'Hello, how can I help?',
      });

      expect(resultTrue.reasoningText).toStrictEqual('analyzing the request');
      expect(resultTrue.text).toStrictEqual('Here is the response');
      expect(resultFalse.reasoningText).toBeUndefined();
      expect(resultFalse.text).toStrictEqual(
        'analyzing the request</think>Here is the response',
      );
    });

    it('should preserve reasoning property even when rest contains other properties', async () => {
      const mockModel = new MockLanguageModelV2({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '<think>analyzing the request</think>Here is the response',
              },
            ],
            finishReason: 'stop',
            usage: testUsage,
            reasoning: undefined,
            warnings: [],
          };
        },
      });

      const result = await generateText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        prompt: 'Hello, how can I help?',
      });

      expect(result.reasoningText).toStrictEqual('analyzing the request');
      expect(result.text).toStrictEqual('Here is the response');
    });
  });

  describe('wrapStream', () => {
    it('should extract reasoning from split <think> tags', async () => {
      const mockModel = new MockLanguageModelV2({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text', text: '<think>' },
              { type: 'text', text: 'ana' },
              { type: 'text', text: 'lyzing the request' },
              { type: 'text', text: '</think>' },
              { type: 'text', text: 'Here' },
              { type: 'text', text: ' is the response' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          };
        },
      });

      const result = streamText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        prompt: 'Hello, how can I help?',
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "text": "ana",
              "type": "reasoning",
            },
            {
              "text": "lyzing the request",
              "type": "reasoning",
            },
            {
              "type": "reasoning-part-finish",
            },
            {
              "text": "Here",
              "type": "text",
            },
            {
              "text": " is the response",
              "type": "text",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
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

    it('should extract reasoning from single chunk with multiple <think> tags', async () => {
      const mockModel = new MockLanguageModelV2({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              {
                type: 'text',
                text: '<think>analyzing the request</think>Here is the response<think>thinking about the response</think>more',
              },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          };
        },
      });

      const result = streamText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        prompt: 'Hello, how can I help?',
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "text": "analyzing the request",
              "type": "reasoning",
            },
            {
              "type": "reasoning-part-finish",
            },
            {
              "text": "Here is the response",
              "type": "text",
            },
            {
              "text": "
          thinking about the response",
              "type": "reasoning",
            },
            {
              "type": "reasoning-part-finish",
            },
            {
              "text": "
          more",
              "type": "text",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
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

    it('should extract reasoning from <think> when there is no text', async () => {
      const mockModel = new MockLanguageModelV2({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text', text: '<think>' },
              { type: 'text', text: 'ana' },
              { type: 'text', text: 'lyzing the request\n' },
              { type: 'text', text: '</think>' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          };
        },
      });

      const result = streamText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        prompt: 'Hello, how can I help?',
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "text": "ana",
              "type": "reasoning",
            },
            {
              "text": "lyzing the request
          ",
              "type": "reasoning",
            },
            {
              "type": "reasoning-part-finish",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
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

    it('should prepend <think> tag IFF startWithReasoning is true', async () => {
      const mockModel = new MockLanguageModelV2({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text', text: 'ana' },
              { type: 'text', text: 'lyzing the request\n' },
              { type: 'text', text: '</think>' },
              { type: 'text', text: 'this is the response' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: testUsage,
              },
            ]),
          };
        },
      });

      const resultTrue = streamText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({
            tagName: 'think',
            startWithReasoning: true,
          }),
        }),
        prompt: 'Hello, how can I help?',
      });

      const resultFalse = streamText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        prompt: 'Hello, how can I help?',
      });

      expect(await convertAsyncIterableToArray(resultTrue.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "text": "ana",
              "type": "reasoning",
            },
            {
              "text": "lyzing the request
          ",
              "type": "reasoning",
            },
            {
              "type": "reasoning-part-finish",
            },
            {
              "text": "this is the response",
              "type": "text",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
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

      expect(await convertAsyncIterableToArray(resultFalse.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "text": "ana",
              "type": "text",
            },
            {
              "text": "lyzing the request
          ",
              "type": "text",
            },
            {
              "text": "</think>",
              "type": "text",
            },
            {
              "text": "this is the response",
              "type": "text",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
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
  });
});
