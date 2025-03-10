import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { generateText, streamText } from '../generate-text';
import { wrapLanguageModel } from '../middleware/wrap-language-model';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { extractReasoningMiddleware } from './extract-reasoning-middleware';

describe('extractReasoningMiddleware', () => {
  describe('wrapGenerate', () => {
    it('should extract reasoning from <think> tags', async () => {
      const mockModel = new MockLanguageModelV1({
        async doGenerate() {
          return {
            text: '<think>analyzing the request</think>Here is the response',
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 10 },
            rawCall: { rawPrompt: '', rawSettings: {} },
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
      const mockModel = new MockLanguageModelV1({
        async doGenerate() {
          return {
            text: '<think>analyzing the request\n</think>',
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 10 },
            rawCall: { rawPrompt: '', rawSettings: {} },
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
      const mockModel = new MockLanguageModelV1({
        async doGenerate() {
          return {
            text: '<think>analyzing the request</think>Here is the response<think>thinking about the response</think>more',
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 10 },
            rawCall: { rawPrompt: '', rawSettings: {} },
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
      const mockModel = new MockLanguageModelV1({
        async doGenerate() {
          return {
            text: 'analyzing the request</think>Here is the response',
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 10 },
            rawCall: { rawPrompt: '', rawSettings: {} },
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
      const mockModel = new MockLanguageModelV1({
        async doGenerate() {
          return {
            text: '<think>analyzing the request</think>Here is the response',
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 10 },
            rawCall: { rawPrompt: '', rawSettings: {} },
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
      const mockModel = new MockLanguageModelV1({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: '<thi' },
              { type: 'text-delta', textDelta: 'nk>ana' },
              { type: 'text-delta', textDelta: 'lyzing the request' },
              { type: 'text-delta', textDelta: '</thi' },
              { type: 'text-delta', textDelta: 'nk>Here' },
              { type: 'text-delta', textDelta: ' is the response' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: '', rawSettings: {} },
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

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          messageId: 'msg-0',
          request: {},
          type: 'step-start',
          warnings: [],
        },
        {
          type: 'reasoning',
          textDelta: 'ana',
        },
        {
          type: 'reasoning',
          textDelta: 'lyzing the request',
        },
        {
          type: 'text-delta',
          textDelta: 'Here',
        },
        {
          type: 'text-delta',
          textDelta: ' is the response',
        },
        {
          experimental_providerMetadata: undefined,
          providerMetadata: undefined,
          finishReason: 'stop',
          isContinued: false,
          logprobs: undefined,
          messageId: 'msg-0',
          request: {},
          response: {
            headers: undefined,
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          type: 'step-finish',
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
          warnings: undefined,
        },
        {
          experimental_providerMetadata: undefined,
          providerMetadata: undefined,
          finishReason: 'stop',
          logprobs: undefined,
          response: {
            headers: undefined,
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          type: 'finish',
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
        },
      ]);
    });

    it('should extract reasoning from single chunk with multiple <think> tags', async () => {
      const mockModel = new MockLanguageModelV1({
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
                type: 'text-delta',
                textDelta:
                  '<think>analyzing the request</think>Here is the response<think>thinking about the response</think>more',
              },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: '', rawSettings: {} },
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

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          messageId: 'msg-0',
          request: {},
          type: 'step-start',
          warnings: [],
        },
        {
          type: 'reasoning',
          textDelta: 'analyzing the request',
        },
        {
          type: 'text-delta',
          textDelta: 'Here is the response',
        },
        {
          type: 'reasoning',
          textDelta: '\nthinking about the response',
        },
        {
          type: 'text-delta',
          textDelta: '\nmore',
        },
        {
          experimental_providerMetadata: undefined,
          providerMetadata: undefined,
          finishReason: 'stop',
          isContinued: false,
          logprobs: undefined,
          messageId: 'msg-0',
          request: {},
          response: {
            headers: undefined,
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          type: 'step-finish',
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
          warnings: undefined,
        },
        {
          experimental_providerMetadata: undefined,
          providerMetadata: undefined,
          finishReason: 'stop',
          logprobs: undefined,
          response: {
            headers: undefined,
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          type: 'finish',
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
        },
      ]);
    });

    it('should extract reasoning from <think> when there is no text', async () => {
      const mockModel = new MockLanguageModelV1({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: '<think>' },
              { type: 'text-delta', textDelta: 'ana' },
              { type: 'text-delta', textDelta: 'lyzing the request\n' },
              { type: 'text-delta', textDelta: '</think>' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: '', rawSettings: {} },
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

      expect(
        await convertAsyncIterableToArray(result.fullStream),
      ).toStrictEqual([
        {
          messageId: 'msg-0',
          request: {},
          type: 'step-start',
          warnings: [],
        },
        {
          type: 'reasoning',
          textDelta: 'ana',
        },
        {
          type: 'reasoning',
          textDelta: 'lyzing the request\n',
        },
        {
          experimental_providerMetadata: undefined,
          providerMetadata: undefined,
          finishReason: 'stop',
          isContinued: false,
          logprobs: undefined,
          messageId: 'msg-0',
          request: {},
          response: {
            headers: undefined,
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          type: 'step-finish',
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
          warnings: undefined,
        },
        {
          experimental_providerMetadata: undefined,
          providerMetadata: undefined,
          finishReason: 'stop',
          logprobs: undefined,
          response: {
            headers: undefined,
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          type: 'finish',
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
        },
      ]);
    });

    it('should preprend <think> tag IFF startWithReasoning is true', async () => {
      const mockModel = new MockLanguageModelV1({
        async doStream() {
          return {
            stream: convertArrayToReadableStream([
              {
                type: 'response-metadata',
                id: 'id-0',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'text-delta', textDelta: 'ana' },
              { type: 'text-delta', textDelta: 'lyzing the request\n' },
              { type: 'text-delta', textDelta: '</think>' },
              { type: 'text-delta', textDelta: 'this is the response' },
              {
                type: 'finish',
                finishReason: 'stop',
                logprobs: undefined,
                usage: { completionTokens: 10, promptTokens: 3 },
              },
            ]),
            rawCall: { rawPrompt: '', rawSettings: {} },
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

      expect(
        await convertAsyncIterableToArray(resultTrue.fullStream),
      ).toStrictEqual([
        {
          messageId: 'msg-0',
          request: {},
          type: 'step-start',
          warnings: [],
        },
        {
          type: 'reasoning',
          textDelta: 'ana',
        },
        {
          type: 'reasoning',
          textDelta: 'lyzing the request\n',
        },
        {
          type: 'text-delta',
          textDelta: 'this is the response',
        },
        {
          experimental_providerMetadata: undefined,
          providerMetadata: undefined,
          finishReason: 'stop',
          isContinued: false,
          logprobs: undefined,
          messageId: 'msg-0',
          request: {},
          response: {
            headers: undefined,
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          type: 'step-finish',
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
          warnings: undefined,
        },
        {
          experimental_providerMetadata: undefined,
          providerMetadata: undefined,
          finishReason: 'stop',
          logprobs: undefined,
          response: {
            headers: undefined,
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          type: 'finish',
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
        },
      ]);

      expect(
        await convertAsyncIterableToArray(resultFalse.fullStream),
      ).toStrictEqual([
        {
          messageId: 'msg-0',
          request: {},
          type: 'step-start',
          warnings: [],
        },
        {
          type: 'text-delta',
          textDelta: 'ana',
        },
        {
          type: 'text-delta',
          textDelta: 'lyzing the request\n',
        },
        {
          type: 'text-delta',
          textDelta: '</think>',
        },
        {
          type: 'text-delta',
          textDelta: 'this is the response',
        },
        {
          experimental_providerMetadata: undefined,
          providerMetadata: undefined,
          finishReason: 'stop',
          isContinued: false,
          logprobs: undefined,
          messageId: 'msg-0',
          request: {},
          response: {
            headers: undefined,
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          type: 'step-finish',
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
          warnings: undefined,
        },
        {
          experimental_providerMetadata: undefined,
          providerMetadata: undefined,
          finishReason: 'stop',
          logprobs: undefined,
          response: {
            headers: undefined,
            id: 'id-0',
            modelId: 'mock-model-id',
            timestamp: new Date(0),
          },
          type: 'finish',
          usage: {
            completionTokens: 10,
            promptTokens: 3,
            totalTokens: 13,
          },
        },
      ]);
    });
  });
});
