import { LanguageModelV4Usage } from '@ai-sdk/provider';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { generateText, streamText } from '../generate-text';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { extractReasoningMiddleware } from './extract-reasoning-middleware';

const testUsage: LanguageModelV4Usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: 3,
  },
};

describe('extractReasoningMiddleware', () => {
  describe('wrapGenerate', () => {
    it('should extract reasoning from <think> tags', async () => {
      const mockModel = new MockLanguageModelV4({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '<think>analyzing the request</think>Here is the response',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
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

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "analyzing the request",
            "type": "reasoning",
          },
          {
            "text": "Here is the response",
            "type": "text",
          },
        ]
      `);
    });

    it('should extract reasoning from <think> tags when there is no text', async () => {
      const mockModel = new MockLanguageModelV4({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '<think>analyzing the request\n</think>',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
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

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "analyzing the request
        ",
            "type": "reasoning",
          },
          {
            "text": "",
            "type": "text",
          },
        ]
      `);
    });

    it('should extract reasoning from multiple <think> tags', async () => {
      const mockModel = new MockLanguageModelV4({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '<think>analyzing the request</think>Here is the response<think>thinking about the response</think>more',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
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

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "analyzing the request
        thinking about the response",
            "type": "reasoning",
          },
          {
            "text": "Here is the response
        more",
            "type": "text",
          },
        ]
      `);
    });

    it('should prepend <think> tag IFF startWithReasoning is true', async () => {
      const mockModel = new MockLanguageModelV4({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: 'analyzing the request</think>Here is the response',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
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

      expect(resultTrue.content).toMatchInlineSnapshot(`
        [
          {
            "text": "analyzing the request",
            "type": "reasoning",
          },
          {
            "text": "Here is the response",
            "type": "text",
          },
        ]
      `);

      expect(resultFalse.content).toMatchInlineSnapshot(`
        [
          {
            "text": "analyzing the request</think>Here is the response",
            "type": "text",
          },
        ]
      `);
    });

    it('should preserve reasoning property even when rest contains other properties', async () => {
      const mockModel = new MockLanguageModelV4({
        async doGenerate() {
          return {
            content: [
              {
                type: 'text',
                text: '<think>analyzing the request</think>Here is the response',
              },
            ],
            finishReason: { unified: 'stop', raw: 'stop' },
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

      expect(result.content).toMatchInlineSnapshot(`
        [
          {
            "text": "analyzing the request",
            "type": "reasoning",
          },
          {
            "text": "Here is the response",
            "type": "text",
          },
        ]
      `);
    });
  });

  describe('wrapStream', () => {
    it('should extract reasoning from split <think> tags', async () => {
      const mockModel = new MockLanguageModelV4({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: '<think>' },
              { type: 'text-delta', id: '1', delta: 'ana' },
              { type: 'text-delta', id: '1', delta: 'lyzing the request' },
              { type: 'text-delta', id: '1', delta: '</think>' },
              { type: 'text-delta', id: '1', delta: 'Here' },
              { type: 'text-delta', id: '1', delta: ' is the response' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
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
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "reasoning-0",
              "type": "reasoning-start",
            },
            {
              "id": "reasoning-0",
              "providerMetadata": undefined,
              "text": "ana",
              "type": "reasoning-delta",
            },
            {
              "id": "reasoning-0",
              "providerMetadata": undefined,
              "text": "lyzing the request",
              "type": "reasoning-delta",
            },
            {
              "id": "reasoning-0",
              "type": "reasoning-end",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "Here",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": " is the response",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "rawFinishReason": "stop",
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "raw": undefined,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
            },
            {
              "finishReason": "stop",
              "rawFinishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
              "type": "finish",
            },
          ]
        `);
    });

    it('should extract reasoning from single chunk with multiple <think> tags', async () => {
      const mockModel = new MockLanguageModelV4({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-start', id: '1' },
              {
                type: 'text-delta',
                id: '1',
                delta:
                  '<think>analyzing the request</think>Here is the response<think>thinking about the response</think>more',
              },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
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
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "reasoning-0",
              "type": "reasoning-start",
            },
            {
              "id": "reasoning-0",
              "providerMetadata": undefined,
              "text": "analyzing the request",
              "type": "reasoning-delta",
            },
            {
              "id": "reasoning-0",
              "type": "reasoning-end",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "Here is the response",
              "type": "text-delta",
            },
            {
              "id": "reasoning-1",
              "type": "reasoning-start",
            },
            {
              "id": "reasoning-1",
              "providerMetadata": undefined,
              "text": "
          thinking about the response",
              "type": "reasoning-delta",
            },
            {
              "id": "reasoning-1",
              "type": "reasoning-end",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "
          more",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "rawFinishReason": "stop",
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "raw": undefined,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
            },
            {
              "finishReason": "stop",
              "rawFinishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
              "type": "finish",
            },
          ]
        `);
    });

    it('should extract reasoning from <think> when there is no text', async () => {
      const mockModel = new MockLanguageModelV4({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: '<think>' },
              { type: 'text-delta', id: '1', delta: 'ana' },
              { type: 'text-delta', id: '1', delta: 'lyzing the request\n' },
              { type: 'text-delta', id: '1', delta: '</think>' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
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
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "reasoning-0",
              "type": "reasoning-start",
            },
            {
              "id": "reasoning-0",
              "providerMetadata": undefined,
              "text": "ana",
              "type": "reasoning-delta",
            },
            {
              "id": "reasoning-0",
              "providerMetadata": undefined,
              "text": "lyzing the request
          ",
              "type": "reasoning-delta",
            },
            {
              "id": "reasoning-0",
              "type": "reasoning-end",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "rawFinishReason": "stop",
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "raw": undefined,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
            },
            {
              "finishReason": "stop",
              "rawFinishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
              "type": "finish",
            },
          ]
        `);
    });

    it('should prepend <think> tag if startWithReasoning is true', async () => {
      const mockModel = new MockLanguageModelV4({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'ana' },
              { type: 'text-delta', id: '1', delta: 'lyzing the request\n' },
              { type: 'text-delta', id: '1', delta: '</think>' },
              { type: 'text-delta', id: '1', delta: 'this is the response' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
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
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "reasoning-0",
              "type": "reasoning-start",
            },
            {
              "id": "reasoning-0",
              "providerMetadata": undefined,
              "text": "ana",
              "type": "reasoning-delta",
            },
            {
              "id": "reasoning-0",
              "providerMetadata": undefined,
              "text": "lyzing the request
          ",
              "type": "reasoning-delta",
            },
            {
              "id": "reasoning-0",
              "type": "reasoning-end",
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "this is the response",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "rawFinishReason": "stop",
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "raw": undefined,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
            },
            {
              "finishReason": "stop",
              "rawFinishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
              "type": "finish",
            },
          ]
        `);

      expect(await convertAsyncIterableToArray(resultFalse.fullStream))
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
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "ana",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "lyzing the request
          ",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "</think>",
              "type": "text-delta",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "this is the response",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "rawFinishReason": "stop",
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "raw": undefined,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
            },
            {
              "finishReason": "stop",
              "rawFinishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
              "type": "finish",
            },
          ]
        `);
    });

    it('should keep original text when <think> tag is not present', async () => {
      const mockModel = new MockLanguageModelV4({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: 'this is the response' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
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
              "type": "start",
            },
            {
              "request": {},
              "type": "start-step",
              "warnings": [],
            },
            {
              "id": "1",
              "type": "text-start",
            },
            {
              "id": "1",
              "providerMetadata": undefined,
              "text": "this is the response",
              "type": "text-delta",
            },
            {
              "id": "1",
              "type": "text-end",
            },
            {
              "finishReason": "stop",
              "providerMetadata": undefined,
              "rawFinishReason": "stop",
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish-step",
              "usage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "raw": undefined,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
            },
            {
              "finishReason": "stop",
              "rawFinishReason": "stop",
              "totalUsage": {
                "cachedInputTokens": 0,
                "inputTokenDetails": {
                  "cacheReadTokens": 0,
                  "cacheWriteTokens": 0,
                  "noCacheTokens": 5,
                },
                "inputTokens": 5,
                "outputTokenDetails": {
                  "reasoningTokens": 3,
                  "textTokens": 10,
                },
                "outputTokens": 10,
                "reasoningTokens": 3,
                "totalTokens": 15,
              },
              "type": "finish",
            },
          ]
        `);
    });

    it('should handle empty <think></think> tags without crashing', async () => {
      const mockModel = new MockLanguageModelV4({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-start', id: '1' },
              { type: 'text-delta', id: '1', delta: '<think></think>' },
              { type: 'text-delta', id: '1', delta: ' This is the answer.' },
              { type: 'text-end', id: '1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'stop' },
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
        prompt: 'Test prompt',
      });

      const fullStream = await convertAsyncIterableToArray(result.fullStream);

      // Find the reasoning events
      const reasoningStartIndex = fullStream.findIndex(
        part => part.type === 'reasoning-start' && part.id === 'reasoning-0',
      );
      const reasoningEndIndex = fullStream.findIndex(
        part => part.type === 'reasoning-end' && part.id === 'reasoning-0',
      );

      // Verify both events exist and are in the correct order
      expect(reasoningStartIndex).toBeGreaterThanOrEqual(0);
      expect(reasoningEndIndex).toBeGreaterThanOrEqual(0);
      expect(reasoningEndIndex).toBeGreaterThan(reasoningStartIndex);
    });
  });

  describe('custom openingTag / closingTag (e.g. Gemma 4)', () => {
    const gemmaMiddleware = extractReasoningMiddleware({
      tagName: { opening: '<|channel>thought\n', closing: '<channel|>' },
    });

    describe('wrapGenerate', () => {
      it('should extract reasoning using custom tags', async () => {
        const mockModel = new MockLanguageModelV4({
          async doGenerate() {
            return {
              content: [
                {
                  type: 'text',
                  text: '<|channel>thought\nanalyzing the request<channel|>Here is the response',
                },
              ],
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
              warnings: [],
            };
          },
        });

        const result = await generateText({
          model: wrapLanguageModel({
            model: mockModel,
            middleware: gemmaMiddleware,
          }),
          prompt: 'Hello',
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "analyzing the request",
              "type": "reasoning",
            },
            {
              "text": "Here is the response",
              "type": "text",
            },
          ]
        `);
      });

      it('should handle empty reasoning block (thinking disabled)', async () => {
        const mockModel = new MockLanguageModelV4({
          async doGenerate() {
            return {
              content: [
                {
                  type: 'text',
                  text: '<|channel>thought\n<channel|>Final answer',
                },
              ],
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: testUsage,
              warnings: [],
            };
          },
        });

        const result = await generateText({
          model: wrapLanguageModel({
            model: mockModel,
            middleware: gemmaMiddleware,
          }),
          prompt: 'Hello',
        });

        expect(result.content).toMatchInlineSnapshot(`
          [
            {
              "text": "",
              "type": "reasoning",
            },
            {
              "text": "Final answer",
              "type": "text",
            },
          ]
        `);
      });
    });

    describe('wrapStream', () => {
      it('should extract reasoning using custom tags in a stream', async () => {
        const mockModel = new MockLanguageModelV4({
          async doStream() {
            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: '<|channel>thought\n' },
                { type: 'text-delta', id: '1', delta: 'analyzing' },
                { type: 'text-delta', id: '1', delta: ' the request' },
                { type: 'text-delta', id: '1', delta: '<channel|>' },
                { type: 'text-delta', id: '1', delta: 'Here is the response' },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: testUsage,
                },
              ]),
            };
          },
        });

        const result = streamText({
          model: wrapLanguageModel({
            model: mockModel,
            middleware: gemmaMiddleware,
          }),
          prompt: 'Hello',
        });

        const parts = await convertAsyncIterableToArray(result.fullStream);
        const types = parts.map(p => p.type);

        expect(types).toContain('reasoning-start');
        expect(types).toContain('reasoning-delta');
        expect(types).toContain('reasoning-end');
        expect(types).toContain('text-delta');

        const reasoningDeltas = parts
          .filter(p => p.type === 'reasoning-delta')
          .map(p => (p as { type: 'reasoning-delta'; text: string }).text)
          .join('');
        expect(reasoningDeltas).toBe('analyzing the request');

        const textDeltas = parts
          .filter(p => p.type === 'text-delta')
          .map(p => (p as { type: 'text-delta'; text: string }).text)
          .join('');
        expect(textDeltas).toBe('Here is the response');
      });

      it('should handle empty reasoning block in stream (thinking disabled)', async () => {
        const mockModel = new MockLanguageModelV4({
          async doStream() {
            return {
              stream: convertArrayToReadableStream([
                {
                  type: 'response-metadata',
                  id: 'id-0',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                { type: 'text-start', id: '1' },
                { type: 'text-delta', id: '1', delta: '<|channel>thought\n' },
                { type: 'text-delta', id: '1', delta: '<channel|>' },
                { type: 'text-delta', id: '1', delta: 'Final answer' },
                { type: 'text-end', id: '1' },
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: testUsage,
                },
              ]),
            };
          },
        });

        const result = streamText({
          model: wrapLanguageModel({
            model: mockModel,
            middleware: gemmaMiddleware,
          }),
          prompt: 'Hello',
        });

        const parts = await convertAsyncIterableToArray(result.fullStream);
        const types = parts.map(p => p.type);

        expect(types).toContain('reasoning-start');
        expect(types).toContain('reasoning-end');

        const textDeltas = parts
          .filter(p => p.type === 'text-delta')
          .map(p => (p as { type: 'text-delta'; text: string }).text)
          .join('');
        expect(textDeltas).toBe('Final answer');
      });
    });
  });
});
