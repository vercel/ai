import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { generateText, streamText } from '../generate-text';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV2 } from '../test/mock-language-model-v1';
import { extractReasoningMiddleware } from './extract-reasoning-middleware';

describe('extractReasoningMiddleware', () => {
  describe('wrapGenerate', () => {
    it('should extract reasoning from <think> tags', async () => {
      const mockModel = new MockLanguageModelV2({
        async doGenerate() {
          return {
            text: {
              type: 'text',
              text: '<think>analyzing the request</think>Here is the response',
            },
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 10 },
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

      expect(result.reasoning).toStrictEqual('analyzing the request');
      expect(result.text).toStrictEqual('Here is the response');
    });

    it('should extract reasoning from <think> tags when there is no text', async () => {
      const mockModel = new MockLanguageModelV2({
        async doGenerate() {
          return {
            text: {
              type: 'text',
              text: '<think>analyzing the request\n</think>',
            },
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 10 },
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

      expect(result.reasoning).toStrictEqual('analyzing the request\n');
      expect(result.text).toStrictEqual('');
    });

    it('should extract reasoning from multiple <think> tags', async () => {
      const mockModel = new MockLanguageModelV2({
        async doGenerate() {
          return {
            text: {
              type: 'text',
              text: '<think>analyzing the request</think>Here is the response<think>thinking about the response</think>more',
            },
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 10 },
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

      expect(result.reasoning).toStrictEqual(
        'analyzing the request\nthinking about the response',
      );
      expect(result.text).toStrictEqual('Here is the response\nmore');
    });

    it('should preprend <think> tag IFF startWithReasoning is true', async () => {
      const mockModel = new MockLanguageModelV2({
        async doGenerate() {
          return {
            text: {
              type: 'text',
              text: 'analyzing the request</think>Here is the response',
            },
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 10 },
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

      expect(resultTrue.reasoning).toStrictEqual('analyzing the request');
      expect(resultTrue.text).toStrictEqual('Here is the response');
      expect(resultFalse.reasoning).toBeUndefined();
      expect(resultFalse.text).toStrictEqual(
        'analyzing the request</think>Here is the response',
      );
    });

    it('should preserve reasoning property even when rest contains other properties', async () => {
      const mockModel = new MockLanguageModelV2({
        async doGenerate() {
          return {
            text: {
              type: 'text',
              text: '<think>analyzing the request</think>Here is the response',
            },
            finishReason: 'stop',
            usage: { inputTokens: 10, outputTokens: 10 },
            reasoning: undefined,
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

      expect(result.reasoning).toStrictEqual('analyzing the request');
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
                logprobs: undefined,
                usage: { inputTokens: 3, outputTokens: 10 },
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
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "messageId": "msg-0",
              "request": {},
              "type": "step-start",
              "warnings": [],
            },
            {
              "reasoningType": "text",
              "text": "ana",
              "type": "reasoning",
            },
            {
              "reasoningType": "text",
              "text": "lyzing the request",
              "type": "reasoning",
            },
            {
              "textDelta": "Here",
              "type": "text-delta",
            },
            {
              "textDelta": " is the response",
              "type": "text-delta",
            },
            {
              "finishReason": "stop",
              "isContinued": false,
              "logprobs": undefined,
              "messageId": "msg-0",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "step-finish",
              "usage": {
                "completionTokens": 10,
                "promptTokens": 3,
                "totalTokens": 13,
              },
              "warnings": undefined,
            },
            {
              "finishReason": "stop",
              "logprobs": undefined,
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish",
              "usage": {
                "completionTokens": 10,
                "promptTokens": 3,
                "totalTokens": 13,
              },
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
                logprobs: undefined,
                usage: { inputTokens: 3, outputTokens: 10 },
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
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "messageId": "msg-0",
              "request": {},
              "type": "step-start",
              "warnings": [],
            },
            {
              "reasoningType": "text",
              "text": "analyzing the request",
              "type": "reasoning",
            },
            {
              "textDelta": "Here is the response",
              "type": "text-delta",
            },
            {
              "reasoningType": "text",
              "text": "
          thinking about the response",
              "type": "reasoning",
            },
            {
              "textDelta": "
          more",
              "type": "text-delta",
            },
            {
              "finishReason": "stop",
              "isContinued": false,
              "logprobs": undefined,
              "messageId": "msg-0",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "step-finish",
              "usage": {
                "completionTokens": 10,
                "promptTokens": 3,
                "totalTokens": 13,
              },
              "warnings": undefined,
            },
            {
              "finishReason": "stop",
              "logprobs": undefined,
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish",
              "usage": {
                "completionTokens": 10,
                "promptTokens": 3,
                "totalTokens": 13,
              },
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
                logprobs: undefined,
                usage: { inputTokens: 3, outputTokens: 10 },
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
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(await convertAsyncIterableToArray(result.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "messageId": "msg-0",
              "request": {},
              "type": "step-start",
              "warnings": [],
            },
            {
              "reasoningType": "text",
              "text": "ana",
              "type": "reasoning",
            },
            {
              "reasoningType": "text",
              "text": "lyzing the request
          ",
              "type": "reasoning",
            },
            {
              "finishReason": "stop",
              "isContinued": false,
              "logprobs": undefined,
              "messageId": "msg-0",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "step-finish",
              "usage": {
                "completionTokens": 10,
                "promptTokens": 3,
                "totalTokens": 13,
              },
              "warnings": undefined,
            },
            {
              "finishReason": "stop",
              "logprobs": undefined,
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish",
              "usage": {
                "completionTokens": 10,
                "promptTokens": 3,
                "totalTokens": 13,
              },
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
                logprobs: undefined,
                usage: { inputTokens: 3, outputTokens: 10 },
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
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      const resultFalse = streamText({
        model: wrapLanguageModel({
          model: mockModel,
          middleware: extractReasoningMiddleware({ tagName: 'think' }),
        }),
        prompt: 'Hello, how can I help?',
        experimental_generateMessageId: mockId({ prefix: 'msg' }),
      });

      expect(await convertAsyncIterableToArray(resultTrue.fullStream))
        .toMatchInlineSnapshot(`
          [
            {
              "messageId": "msg-0",
              "request": {},
              "type": "step-start",
              "warnings": [],
            },
            {
              "reasoningType": "text",
              "text": "ana",
              "type": "reasoning",
            },
            {
              "reasoningType": "text",
              "text": "lyzing the request
          ",
              "type": "reasoning",
            },
            {
              "textDelta": "this is the response",
              "type": "text-delta",
            },
            {
              "finishReason": "stop",
              "isContinued": false,
              "logprobs": undefined,
              "messageId": "msg-0",
              "providerMetadata": undefined,
              "request": {},
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "step-finish",
              "usage": {
                "completionTokens": 10,
                "promptTokens": 3,
                "totalTokens": 13,
              },
              "warnings": undefined,
            },
            {
              "finishReason": "stop",
              "logprobs": undefined,
              "providerMetadata": undefined,
              "response": {
                "headers": undefined,
                "id": "id-0",
                "modelId": "mock-model-id",
                "timestamp": 1970-01-01T00:00:00.000Z,
              },
              "type": "finish",
              "usage": {
                "completionTokens": 10,
                "promptTokens": 3,
                "totalTokens": 13,
              },
            },
          ]
        `);

      expect(await convertAsyncIterableToArray(resultFalse.fullStream))
        .toMatchInlineSnapshot(`
        [
          {
            "messageId": "msg-0",
            "request": {},
            "type": "step-start",
            "warnings": [],
          },
          {
            "textDelta": "ana",
            "type": "text-delta",
          },
          {
            "textDelta": "lyzing the request
        ",
            "type": "text-delta",
          },
          {
            "textDelta": "</think>",
            "type": "text-delta",
          },
          {
            "textDelta": "this is the response",
            "type": "text-delta",
          },
          {
            "finishReason": "stop",
            "isContinued": false,
            "logprobs": undefined,
            "messageId": "msg-0",
            "providerMetadata": undefined,
            "request": {},
            "response": {
              "headers": undefined,
              "id": "id-0",
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "type": "step-finish",
            "usage": {
              "completionTokens": 10,
              "promptTokens": 3,
              "totalTokens": 13,
            },
            "warnings": undefined,
          },
          {
            "finishReason": "stop",
            "logprobs": undefined,
            "providerMetadata": undefined,
            "response": {
              "headers": undefined,
              "id": "id-0",
              "modelId": "mock-model-id",
              "timestamp": 1970-01-01T00:00:00.000Z,
            },
            "type": "finish",
            "usage": {
              "completionTokens": 10,
              "promptTokens": 3,
              "totalTokens": 13,
            },
          },
        ]
      `);
    });
  });
});
